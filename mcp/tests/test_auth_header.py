"""Tests for choosing the credential forwarded to the CatalogIT API."""

from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from catalogit_mcp import server


def _ctx(headers: dict[str, str] | None):
    request = SimpleNamespace(headers=headers) if headers is not None else None
    return SimpleNamespace(request_context=SimpleNamespace(request=request))


class ApiTokenTest(unittest.TestCase):
    def setUp(self) -> None:
        env = patch.dict(os.environ, {"CATALOGIT_TRANSPORT": "streamable-http"})
        env.start()
        self.addCleanup(env.stop)

    def test_bearer_token_is_forwarded(self) -> None:
        with patch.object(server, "_MCP_IDENTITY_HEADER", ""):
            self.assertEqual(server._api_token(_ctx({"authorization": "Bearer abc"})), "abc")

    def test_identity_header_takes_precedence_over_bearer(self) -> None:
        headers = {"authorization": "Bearer opaque", "cf-access-jwt-assertion": "signed.jwt.value"}
        with patch.object(server, "_MCP_IDENTITY_HEADER", "cf-access-jwt-assertion"):
            self.assertEqual(server._api_token(_ctx(headers)), "signed.jwt.value")

    def test_identity_header_ignored_when_not_configured(self) -> None:
        headers = {"authorization": "Bearer abc", "cf-access-jwt-assertion": "signed.jwt.value"}
        with patch.object(server, "_MCP_IDENTITY_HEADER", ""):
            self.assertEqual(server._api_token(_ctx(headers)), "abc")

    def test_falls_back_to_bearer_when_identity_header_missing(self) -> None:
        with patch.object(server, "_MCP_IDENTITY_HEADER", "cf-access-jwt-assertion"):
            self.assertEqual(server._api_token(_ctx({"authorization": "Bearer abc"})), "abc")

    def test_http_without_credentials_fails(self) -> None:
        with patch.object(server, "_MCP_IDENTITY_HEADER", ""):
            with self.assertRaises(RuntimeError):
                server._api_token(_ctx({}))

    def test_http_never_uses_environment_token(self) -> None:
        with patch.dict(os.environ, {"CATALOGIT_API_TOKEN": "env-token"}):
            with self.assertRaises(RuntimeError):
                server._api_token(_ctx({}))


if __name__ == "__main__":
    unittest.main()
