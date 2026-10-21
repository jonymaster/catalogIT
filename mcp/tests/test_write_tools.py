"""Tests for the vendor, tag, and service write tools."""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from catalogit_mcp import server

_SERVICE_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b"
_VENDOR_ID = "11111111-2222-4333-8444-555555555555"
_TAG_A = "aaaaaaaa-0000-4000-8000-000000000001"
_TAG_B = "aaaaaaaa-0000-4000-8000-000000000002"
_TAG_C = "aaaaaaaa-0000-4000-8000-000000000003"


class VendorAndTagToolsTest(unittest.IsolatedAsyncioTestCase):
    async def test_create_vendor_posts_only_set_fields(self) -> None:
        api_write = AsyncMock(return_value={"id": _VENDOR_ID, "name": "Acme", "website": None, "notes": "x"})
        with patch.object(server, "_api_write", api_write):
            result = await server.create_vendor(None, "Acme")
        api_write.assert_awaited_once_with("POST", "/api/vendors/", {"name": "Acme"}, ctx=None)
        self.assertEqual(result, {"id": _VENDOR_ID, "name": "Acme", "website": None})

    async def test_create_vendor_rejects_blank_name(self) -> None:
        with self.assertRaises(ValueError):
            await server.create_vendor(None, "  ")

    async def test_update_vendor_patches_by_id(self) -> None:
        api_write = AsyncMock(return_value={"id": _VENDOR_ID, "name": "Acme Inc"})
        with patch.object(server, "_api_write", api_write):
            await server.update_vendor(None, _VENDOR_ID, name="Acme Inc")
        api_write.assert_awaited_once_with(
            "PATCH", f"/api/vendors/{_VENDOR_ID}", {"name": "Acme Inc"}, ctx=None
        )

    async def test_update_vendor_needs_a_change(self) -> None:
        with self.assertRaises(ValueError):
            await server.update_vendor(None, _VENDOR_ID)

    async def test_update_tag_rejects_bad_id(self) -> None:
        with self.assertRaises(ValueError):
            await server.update_tag(None, "../vendors", name="x")

    async def test_create_tag_returns_summary(self) -> None:
        api_write = AsyncMock(return_value={"id": _TAG_A, "name": "SaaS", "color": "blue"})
        with patch.object(server, "_api_write", api_write):
            result = await server.create_tag(None, "SaaS")
        api_write.assert_awaited_once_with("POST", "/api/tags/", {"name": "SaaS"}, ctx=None)
        self.assertEqual(result, {"id": _TAG_A, "name": "SaaS", "color": "blue"})


class ServiceToolsTest(unittest.IsolatedAsyncioTestCase):
    async def test_create_service_sends_typed_fields(self) -> None:
        api_write = AsyncMock(return_value={"id": _SERVICE_ID, "name": "Slack"})
        with patch.object(server, "_api_write", api_write):
            await server.create_service(
                None,
                "Slack",
                vendor_id=_VENDOR_ID,
                criticality="High",
                renewal_date="2027-01-31",
                tag_ids=[_TAG_A],
            )
        api_write.assert_awaited_once_with(
            "POST",
            "/api/services/",
            {
                "name": "Slack",
                "vendor_id": _VENDOR_ID,
                "criticality": "High",
                "renewal_date": "2027-01-31",
                "tag_ids": [_TAG_A],
            },
            ctx=None,
        )

    async def test_create_service_validates_locally(self) -> None:
        for kwargs in (
            {"criticality": "Urgent"},
            {"renewal_date": "31/01/2027"},
            {"total_seats": 0},
            {"vendor_id": "acme"},
        ):
            with self.subTest(**kwargs), self.assertRaises(ValueError):
                await server.create_service(None, "Slack", **kwargs)

    async def test_update_service_patches_only_given_fields(self) -> None:
        api_write = AsyncMock(return_value={"id": _SERVICE_ID, "name": "Slack"})
        api_get = AsyncMock()
        with patch.object(server, "_api_write", api_write), patch.object(server, "_api_get", api_get):
            await server.update_service(None, _SERVICE_ID, description="Team chat")
        api_get.assert_not_awaited()
        api_write.assert_awaited_once_with(
            "PATCH", f"/api/services/{_SERVICE_ID}", {"description": "Team chat"}, ctx=None
        )

    async def test_update_service_merges_tag_changes(self) -> None:
        current = {"id": _SERVICE_ID, "tags": [{"id": _TAG_A}, {"id": _TAG_B}]}
        api_get = AsyncMock(return_value=current)
        api_write = AsyncMock(return_value=current)
        with patch.object(server, "_api_write", api_write), patch.object(server, "_api_get", api_get):
            await server.update_service(
                None, _SERVICE_ID, add_tag_ids=[_TAG_C, _TAG_A], remove_tag_ids=[_TAG_B]
            )
        api_get.assert_awaited_once_with(f"/api/services/{_SERVICE_ID}", ctx=None)
        body = api_write.await_args.args[2]
        self.assertEqual(body, {"tag_ids": [_TAG_A, _TAG_C]})

    async def test_update_service_needs_a_change(self) -> None:
        with self.assertRaises(ValueError):
            await server.update_service(None, _SERVICE_ID)


class ToolAnnotationsTest(unittest.TestCase):
    def test_write_tools_are_marked_as_writes(self) -> None:
        tools = {tool.name: tool for tool in asyncio.run(server.mcp.list_tools())}
        for name in ("create_vendor", "update_vendor", "create_tag", "update_tag", "create_service", "update_service"):
            with self.subTest(tool=name):
                self.assertFalse(tools[name].annotations.readOnlyHint)
        for name in ("list_services", "get_record_history", "list_audit_events"):
            with self.subTest(tool=name):
                self.assertTrue(tools[name].annotations.readOnlyHint)


class ApiErrorTest(unittest.IsolatedAsyncioTestCase):
    async def _request_with_response(self, response: httpx.Response, method: str = "POST") -> str:
        client = MagicMock()
        client.request = AsyncMock(return_value=response)
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=None)
        with (
            patch.object(server, "_configuration", return_value="https://catalogit.test"),
            patch.object(server, "_api_token", return_value="token"),
            patch.object(server.httpx, "AsyncClient", return_value=client),
        ):
            with self.assertRaises(RuntimeError) as ctx:
                await server._api_request(method, "/api/vendors/", json={"name": "x"}, ctx=None)
        return str(ctx.exception)

    async def test_validation_errors_are_readable(self) -> None:
        response = httpx.Response(
            422, json={"detail": [{"loc": ["body", "name"], "msg": "Field required"}]}
        )
        message = await self._request_with_response(response)
        self.assertIn("name: Field required", message)

    async def test_forbidden_write_mentions_change(self) -> None:
        message = await self._request_with_response(httpx.Response(403, json={"detail": "Insufficient permissions"}))
        self.assertIn("do not allow this change", message)

    async def test_conflict_detail_is_passed_through(self) -> None:
        response = httpx.Response(409, json={"detail": "A vendor with this name already exists"})
        message = await self._request_with_response(response)
        self.assertIn("HTTP 409: A vendor with this name already exists", message)


if __name__ == "__main__":
    unittest.main()
