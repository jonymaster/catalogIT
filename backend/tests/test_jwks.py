"""Unit tests for JWT verification against a JSON Web Key Set."""

from __future__ import annotations

import base64
import hashlib
import time
import unittest

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from app.jwks import decode_with_jwks, unverified_claims

_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ACCESS_TOKEN = "access-token-value"


def _jwk(private_key, kid: str) -> dict:
    return {**RSAAlgorithm.to_jwk(private_key.public_key(), as_dict=True), "alg": "RS256", "kid": kid}


JWKS = {"keys": [_jwk(_other_key, "old"), _jwk(_key, "current")]}


def _at_hash(value: str) -> str:
    digest = hashlib.sha256(value.encode()).digest()
    return base64.urlsafe_b64encode(digest[:16]).rstrip(b"=").decode()


def _token(*, kid: str | None = "current", signing_key=_key, **claims) -> str:
    payload = {"iss": "https://idp.example", "aud": "client", "exp": int(time.time()) + 300, **claims}
    headers = {"kid": kid} if kid else {}
    return jwt.encode(payload, signing_key, algorithm="RS256", headers=headers)


def _decode(token: str, **kwargs) -> dict:
    return decode_with_jwks(
        token, JWKS, algorithms=["RS256"], audience="client", issuer="https://idp.example", **kwargs
    )


class DecodeWithJwksTest(unittest.TestCase):
    def test_valid_token_returns_claims(self) -> None:
        self.assertEqual(_decode(_token(sub="u1"))["sub"], "u1")

    def test_token_without_kid_tries_each_key(self) -> None:
        self.assertEqual(_decode(_token(kid=None, sub="u1"))["sub"], "u1")

    def test_unknown_kid_rejects(self) -> None:
        with self.assertRaises(jwt.PyJWTError):
            _decode(_token(kid="missing"))

    def test_wrong_signing_key_rejects(self) -> None:
        with self.assertRaises(jwt.InvalidSignatureError):
            _decode(_token(signing_key=_other_key))

    def test_disallowed_algorithm_rejects(self) -> None:
        token = jwt.encode({"aud": "client"}, "a-shared-secret-that-is-long-enough!", algorithm="HS256")
        with self.assertRaises(jwt.InvalidAlgorithmError):
            _decode(token)

    def test_wrong_audience_rejects(self) -> None:
        with self.assertRaises(jwt.InvalidAudienceError):
            _decode(_token(aud="someone-else"))

    def test_matching_at_hash_passes(self) -> None:
        token = _token(at_hash=_at_hash(ACCESS_TOKEN))
        self.assertIn("at_hash", _decode(token, access_token=ACCESS_TOKEN))

    def test_mismatched_at_hash_rejects(self) -> None:
        token = _token(at_hash=_at_hash("another-access-token"))
        with self.assertRaises(jwt.InvalidTokenError):
            _decode(token, access_token=ACCESS_TOKEN)

    def test_at_hash_ignored_without_access_token(self) -> None:
        token = _token(at_hash=_at_hash("another-access-token"))
        self.assertIn("at_hash", _decode(token))

    def test_unverified_claims_reads_payload(self) -> None:
        self.assertEqual(unverified_claims(_token(kid=None, sub="u1"))["sub"], "u1")


if __name__ == "__main__":
    unittest.main()
