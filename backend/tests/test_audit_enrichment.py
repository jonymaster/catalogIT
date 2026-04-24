import unittest
import uuid
from decimal import Decimal
from types import SimpleNamespace

from app.audit_enrichment import (
    entity_audit_context_from_values,
    entity_audit_context_sync,
    finalize_details_sync,
)
from app.models.laptop import Laptop
from app.models.service import Service


class _FakeSession:
    def __init__(self, rows=None):
        self.rows = rows or {}

    def get(self, model, key):
        return self.rows.get((model, key))


class AuditEntityContextTest(unittest.TestCase):
    def test_service_context_includes_name_and_type(self) -> None:
        service_id = uuid.uuid4()
        service = SimpleNamespace(
            __tablename__="services",
            id=service_id,
            name="CRM",
            status="active",
        )

        entity = entity_audit_context_sync(_FakeSession(), service)

        self.assertEqual(entity["type"], "service")
        self.assertEqual(entity["id"], str(service_id))
        self.assertEqual(entity["name"], "CRM")
        self.assertNotIn("key", entity)
        self.assertNotIn("table", entity)
        self.assertNotIn("label", entity)

    def test_cost_record_context_includes_parent_service(self) -> None:
        service_id = uuid.uuid4()
        record_id = uuid.uuid4()
        service = SimpleNamespace(
            __tablename__="services",
            id=service_id,
            name="Design Tool",
            status="active",
        )
        record = SimpleNamespace(
            __tablename__="cost_records",
            id=record_id,
            service_id=service_id,
            laptop_id=None,
            fiscal_year=2026,
            purchase_year=None,
            record_type="actual",
            amount=Decimal("1200.00"),
        )

        entity = entity_audit_context_sync(
            _FakeSession({(Service, service_id): service}),
            record,
        )

        self.assertEqual(entity["type"], "cost_record")
        self.assertEqual(entity["id"], str(record_id))
        self.assertEqual(entity["amount"], "1200.00")
        self.assertEqual(entity["service_id"], str(service_id))
        self.assertEqual(entity["parent"]["type"], "service")
        self.assertEqual(entity["parent"]["name"], "Design Tool")
        self.assertNotIn("label", entity["parent"])

    def test_cost_record_context_includes_parent_hardware(self) -> None:
        laptop_id = uuid.uuid4()
        laptop = SimpleNamespace(
            __tablename__="laptops",
            id=laptop_id,
            model_name="MacBook Pro",
            serial_number="C02TEST",
            status="Assigned",
        )
        record = SimpleNamespace(
            __tablename__="cost_records",
            id=uuid.uuid4(),
            service_id=None,
            laptop_id=laptop_id,
            fiscal_year=2026,
            purchase_year=2026,
            record_type="actual",
            amount=Decimal("2500.00"),
        )

        entity = entity_audit_context_sync(
            _FakeSession({(Laptop, laptop_id): laptop}),
            record,
        )

        self.assertEqual(entity["parent"]["type"], "hardware")
        self.assertEqual(entity["parent"]["label"], "MacBook Pro (C02TEST)")
        self.assertEqual(entity["parent"]["serial_number"], "C02TEST")
        self.assertNotIn("key", entity["parent"])

    def test_finalize_keeps_existing_entity_and_sets_legacy_label(self) -> None:
        service = SimpleNamespace(
            __tablename__="services",
            id=uuid.uuid4(),
            name="CRM",
            status="active",
        )

        out = finalize_details_sync(
            _FakeSession(),
            {"action": "UPDATE", "entity": {"label": "Custom"}},
            None,
            service,
        )

        self.assertEqual(out["entity"], {"label": "Custom"})
        self.assertEqual(out["entity_label"], "CRM")

    def test_manual_event_context_uses_explicit_values(self) -> None:
        entity = entity_audit_context_from_values(
            entity_table="users",
            entity_key=str(uuid.uuid4()),
            entity_label="alex@example.com",
        )

        self.assertEqual(entity["type"], "user")
        self.assertEqual(entity["label"], "alex@example.com")


if __name__ == "__main__":
    unittest.main()
