from __future__ import annotations

import unittest
import uuid
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.laptop import Laptop
from app.models.payment_method import PaymentMethod
from app.models.service import Service
from app.models.user import User
from app.routers.cost_records import create_cost_record, to_cost_record_read
from app.routers.laptops import create_laptop
from app.routers.services import create_service
from app.schemas.cost_record import CostRecordCreate
from app.schemas.laptop import LaptopCreate
from app.schemas.service import ServiceCreate


class _FakeDb:
    def __init__(
        self,
        rows: dict[tuple[type[object], uuid.UUID], object] | None = None,
        *,
        flush_error: Exception | None = None,
    ) -> None:
        self._rows = rows or {}
        self.added: list[object] = []
        self.flush_error = flush_error

    async def get(self, model: type[object], row_id: uuid.UUID) -> object | None:
        return self._rows.get((model, row_id))

    async def scalar(self, _stmt: object) -> object | None:
        return None

    def add(self, row: object) -> None:
        self.added.append(row)

    async def flush(self) -> None:
        if self.flush_error is not None:
            raise self.flush_error
        return None

    async def refresh(self, _row: object) -> None:
        return None


class ApiValidationGuardrailsTest(unittest.IsolatedAsyncioTestCase):
    def test_laptop_model_uses_case_insensitive_serial_unique_index(self) -> None:
        index = next(
            (
                candidate
                for candidate in Laptop.__table__.indexes
                if candidate.name == "uq_laptops_serial_number_lower"
            ),
            None,
        )

        self.assertIsNotNone(index)
        self.assertTrue(index.unique)
        self.assertIn("lower", str(index.expressions[0]).lower())

    async def test_service_create_requires_at_least_one_owner(self) -> None:
        db = _FakeDb()

        with self.assertRaises(HTTPException) as exc:
            await create_service(
                ServiceCreate(name="Docs"),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "At least one owner is required")
        self.assertEqual(db.added, [])

    async def test_service_create_rejects_unknown_vendor(self) -> None:
        vendor_id = uuid.uuid4()
        owner_id = uuid.uuid4()
        db = _FakeDb(
            {
                (User, owner_id): SimpleNamespace(id=owner_id),
            }
        )

        with self.assertRaises(HTTPException) as exc:
            await create_service(
                ServiceCreate(name="Docs", owner_ids=[owner_id], vendor_id=vendor_id),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "Vendor not found")
        self.assertEqual(db.added, [])

    async def test_service_create_rejects_unknown_contract(self) -> None:
        owner_id = uuid.uuid4()
        contract_id = uuid.uuid4()
        db = _FakeDb(
            {
                (User, owner_id): SimpleNamespace(id=owner_id),
            }
        )

        with self.assertRaises(HTTPException) as exc:
            await create_service(
                ServiceCreate(
                    name="Contracts",
                    owner_ids=[owner_id],
                    contract_id=contract_id,
                ),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "Contract not found")
        self.assertEqual(db.added, [])

    async def test_service_create_rejects_unknown_status_name(self) -> None:
        owner_id = uuid.uuid4()
        db = _FakeDb(
            {
                (User, owner_id): SimpleNamespace(id=owner_id),
            }
        )

        with self.assertRaises(HTTPException) as exc:
            await create_service(
                ServiceCreate(
                    name="Unknown Status",
                    owner_ids=[owner_id],
                    status="Nonexistent",
                ),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "Service status not found")
        self.assertEqual(db.added, [])

    async def test_service_create_rejects_unknown_related_service(self) -> None:
        owner_id = uuid.uuid4()
        related_service_id = uuid.uuid4()
        db = _FakeDb(
            {
                (User, owner_id): SimpleNamespace(id=owner_id),
            }
        )

        with self.assertRaises(HTTPException) as exc:
            await create_service(
                ServiceCreate(
                    name="Related",
                    owner_ids=[owner_id],
                    related_service_ids=[related_service_id],
                ),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(
            exc.exception.detail,
            f"Related service {related_service_id} not found",
        )
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

    async def test_laptop_create_rejects_unknown_status_name(self) -> None:
        db = _FakeDb()

        with self.assertRaises(HTTPException) as exc:
            await create_laptop(
                LaptopCreate(
                    serial_number="SN-405",
                    model_name="ThinkPad X1",
                    status="Not A Real Status",
                ),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(exc.exception.detail, "Hardware status not found")
        self.assertEqual(db.added, [])

    async def test_laptop_create_maps_duplicate_serial_integrity_error_to_400(self) -> None:
        db = _FakeDb(
            flush_error=IntegrityError(
                "INSERT INTO laptops ...",
                {},
                Exception(
                    'duplicate key value violates unique constraint "uq_laptops_serial_number_lower"',
                ),
            ),
        )

        with self.assertRaises(HTTPException) as exc:
            await create_laptop(
                LaptopCreate(
                    serial_number="SN-404",
                    model_name="ThinkPad X1",
                ),
                _user=SimpleNamespace(id=uuid.uuid4()),
                db=db,
            )

        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(
            exc.exception.detail,
            "A laptop with this serial number already exists",
        )

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

    def test_to_cost_record_read_returns_serializable_schema(self) -> None:
        record = SimpleNamespace(
            id=uuid.uuid4(),
            service_id=uuid.uuid4(),
            laptop_id=None,
            payment_method_id=None,
            fiscal_year=2025,
            purchase_year=2024,
            amount=99.5,
            record_type="actual",
            notes="Annual true-up",
            recorded_at="2025-01-01T00:00:00Z",
            recorded_by_id=uuid.uuid4(),
            recorded_by=SimpleNamespace(first_name="Ava", last_name="Ng"),
        )

        row = to_cost_record_read(record)

        self.assertEqual(row.recorded_by_name, "Ava Ng")
        self.assertEqual(row.amount, 99.5)
