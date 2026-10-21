"""Tests for the record history and audit log tools."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from catalogit_mcp import server

_RECORD_ID = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b"
_ACTOR = {
    "id": "a1",
    "email": "person@example.org",
    "first_name": "Ada",
    "last_name": "Lovelace",
    "display_name": None,
    "role": "editor",
}


def _page(items: list[dict]) -> dict:
    return {"items": items, "page": 1, "per_page": 50, "total_count": len(items), "total_pages": 1}


class RecordHistoryTest(unittest.IsolatedAsyncioTestCase):
    async def test_calls_history_endpoint_and_hides_private_fields(self) -> None:
        row = {
            "id": "e1",
            "table_name": "hardware_assets",
            "record_id": _RECORD_ID,
            "action": "UPDATE",
            "changed_by": _ACTOR,
            "timestamp": "2026-10-20T10:00:00Z",
            "old_values": {"status": "In stock", "imei": "111", "assigned_to": None},
            "new_values": {"status": "Assigned", "notes": "private", "assigned_to": "Ada Lovelace"},
        }
        api_get = AsyncMock(return_value=_page([row]))
        with patch.object(server, "_api_get", api_get):
            result = await server.get_record_history(None, "hardware", _RECORD_ID, page=2, per_page=10)

        api_get.assert_awaited_once_with(
            f"/api/history/hardware_assets/{_RECORD_ID}",
            params={"page": 2, "per_page": 10},
            ctx=None,
        )
        entry = result["entries"][0]
        self.assertEqual(entry["old_values"], {"status": "In stock"})
        self.assertEqual(entry["new_values"], {"status": "Assigned"})
        self.assertEqual(entry["changed_by"], {"id": "a1", "name": "Ada Lovelace"})

    async def test_rejects_unknown_record_type(self) -> None:
        with self.assertRaises(ValueError):
            await server.get_record_history(None, "users", _RECORD_ID)

    async def test_rejects_non_uuid_record_id(self) -> None:
        with self.assertRaises(ValueError):
            await server.get_record_history(None, "service", "../settings/audit-events")

    async def test_rejects_out_of_range_paging(self) -> None:
        with self.assertRaises(ValueError):
            await server.get_record_history(None, "service", _RECORD_ID, page=0)
        with self.assertRaises(ValueError):
            await server.get_record_history(None, "service", _RECORD_ID, per_page=101)


class AuditEventsTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_changed_field_names_without_values(self) -> None:
        row = {
            "id": "e1",
            "category": "data_change",
            "event_type": "UPDATE",
            "entity_table": "services",
            "entity_key": _RECORD_ID,
            "actor": {**_ACTOR, "display_name": "Ada"},
            "occurred_at": "2026-10-20T10:00:00Z",
            "summary": "services UPDATE",
            "details": {
                "old_values": {"name": "Old", "notes": "a"},
                "new_values": {"name": "New", "notes": "b"},
            },
            "request_id": "r1",
        }
        api_get = AsyncMock(return_value=_page([row]))
        with patch.object(server, "_api_get", api_get):
            result = await server.list_audit_events(None, category="data_change")

        api_get.assert_awaited_once_with(
            "/api/settings/audit-events",
            params={"page": 1, "per_page": 50, "category": "data_change"},
            ctx=None,
        )
        event = result["events"][0]
        self.assertEqual(event["changed_fields"], ["name"])
        self.assertEqual(event["actor"], {"id": "a1", "name": "Ada"})
        self.assertNotIn("details", event)

    async def test_other_categories_have_no_changed_fields(self) -> None:
        row = {"id": "e2", "category": "security", "event_type": "login_failure", "details": {"ip": "x"}}
        with patch.object(server, "_api_get", AsyncMock(return_value=_page([row]))):
            result = await server.list_audit_events(None)
        self.assertNotIn("changed_fields", result["events"][0])

    async def test_rejects_unknown_category(self) -> None:
        with self.assertRaises(ValueError):
            await server.list_audit_events(None, category="everything")


if __name__ == "__main__":
    unittest.main()
