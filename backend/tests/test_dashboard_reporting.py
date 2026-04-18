"""Reporting-focused tests for the dashboard payload."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
import unittest
import uuid
from unittest.mock import MagicMock

from app.routers.dashboard import get_dashboard


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


class DashboardReportingPayloadTest(unittest.TestCase):
    def test_dashboard_rows_include_stable_ids_and_existing_dimensions(self) -> None:
        service_id = uuid.uuid4()
        laptop_id = uuid.uuid4()
        category_id = uuid.uuid4()
        vendor_id = uuid.uuid4()
        cost_center_id = uuid.uuid4()
        classification_id = uuid.uuid4()
        service_record_id = uuid.uuid4()
        hardware_record_id = uuid.uuid4()
        owner_id = uuid.uuid4()

        service_record = SimpleNamespace(
            id=service_record_id,
            service_id=service_id,
            laptop_id=None,
            fiscal_year=2026,
            purchase_year=2025,
            amount=1450.75,
            record_type="actual",
            notes="Renewal booked",
        )
        hardware_record = SimpleNamespace(
            id=hardware_record_id,
            service_id=None,
            laptop_id=laptop_id,
            fiscal_year=2025,
            purchase_year=2024,
            amount=2200,
            record_type="budget",
            notes=None,
        )
        service = SimpleNamespace(
            id=service_id,
            name="Email Suite",
            category_id=category_id,
            vendor=SimpleNamespace(id=vendor_id, name="Microsoft"),
            cost_center=SimpleNamespace(id=cost_center_id, name="Finance"),
            service_classification=SimpleNamespace(
                id=classification_id,
                slug="core_saas",
                name="Core SaaS",
            ),
            subcategory="Collaboration",
            environment="Production",
            owners=[SimpleNamespace(id=owner_id, department="IT Operations")],
        )
        laptop = SimpleNamespace(
            id=laptop_id,
            model_name="MacBook Pro",
            serial_number="SN-42",
        )
        category = SimpleNamespace(id=category_id, name="Productivity")
        db = _FakeDb(
            [
                [service_record, hardware_record],
                [service],
                [laptop],
                [category],
            ]
        )

        payload = asyncio.run(get_dashboard(_user=MagicMock(), db=db))

        self.assertEqual(payload.fiscal_years, [2025, 2026])
        self.assertEqual(len(payload.cost_records), 2)

        service_row = next(
            row for row in payload.cost_records if row.cost_record_id == str(service_record_id)
        )
        self.assertEqual(service_row.service_id, str(service_id))
        self.assertIsNone(service_row.laptop_id)
        self.assertEqual(service_row.purchase_year, 2025)
        self.assertEqual(service_row.vendor_id, str(vendor_id))
        self.assertEqual(service_row.vendor_name, "Microsoft")
        self.assertEqual(service_row.category_id, str(category_id))
        self.assertEqual(service_row.category_name, "Productivity")
        self.assertEqual(service_row.cost_center_id, str(cost_center_id))
        self.assertEqual(service_row.cost_center_name, "Finance")
        self.assertEqual(service_row.subcategory_name, "Collaboration")
        self.assertEqual(service_row.environment_name, "Production")
        self.assertEqual(service_row.team_name, "IT Operations")
        self.assertEqual(service_row.classification_id, str(classification_id))
        self.assertEqual(service_row.classification, "core_saas")
        self.assertEqual(service_row.classification_name, "Core SaaS")

        hardware_row = next(
            row for row in payload.cost_records if row.cost_record_id == str(hardware_record_id)
        )
        self.assertIsNone(hardware_row.service_id)
        self.assertEqual(hardware_row.laptop_id, str(laptop_id))
        self.assertEqual(hardware_row.purchase_year, 2024)
        self.assertEqual(hardware_row.category_name, "Hardware")
        self.assertEqual(hardware_row.classification, "hardware")
        self.assertEqual(hardware_row.classification_name, "Hardware")
        self.assertIsNone(hardware_row.subcategory_name)
        self.assertIsNone(hardware_row.environment_name)
        self.assertIsNone(hardware_row.team_name)
        self.assertIsNone(hardware_row.vendor_id)
        self.assertIsNone(hardware_row.vendor_name)
        self.assertIsNone(hardware_row.cost_center_id)


if __name__ == "__main__":
    unittest.main()
