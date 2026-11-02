"""Tests for the service and hardware cost record tools."""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from catalogit_mcp import server

_SERVICE_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b"
_RECORD_ID = "0b8f8e7a-1c2d-4e3f-9a8b-7c6d5e4f3a2b"
_HARDWARE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
_PAYMENT_ID = "11111111-2222-4333-8444-555555555555"

_RECORD = {
    "id": _RECORD_ID,
    "service_id": _SERVICE_ID,
    "hardware_id": None,
    "payment_method_id": None,
    "payment_method_name": None,
    "fiscal_year": 2027,
    "purchase_year": None,
    "amount": 1200.0,
    "record_type": "budget",
    "notes": "private",
    "recorded_at": "2026-11-02T10:00:00Z",
    "recorded_by_id": "u1",
    "recorded_by_name": "Ada Lovelace",
}


class ServiceCostToolsTest(unittest.IsolatedAsyncioTestCase):
    async def test_create_sends_typed_fields_and_hides_notes(self) -> None:
        api_write = AsyncMock(return_value=_RECORD)
        with patch.object(server, "_api_write", api_write):
            result = await server.create_service_cost_record(
                None, _SERVICE_ID, 2027, 1200, " Budget ", payment_method_id=_PAYMENT_ID
            )
        api_write.assert_awaited_once_with(
            "POST",
            f"/api/services/{_SERVICE_ID}/cost-records/",
            {
                "fiscal_year": 2027,
                "amount": 1200,
                "record_type": "budget",
                "payment_method_id": _PAYMENT_ID,
            },
            ctx=None,
        )
        self.assertNotIn("notes", result)
        self.assertNotIn("recorded_by_name", result)
        self.assertEqual(result["record_type"], "budget")

    async def test_create_validates_locally(self) -> None:
        api_write = AsyncMock()
        cases = (
            (_SERVICE_ID, 2027, 100, "forecast", {}),
            (_SERVICE_ID, 1800, 100, "actual", {}),
            (_SERVICE_ID, 2027, -1, "actual", {}),
            (_SERVICE_ID, 2027, 100, "actual", {"purchase_year": 2200}),
            (_SERVICE_ID, 2027, 100, "actual", {"payment_method_id": "card"}),
            ("../users", 2027, 100, "actual", {}),
        )
        with patch.object(server, "_api_write", api_write):
            for service_id, year, amount, record_type, kwargs in cases:
                with self.subTest(year=year, amount=amount, record_type=record_type, **kwargs):
                    with self.assertRaises(ValueError):
                        await server.create_service_cost_record(
                            None, service_id, year, amount, record_type, **kwargs
                        )
        api_write.assert_not_awaited()

    async def test_update_sends_only_given_fields(self) -> None:
        api_write = AsyncMock(return_value=_RECORD)
        with patch.object(server, "_api_write", api_write):
            await server.update_service_cost_record(None, _SERVICE_ID, _RECORD_ID, amount=900)
        api_write.assert_awaited_once_with(
            "PUT",
            f"/api/services/{_SERVICE_ID}/cost-records/{_RECORD_ID}",
            {"amount": 900},
            ctx=None,
        )

    async def test_update_needs_a_change(self) -> None:
        with self.assertRaises(ValueError):
            await server.update_service_cost_record(None, _SERVICE_ID, _RECORD_ID)

    async def test_delete_calls_delete_endpoint(self) -> None:
        api_request = AsyncMock(return_value=None)
        with patch.object(server, "_api_request", api_request):
            result = await server.delete_service_cost_record(None, _SERVICE_ID, _RECORD_ID)
        api_request.assert_awaited_once_with(
            "DELETE", f"/api/services/{_SERVICE_ID}/cost-records/{_RECORD_ID}", ctx=None
        )
        self.assertEqual(result, {"deleted": True, "id": _RECORD_ID, "service_id": _SERVICE_ID})

    async def test_list_uses_shared_summary(self) -> None:
        api_get = AsyncMock(return_value=[_RECORD])
        with patch.object(server, "_api_get", api_get):
            result = await server.get_service_cost_records(None, _SERVICE_ID)
        self.assertEqual(result["cost_records"][0]["payment_method_id"], None)
        self.assertNotIn("notes", result["cost_records"][0])


