"""Unit tests for externally issued access tokens (MCP OAuth via a trusted issuer)."""

from __future__ import annotations

import asyncio
import time
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt

from app.models.trusted_token_issuer import TrustedTokenIssuer
from app.services import trusted_token_issuer as issuer_module
from app.services.trusted_token_issuer import authenticate_trusted_issuer_token

ISSUER = "https://team.cloudflareaccess.com"
AUDIENCE = "aud-tag-123"
KID = "test-key"

_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_PRIVATE_PEM = _private_key.private_bytes(
    serialization.Encoding.PEM,
    serialization.PrivateFormat.PKCS8,
    serialization.NoEncryption(),
).decode()
_PUBLIC_PEM = _private_key.public_key().public_bytes(
    serialization.Encoding.PEM,
    serialization.PublicFormat.SubjectPublicKeyInfo,
).decode()
JWKS = {"keys": [{**jwk.construct(_PUBLIC_PEM, "RS256").to_dict(), "kid": KID}]}


def _token(**overrides) -> str:
    claims = {
        "iss": ISSUER,
        "aud": [AUDIENCE],
        "email": "Person@Example.org",
        "exp": int(time.time()) + 300,
        **overrides,
    }
    return jwt.encode(claims, _PRIVATE_PEM, algorithm="RS256", headers={"kid": KID})


def _config(**overrides) -> TrustedTokenIssuer:
    values = {
        "issuer_url": ISSUER,
        "jwks_url": f"{ISSUER}/cdn-cgi/access/certs",
        "audience": AUDIENCE,
        "email_claim": "email",
        "enabled": True,
        **overrides,
    }
    return TrustedTokenIssuer(id=1, **values)


def _db(config: TrustedTokenIssuer | None, user=None) -> AsyncMock:
    db = AsyncMock()
    db.get = AsyncMock(return_value=config)
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    db.execute = AsyncMock(return_value=result)
    return db


def _user(active: bool = True) -> MagicMock:
    user = MagicMock()
    user.is_active = active
    return user


class AuthenticateTrustedIssuerTokenTest(unittest.TestCase):
    def setUp(self) -> None:
        patcher = patch.object(issuer_module, "fetch_jwks", AsyncMock(return_value=JWKS))
        self.fetch_jwks = patcher.start()
        self.addCleanup(patcher.stop)

    def _run(self, token: str, db: AsyncMock):
        return asyncio.run(authenticate_trusted_issuer_token(token, db))

    def test_valid_token_returns_matching_active_user(self) -> None:
        user = _user()
        db = _db(_config(), user)
        self.assertIs(self._run(_token(), db), user)
        db.execute.assert_awaited_once()

    def test_trailing_slash_on_issuer_is_ignored(self) -> None:
        user = _user()
        self.assertIs(self._run(_token(), _db(_config(issuer_url=ISSUER + "/"), user)), user)

    def test_disabled_config_rejects(self) -> None:
        self.assertIsNone(self._run(_token(), _db(_config(enabled=False), _user())))
        self.fetch_jwks.assert_not_called()

    def test_missing_config_rejects(self) -> None:
        self.assertIsNone(self._run(_token(), _db(None)))

    def test_other_issuer_rejects_without_fetching_keys(self) -> None:
        token = _token(iss="https://attacker.example.com")
        self.assertIsNone(self._run(token, _db(_config(), _user())))
        self.fetch_jwks.assert_not_called()

    def test_wrong_audience_rejects(self) -> None:
        self.assertIsNone(self._run(_token(aud=["other-app"]), _db(_config(), _user())))

    def test_expired_token_rejects(self) -> None:
        self.assertIsNone(self._run(_token(exp=int(time.time()) - 60), _db(_config(), _user())))

    def test_token_without_exp_rejects(self) -> None:
        claims = {"iss": ISSUER, "aud": AUDIENCE, "email": "person@example.org"}
        token = jwt.encode(claims, _PRIVATE_PEM, algorithm="RS256", headers={"kid": KID})
        self.assertIsNone(self._run(token, _db(_config(), _user())))

    def test_token_signed_by_unknown_key_rejects(self) -> None:
        other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        other_pem = other.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode()
        claims = {"iss": ISSUER, "aud": AUDIENCE, "email": "person@example.org", "exp": int(time.time()) + 300}
        token = jwt.encode(claims, other_pem, algorithm="RS256", headers={"kid": KID})
        self.assertIsNone(self._run(token, _db(_config(), _user())))

    def test_symmetric_token_is_ignored(self) -> None:
        token = jwt.encode({"iss": ISSUER, "aud": AUDIENCE}, "secret", algorithm="HS256")
        self.assertIsNone(self._run(token, _db(_config(), _user())))
        self.fetch_jwks.assert_not_called()

    def test_inactive_user_rejects(self) -> None:
        self.assertIsNone(self._run(_token(), _db(_config(), _user(active=False))))

    def test_unknown_user_rejects(self) -> None:
        self.assertIsNone(self._run(_token(), _db(_config(), None)))

    def test_missing_email_claim_rejects(self) -> None:
        db = _db(_config(email_claim="upn"), _user())
        self.assertIsNone(self._run(_token(), db))
        db.execute.assert_not_called()

    def test_unknown_kid_forces_one_refetch(self) -> None:
        self.fetch_jwks.side_effect = [{"keys": []}, JWKS]
        user = _user()
        self.assertIs(self._run(_token(), _db(_config(), user)), user)
        self.assertEqual(self.fetch_jwks.await_count, 2)


if __name__ == "__main__":
    unittest.main()
