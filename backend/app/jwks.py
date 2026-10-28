"""Verify JWTs signed with keys from a JSON Web Key Set (OIDC providers, trusted token issuers)."""

from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Any

import jwt

_AT_HASH_DIGESTS = {"256": hashlib.sha256, "384": hashlib.sha384, "512": hashlib.sha512}


def unverified_claims(token: str) -> dict[str, Any]:
    """Return a token's claims without checking its signature. Raises jwt.PyJWTError if malformed."""
    return jwt.decode(token, options={"verify_signature": False})


def decode_with_jwks(
    token: str,
    jwks: dict[str, Any],
    *,
    algorithms: list[str],
    access_token: str | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Verify ``token`` against the matching key in ``jwks`` and return its claims.

    The key is chosen by the token's ``kid`` header; without one, each key is tried.
    When ``access_token`` is given and the token has an ``at_hash`` claim, the hash is
    checked as described in OpenID Connect Core 3.1.3.6. Extra keyword arguments go to
    ``jwt.decode`` (audience, issuer, options). Raises jwt.PyJWTError on any failure.
    """
    header = jwt.get_unverified_header(token)
    alg = header.get("alg")
    if alg not in algorithms:
        raise jwt.InvalidAlgorithmError(f"Algorithm {alg!r} is not allowed")
    kid = header.get("kid")
    keys = [key for key in jwt.PyJWKSet.from_dict(jwks).keys if kid is None or key.key_id == kid]
    if not keys:
        raise jwt.InvalidKeyError("No matching signing key in JWKS")

    claims: dict[str, Any] | None = None
    for key in keys:
        try:
            claims = jwt.decode(token, key, algorithms=algorithms, **kwargs)
            break
        except jwt.InvalidSignatureError:
            if key is keys[-1]:
                raise

    assert claims is not None
    if access_token and "at_hash" in claims:
        _verify_at_hash(claims["at_hash"], access_token, alg)
    return claims


def _verify_at_hash(at_hash: Any, access_token: str, alg: str) -> None:
    digest = _AT_HASH_DIGESTS.get(alg[-3:])
    if digest is None:
        raise jwt.InvalidTokenError(f"Cannot verify at_hash for algorithm {alg!r}")
    full = digest(access_token.encode("ascii")).digest()
    expected = base64.urlsafe_b64encode(full[: len(full) // 2]).rstrip(b"=").decode("ascii")
    if not isinstance(at_hash, str) or not hmac.compare_digest(at_hash, expected):
        raise jwt.InvalidTokenError("at_hash does not match the access token")