class HardwareCostToolsTest(unittest.IsolatedAsyncioTestCase):
    _PATH = f"/api/hardware/{_HARDWARE_ID}/hardware-cost"
    _CURRENT = _RECORD | {"service_id": None, "hardware_id": _HARDWARE_ID, "purchase_year": 2024, "fiscal_year": 2024}

    async def test_get_returns_null_without_cost(self) -> None:
        with patch.object(server, "_api_get", AsyncMock(return_value=None)):
            result = await server.get_hardware_cost(None, _HARDWARE_ID)
        self.assertEqual(result, {"cost_record": None})

    async def test_set_keeps_current_years_when_omitted(self) -> None:
        api_get = AsyncMock(return_value=self._CURRENT)
        api_write = AsyncMock(return_value=self._CURRENT)
        with patch.object(server, "_api_get", api_get), patch.object(server, "_api_write", api_write):
            await server.set_hardware_cost(None, _HARDWARE_ID, 1500)
        api_get.assert_awaited_once_with(self._PATH, ctx=None)
        api_write.assert_awaited_once_with(
            "PUT", self._PATH, {"amount": 1500, "purchase_year": 2024, "fiscal_year": 2024}, ctx=None
        )

    async def test_set_without_existing_cost_lets_api_default_years(self) -> None:
        api_get = AsyncMock(return_value=None)
        api_write = AsyncMock(return_value=self._CURRENT)
        with patch.object(server, "_api_get", api_get), patch.object(server, "_api_write", api_write):
            await server.set_hardware_cost(None, _HARDWARE_ID, 1500)
        api_write.assert_awaited_once_with("PUT", self._PATH, {"amount": 1500}, ctx=None)

    async def test_set_with_both_years_skips_read(self) -> None:
        api_get = AsyncMock()
        api_write = AsyncMock(return_value=self._CURRENT)
        with patch.object(server, "_api_get", api_get), patch.object(server, "_api_write", api_write):
            await server.set_hardware_cost(None, _HARDWARE_ID, 1500, purchase_year=2025, fiscal_year=2026)
        api_get.assert_not_awaited()
        api_write.assert_awaited_once_with(
            "PUT", self._PATH, {"amount": 1500, "purchase_year": 2025, "fiscal_year": 2026}, ctx=None
        )

    async def test_set_rejects_zero_and_bad_years(self) -> None:
        for kwargs in ({"amount": 0}, {"amount": -5}, {"amount": 10, "purchase_year": 1700}):
            with self.subTest(**kwargs), self.assertRaises(ValueError):
                await server.set_hardware_cost(None, _HARDWARE_ID, **kwargs)

    async def test_delete_without_cost_does_not_write(self) -> None:
        api_write = AsyncMock()
        with patch.object(server, "_api_get", AsyncMock(return_value=None)), patch.object(server, "_api_write", api_write):
            result = await server.delete_hardware_cost(None, _HARDWARE_ID)
        api_write.assert_not_awaited()
        self.assertEqual(result, {"deleted": False, "hardware_id": _HARDWARE_ID})

    async def test_delete_sends_zero_amount(self) -> None:
        api_write = AsyncMock(return_value=None)
        with patch.object(server, "_api_get", AsyncMock(return_value=self._CURRENT)), patch.object(server, "_api_write", api_write):
            result = await server.delete_hardware_cost(None, _HARDWARE_ID)
        api_write.assert_awaited_once_with("PUT", self._PATH, {"amount": 0}, ctx=None)
        self.assertEqual(result, {"deleted": True, "hardware_id": _HARDWARE_ID})


class PaymentMethodsAndHistoryTest(unittest.IsolatedAsyncioTestCase):
    async def test_list_payment_methods_filters_by_name(self) -> None:
        rows = [{"id": "p1", "name": "Company card", "notes": "x"}, {"id": "p2", "name": "Invoice"}]
        with patch.object(server, "_api_get", AsyncMock(return_value=rows)):
            result = await server.list_payment_methods(None, query="card")
        self.assertEqual(result["payment_methods"], [{"id": "p1", "name": "Company card"}])

    async def test_cost_record_history_uses_cost_records_table(self) -> None:
        payload = {"items": [], "page": 1, "total_pages": 0, "total_count": 0}
        api_get = AsyncMock(return_value=payload)
        with patch.object(server, "_api_get", api_get):
            await server.get_record_history(None, "cost_record", _RECORD_ID)
        self.assertEqual(api_get.await_args.args[0], f"/api/history/cost_records/{_RECORD_ID}")


class ApiResponseTest(unittest.IsolatedAsyncioTestCase):
    async def _request(self, response: httpx.Response):
        client = MagicMock()
        client.request = AsyncMock(return_value=response)
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=None)
        with (
            patch.object(server, "_configuration", return_value="https://catalogit.test"),
            patch.object(server, "_api_token", return_value="token"),
            patch.object(server.httpx, "AsyncClient", return_value=client),
        ):
            return await server._api_request("DELETE", "/api/x", ctx=None)

    async def test_no_content_returns_none(self) -> None:
        self.assertIsNone(await self._request(httpx.Response(204)))

    async def test_archived_conflict_is_passed_through(self) -> None:
        response = httpx.Response(409, json={"detail": "Archived services are read-only for cost records"})
        with self.assertRaises(RuntimeError) as ctx:
            await self._request(response)
        self.assertIn("HTTP 409: Archived services are read-only for cost records", str(ctx.exception))


class CostToolAnnotationsTest(unittest.TestCase):
    def test_cost_tools_are_annotated(self) -> None:
        tools = {tool.name: tool for tool in asyncio.run(server.mcp.list_tools())}
        for name in ("get_hardware_cost", "list_payment_methods", "get_service_cost_records"):
            with self.subTest(tool=name):
                self.assertTrue(tools[name].annotations.readOnlyHint)
        for name in (
            "create_service_cost_record",
            "update_service_cost_record",
            "set_hardware_cost",
            "delete_service_cost_record",
            "delete_hardware_cost",
        ):
            with self.subTest(tool=name):
                self.assertFalse(tools[name].annotations.readOnlyHint)
        for name in ("delete_service_cost_record", "delete_hardware_cost"):
            with self.subTest(tool=name):
                self.assertTrue(tools[name].annotations.destructiveHint)
                self.assertFalse(tools[name].annotations.idempotentHint)


if __name__ == "__main__":
    unittest.main()
