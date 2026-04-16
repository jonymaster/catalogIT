"""Tests for admin bulk export (Download All)."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.routers import admin_export
from app.services.admin_export_bundle import _csv_text, _load_service_rows
from app.services.admin_export_seed_json import build_seed_json_files


class _FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeExecuteResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalarResult(self._rows)


class _FakeDb:
    def __init__(self, rows_per_execute):
        self._rows_per_execute = rows_per_execute
        self._idx = 0

    async def execute(self, _stmt):
        rows = self._rows_per_execute[self._idx]
        self._idx += 1
        return _FakeExecuteResult(rows)


class AdminExportCsvTest(unittest.TestCase):
    def test_csv_includes_utf8_bom(self) -> None:
        text = _csv_text([["a"]], ["h"])
        self.assertTrue(text.startswith("\ufeff"))

    def test_service_csv_includes_description_column(self) -> None:
        classification_id = uuid.uuid4()
        service = SimpleNamespace(
            id=uuid.uuid4(),
            name="Email Suite",
            description="Corporate email and calendar",
            status="Active",
            billing_schedule="yearly",
            renewal_date=None,
            yearly_cost=None,
            sso_integrated=True,
            point_of_contact=None,
            notes=None,
            owners=[],
            assignees=[],
            total_seats=None,
            vendor=None,
            category_rel=None,
            cost_center=None,
            payment_method=None,
            service_status=None,
            classification_id=classification_id,
            service_classification=None,
            scim_enabled=None,
            criticality=None,
            nonprofit_pricing=False,
            is_active=False,
            renewal_reminders_enabled=True,
            renewal_offsets_days=None,
            deprecated_at=datetime(2026, 4, 1, 9, 30, 0),
            created_at=datetime(2026, 1, 1, 12, 0, 0),
            updated_at=datetime(2026, 4, 2, 8, 0, 0),
        )
        db = _FakeDb([[service]])

        headers, rows = asyncio.run(_load_service_rows(db))

        self.assertIn("description", headers)
        desc_idx = headers.index("description")
        self.assertEqual(rows[0][desc_idx], "Corporate email and calendar")
        self.assertIn("classification_id", headers)
        classification_id_idx = headers.index("classification_id")
        self.assertEqual(rows[0][classification_id_idx], str(classification_id))
        self.assertIn("is_active", headers)
        self.assertIn("deprecated_at", headers)


class AdminExportSeedJsonTest(unittest.TestCase):
    def test_services_seed_json_includes_description_and_archived_fields(self) -> None:
        service_id = uuid.uuid4()
        classification_id = uuid.uuid4()
        hardware_status_id = uuid.uuid4()
        hardware_location_id = uuid.uuid4()
        service = SimpleNamespace(
            id=service_id,
            name="CRM",
            description="Customer relationship platform",
            status="Archived",
            billing_schedule="monthly",
            vendor_id=None,
            category_id=None,
            payment_method_id=None,
            cost_center_id=None,
            classification_id=classification_id,
            owners=[],
            assignees=[],
            service_classification=None,
            scim_enabled=None,
            criticality=None,
            nonprofit_pricing=False,
            is_active=False,
            deprecated_at=datetime(2026, 3, 15, 10, 0, 0),
            renewal_date=None,
            renewal_reminders_enabled=True,
            renewal_offsets_days=None,
            total_seats=None,
            point_of_contact=None,
            notes=None,
        )
        laptop = SimpleNamespace(
            id=uuid.uuid4(),
            serial_number="SN-100",
            model_name="ThinkPad",
            cpu="M3",
            ram="16GB",
            storage_size="512GB",
            status="Assigned",
            hardware_status_id=hardware_status_id,
            hardware_location_id=hardware_location_id,
            assigned_to_id=None,
            notes=None,
            is_active=False,
            archived_at=datetime(2026, 3, 20, 8, 0, 0),
            created_at=datetime(2026, 1, 10, 10, 0, 0),
            updated_at=datetime(2026, 4, 10, 10, 0, 0),
        )
        hardware_status = SimpleNamespace(
            id=hardware_status_id,
            name="Assigned",
            description="Issued to user",
            color="blue",
        )
        hardware_location = SimpleNamespace(
            id=hardware_location_id,
            name="HQ",
            description="Main office",
        )
        # execute() call order follows build_seed_json_files queries:
        # vendors, categories, payment methods, cost centers, service statuses,
        # service classifications, hardware statuses, hardware locations, users,
        # services, laptops, cost records, history
        db = _FakeDb(
            [
                [],
                [],
                [],
                [],
                [],
                [],
                [hardware_status],
                [hardware_location],
                [],
                [service],
                [laptop],
                [],
                [],
            ]
        )

        files = asyncio.run(build_seed_json_files(db))
        services = json.loads(files["data/seed-json/services.json"])
        hardware_statuses = json.loads(files["data/seed-json/hardware_statuses.json"])
        hardware_locations = json.loads(files["data/seed-json/hardware_locations.json"])
        laptops = json.loads(files["data/seed-json/laptops.json"])

        self.assertEqual(len(services), 1)
        exported = services[0]
        self.assertEqual(exported["id"], str(service_id))
        self.assertEqual(exported["description"], "Customer relationship platform")
        self.assertEqual(exported["classification_id"], str(classification_id))
        self.assertFalse(exported["is_active"])
        self.assertEqual(exported["deprecated_at"], "2026-03-15T10:00:00")
        self.assertEqual(hardware_statuses[0]["id"], str(hardware_status_id))
        self.assertEqual(hardware_locations[0]["id"], str(hardware_location_id))
        self.assertEqual(laptops[0]["hardware_status_id"], str(hardware_status_id))
        self.assertEqual(laptops[0]["hardware_location_id"], str(hardware_location_id))


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
