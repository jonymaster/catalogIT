"""Tests for admin bulk export (Download All)."""

from __future__ import annotations

import unittest
import uuid
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.routers import admin_export
from app.services.admin_export_bundle import _csv_text


class AdminExportCsvTest(unittest.TestCase):
    def test_csv_includes_utf8_bom(self) -> None:
        text = _csv_text([["a"]], ["h"])
        self.assertTrue(text.startswith("\ufeff"))


class AdminExportAuthTest(unittest.TestCase):
    def test_create_job_requires_admin(self) -> None:
        app = FastAPI()
        app.include_router(admin_export.router)

        async def viewer() -> MagicMock:
            u = MagicMock()
            u.id = uuid.uuid4()
            u.role = "viewer"
            return u

        app.dependency_overrides[get_current_user] = viewer
        client = TestClient(app)
        r = client.post("/api/admin/export-jobs/", json={"include_attachments": False})
        self.assertEqual(r.status_code, 403)
        app.dependency_overrides.clear()


if __name__ == "__main__":
    unittest.main()
