"""Unit tests for per-table access checks on /api/history/{table}/{id}."""

from __future__ import annotations

import asyncio
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.audit import AUDITED_TABLES
from app.routers import history
from app.routers.history import _ensure_history_access


def _user(role: str) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = role
    return user


def _db(*, has_permission: bool = False, cost_record: object | None = None) -> AsyncMock:
    """Session where every permission lookup returns has_permission."""
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = object() if has_permission else None
    db = AsyncMock()
    db.execute = AsyncMock(return_value=exec_result)
    db.get = AsyncMock(return_value=cost_record)
    return db


def _check(table: str, user: MagicMock, db: AsyncMock) -> int | None:
    """Return the HTTP status raised, or None when access is allowed."""

    async def run() -> int | None:
        try:
            await _ensure_history_access(table, uuid.uuid4(), user, db)
        except HTTPException as exc:
            return exc.status_code
        return None

    return asyncio.run(run())


class HistoryAccessTest(unittest.TestCase):
    def test_every_audited_table_has_an_access_rule(self) -> None:
        classified = (
            history._CATALOG_TABLES
            | history._HARDWARE_TABLES
            | history._FINANCIAL_TABLES
            | history._ADMIN_TABLES
        )
        self.assertEqual(AUDITED_TABLES - classified, set())

    def test_unknown_table_404(self) -> None:
        self.assertEqual(_check("global_audit_event", _user("admin"), _db()), 404)

    def test_catalog_table_open_to_viewer(self) -> None:
        self.assertIsNone(_check("services", _user("viewer"), _db()))

    def test_hardware_table_needs_hardware_view(self) -> None:
        self.assertEqual(_check("hardware_assets", _user("viewer"), _db()), 403)
        self.assertIsNone(_check("hardware_assets", _user("viewer"), _db(has_permission=True)))

    def test_cost_records_need_financial_view(self) -> None:
        self.assertEqual(_check("cost_records", _user("editor"), _db()), 403)

    def test_service_cost_record_with_financial_view_ok(self) -> None:
        record = MagicMock(hardware_id=None)
        db = _db(has_permission=True, cost_record=record)
        self.assertIsNone(_check("cost_records", _user("editor"), db))

    def test_hardware_cost_record_also_needs_hardware_view(self) -> None:
        record = MagicMock(hardware_id=uuid.uuid4())
        exec_result_yes = MagicMock()
        exec_result_yes.scalar_one_or_none.return_value = object()
        exec_result_no = MagicMock()
        exec_result_no.scalar_one_or_none.return_value = None
        db = _db(cost_record=record)
        # First lookup (financial_view) succeeds, second (hardware_view) fails.
        db.execute = AsyncMock(side_effect=[exec_result_yes, exec_result_no])
        self.assertEqual(_check("cost_records", _user("editor"), db), 403)

    def test_admin_tables_reject_editor(self) -> None:
        for table in ("users", "api_tokens", "integration_config", "oidc_config", "attachments"):
            with self.subTest(table=table):
                self.assertEqual(_check(table, _user("editor"), _db(has_permission=True)), 403)

    def test_admin_tables_allow_admin(self) -> None:
        self.assertIsNone(_check("api_tokens", _user("admin"), _db()))


if __name__ == "__main__":
    unittest.main()
