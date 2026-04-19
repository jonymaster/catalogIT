from __future__ import annotations

import unittest
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

from app.routers.cost_records import to_cost_record_read
from app.schemas.cost_record import CostRecordRead


class CostRecordRouterTest(unittest.TestCase):
    def test_to_cost_record_read_returns_cost_record_payload(self) -> None:
        record_id = uuid.uuid4()
        service_id = uuid.uuid4()
        payment_method_id = uuid.uuid4()
        recorded_by_id = uuid.uuid4()
        recorded_at = datetime.now(timezone.utc)
        record = SimpleNamespace(
            id=record_id,
            service_id=service_id,
            laptop_id=None,
            payment_method_id=payment_method_id,
            fiscal_year=2025,
            purchase_year=2024,
            amount=1250.0,
            record_type="actual",
            notes="Annual renewal",
            recorded_at=recorded_at,
            recorded_by_id=recorded_by_id,
            recorded_by=SimpleNamespace(first_name="Ada", last_name="Lovelace"),
        )

        item = to_cost_record_read(record)

        self.assertIsInstance(item, CostRecordRead)
        self.assertEqual(item.id, record_id)
        self.assertEqual(item.service_id, service_id)
        self.assertEqual(item.payment_method_id, payment_method_id)
        self.assertEqual(item.payment_method_name, None)
        self.assertEqual(item.recorded_by_name, "Ada Lovelace")
