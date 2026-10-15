"""Validate access tokens issued by an admin-configured external issuer.

This lets OAuth-capable MCP clients (Claude, ChatGPT) act as an existing CatalogIT
user. The issuer is "bring your own": Cloudflare Access Managed OAuth, an Okta
custom authorization server, or any issuer that signs JWTs with a published JWKS.
Tokens never create users; the configured claim must match an active user's email.
"""

from __future__ import annotations

import logging
import time
from typing import Any
from urllib.parse import urlsplit

import httpx
from jose import JWTError, jwt
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.trusted_token_issuer import TrustedTokenIssuer
from app.models.user import User

logger = logging.getLogger(__name__)

_ALGORITHMS = ["RS256", "ES256"]
_JWKS_TTL_SECONDS = 600
# Minimum age before an unknown `kid` may force a refetch (limits key-rotation probing).
_JWKS_REFRESH_MIN_SECONDS = 60
_jwks_cache: dict[str, tuple[float, dict[str, Any]]] = {}


class IssuerConfigError(Exception):
    """The issuer configuration cannot be used to validate tokens."""


def normalize_issuer(value: str) -> str:
    return value.strip().rstrip("/")


def require_https_url(value: str, field: str) -> None:
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise IssuerConfigError(f"{field} must be an https:// URL")


async def resolve_jwks_url(config: TrustedTokenIssuer) -> str:
    if config.jwks_url.strip():
        return config.jwks_url.strip()
    discovery_url = normalize_issuer(config.issuer_url) + "/.well-known/openid-configuration"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(discovery_url)
    except httpx.HTTPError as exc:
        raise IssuerConfigError(f"Could not fetch {discovery_url}: {exc}") from exc
    if resp.status_code != 200:
        raise IssuerConfigError(f"HTTP {resp.status_code} from {discovery_url}; set the JWKS URL explicitly")
    jwks_uri = resp.json().get("jwks_uri", "")
    if not jwks_uri:
        raise IssuerConfigError("Discovery document has no jwks_uri; set the JWKS URL explicitly")
    return jwks_uri


async def fetch_jwks(jwks_url: str, *, force: bool = False) -> dict[str, Any]:
    cached = _jwks_cache.get(jwks_url)
    now = time.monotonic()
    if cached and not force and now - cached[0] < _JWKS_TTL_SECONDS:
        return cached[1]
    if cached and force and now - cached[0] < _JWKS_REFRESH_MIN_SECONDS:
        return cached[1]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(jwks_url)
    except httpx.HTTPError as exc:
        raise IssuerConfigError(f"Could not fetch JWKS: {exc}") from exc
    if resp.status_code != 200:
        raise IssuerConfigError(f"HTTP {resp.status_code} from JWKS URL")
    data = resp.json()
    if not isinstance(data, dict) or not isinstance(data.get("keys"), list):
        raise IssuerConfigError("JWKS response has no keys array")
    jwks = {"keys": data["keys"]}
    _jwks_cache[jwks_url] = (now, jwks)
    return jwks


def _has_kid(jwks: dict[str, Any], kid: str | None) -> bool:
    return kid is None or any(key.get("kid") == kid for key in jwks["keys"])


async def authenticate_trusted_issuer_token(raw_token: str, db: AsyncSession) -> User | None:
    """Return the active user for a valid external token, or None if it does not apply or fails."""
    try:
        header = jwt.get_unverified_header(raw_token)
        unverified = jwt.get_unverified_claims(raw_token)
    except JWTError:
        return None
    if header.get("alg") not in _ALGORITHMS:
        return None

    config = await db.get(TrustedTokenIssuer, 1)
    if config is None or not config.enabled or not config.issuer_url or not config.audience:
        return None
    issuer = normalize_issuer(config.issuer_url)
    token_issuer = unverified.get("iss")
    if not isinstance(token_issuer, str) or normalize_issuer(token_issuer) != issuer:
        return None

    try:
        jwks_url = await resolve_jwks_url(config)
        jwks = await fetch_jwks(jwks_url)
        if not _has_kid(jwks, header.get("kid")):
            jwks = await fetch_jwks(jwks_url, force=True)
        claims = jwt.decode(
            raw_token,
            jwks,
            algorithms=_ALGORITHMS,
            audience=config.audience.strip(),
            issuer=token_issuer,
            options={"require_exp": True, "require_iat": False, "verify_at_hash": False},
        )
    except IssuerConfigError as exc:
        logger.warning("Trusted token issuer unavailable: %s", exc)
        return None
    except JWTError as exc:
        logger.info("Trusted issuer token rejected: %s", exc)
        return None

    email = claims.get(config.email_claim or "email")
    if not isinstance(email, str) or not email.strip():
        logger.info("Trusted issuer token has no %r claim", config.email_claim)
        return None

    result = await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        logger.info("Trusted issuer token does not match an active CatalogIT user")
        return None
    return user
