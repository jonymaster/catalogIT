"""Unit tests for financial aggregate access (dashboard / costs)."""

from __future__ import annotations

import asyncio
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.dependencies.auth import ensure_financial_view_access


class EnsureFinancialViewAccessTest(unittest.TestCase):
    def test_admin_allowed_without_db_lookup(self) -> None:
        async def run() -> None:
            user = MagicMock()
            user.role = "admin"
            db = AsyncMock()
            await ensure_financial_view_access(user, db)
            db.execute.assert_not_called()

        asyncio.run(run())

    def test_editor_without_permission_row_403(self) -> None:
        async def run() -> None:
            user = MagicMock()
            user.id = uuid.uuid4()
            user.role = "editor"
            exec_result = MagicMock()
            exec_result.scalar_one_or_none.return_value = None
            db = AsyncMock()
            db.execute = AsyncMock(return_value=exec_result)
            with self.assertRaises(HTTPException) as ctx:
                await ensure_financial_view_access(user, db)
            self.assertEqual(ctx.exception.status_code, 403)

        asyncio.run(run())

    def test_editor_with_permission_row_ok(self) -> None:
        async def run() -> None:
            user = MagicMock()
            user.id = uuid.uuid4()
            user.role = "editor"
            exec_result = MagicMock()
            exec_result.scalar_one_or_none.return_value = object()
            db = AsyncMock()
            db.execute = AsyncMock(return_value=exec_result)
            await ensure_financial_view_access(user, db)

        asyncio.run(run())

    def test_unknown_role_403(self) -> None:
        async def run() -> None:
            user = MagicMock()
            user.role = "superuser"
            db = AsyncMock()
            with self.assertRaises(HTTPException) as ctx:
                await ensure_financial_view_access(user, db)
            self.assertEqual(ctx.exception.status_code, 403)
            db.execute.assert_not_called()

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
