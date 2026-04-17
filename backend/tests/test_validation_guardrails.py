from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace

from fastapi import HTTPException

from app.models.payment_method import PaymentMethod
from app.models.service import Service
from app.models.user import User
from app.models.vendor import Vendor
from app.routers.cost_records import create_cost_record
from app.routers.laptops import create_laptop
from app.routers.services import create_service
from app.schemas.cost_record import CostRecordCreate
from app.schemas.laptop import LaptopCreate
from app.schemas.service import ServiceCreate


class _FakeDb:
    def __init__(self, rows: dict[tuple[type[object], uuid.UUID], object] | None = None) -> None:
        self._rows = rows or {}
        self.added: list[object] = []

    async def get(self, model: type[object], row_id: uuid.UUID) -> object | None:
        return self._rows.get((model, row_id))

    async def scalar(self, _stmt: object) -> object | None:
        return None

    def add(self, row: object) -> None:
        self.added.append(row)

    async def flush(self) -> None:
        return None

    async def refresh(self, _row: object) -> None:
        return None


class ApiValidationGuardrailsTest(unittest.IsolatedAsyncioTestCase):
    async def test_service_create_rejects_unknown_vendor(self) -> None:
        vendor_id = uuid.uuid4()
        db = _FakeDb()

        with self.assertRaises(HTTPException) as exc:
            await create_service(
                ServiceCreate(name="Docs", vendor_id=vendor_id),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "Vendor not found")
        self.assertEqual(db.added, [])

    async def test_laptop_create_rejects_unknown_assignee(self) -> None:
        assignee_id = uuid.uuid4()
        db = _FakeDb()

        with self.assertRaises(HTTPException) as exc:
            await create_laptop(
                LaptopCreate(
                    serial_number="SN-404",
                    model_name="ThinkPad X1",
                    assigned_to_id=assignee_id,
                ),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "Assigned user not found")
        self.assertEqual(db.added, [])

    async def test_cost_record_create_rejects_unknown_payment_method(self) -> None:
        service_id = uuid.uuid4()
        payment_method_id = uuid.uuid4()
        db = _FakeDb(
            {
                (Service, service_id): SimpleNamespace(id=service_id, is_active=True),
            }
        )

        with self.assertRaises(HTTPException) as exc:
            await create_cost_record(
                service_id=service_id,
                body=CostRecordCreate(
                    fiscal_year=2025,
                    amount=1250.0,
                    record_type="actual",
                    payment_method_id=payment_method_id,
                ),
                user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "Payment method not found")
        self.assertEqual(db.added, [])
