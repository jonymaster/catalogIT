from __future__ import annotations

from collections.abc import AsyncGenerator
from types import SimpleNamespace
import unittest
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.db import get_audited_db
from app.models.cost_record import CostRecord
from app.models.laptop import Laptop
from app.models.service import Service
from app.routers import cost_records, laptop_cost_records, laptops, services


class _ValidationDb:
    def __init__(
        self,
        *,
        laptop: SimpleNamespace | None = None,
        service: SimpleNamespace | None = None,
        cost_record: SimpleNamespace | None = None,
    ) -> None:
        self._rows: dict[tuple[type[object], uuid.UUID], object] = {}
        if laptop is not None:
            self._rows[(Laptop, laptop.id)] = laptop
        if service is not None:
            self._rows[(Service, service.id)] = service
        if cost_record is not None:
            self._rows[(CostRecord, cost_record.id)] = cost_record

    async def get(self, model: type[object], row_id: uuid.UUID) -> object | None:
        return self._rows.get((model, row_id))

    async def scalar(self, _stmt: object) -> object | None:
        return None

    async def flush(self) -> None:
        for row in self._rows.values():
            if isinstance(row, SimpleNamespace) and getattr(row, "billing_schedule", "") is None:
                raise IntegrityError("UPDATE services", {}, None)
            if isinstance(row, SimpleNamespace) and hasattr(row, "fiscal_year") and row.fiscal_year is None:
                raise IntegrityError("UPDATE cost_records", {}, None)
            if isinstance(row, SimpleNamespace) and hasattr(row, "amount") and row.amount is None:
                raise IntegrityError("UPDATE cost_records", {}, None)
            if isinstance(row, SimpleNamespace) and hasattr(row, "record_type") and row.record_type is None:
                raise IntegrityError("UPDATE cost_records", {}, None)

    async def refresh(self, _row: object) -> None:
        return None


def _build_client(db: _ValidationDb, router) -> TestClient:
    app = FastAPI()
    app.include_router(router)

    async def override_current_user() -> SimpleNamespace:
        # Admin bypasses financial_view / hardware_view permission lookups.
        return SimpleNamespace(id=uuid.uuid4(), role="admin")

    async def override_db() -> AsyncGenerator[_ValidationDb, None]:
        yield db

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_audited_db] = override_db
    app.dependency_overrides[get_db] = override_db
    return TestClient(app, raise_server_exceptions=False)


class UpdatePayloadValidationTest(unittest.TestCase):
    def test_laptop_update_rejects_null_serial_number(self) -> None:
        laptop_id = uuid.uuid4()
        db = _ValidationDb(
            laptop=SimpleNamespace(
                id=laptop_id,
                is_active=True,
                status="In Stock",
            )
        )
        client = _build_client(db, laptops.router)

        response = client.put(f"/api/laptops/{laptop_id}", json={"serial_number": None})

        self.assertEqual(response.status_code, 422)
        client.close()

    def test_laptop_update_rejects_null_model_name(self) -> None:
        laptop_id = uuid.uuid4()
        db = _ValidationDb(
            laptop=SimpleNamespace(
                id=laptop_id,
                is_active=True,
                status="In Stock",
            )
        )
        client = _build_client(db, laptops.router)

        response = client.put(f"/api/laptops/{laptop_id}", json={"model_name": None})

        self.assertEqual(response.status_code, 422)
        client.close()

    def test_service_cost_record_update_rejects_null_non_nullable_fields(self) -> None:
        service_id = uuid.uuid4()
        record_id = uuid.uuid4()
        db = _ValidationDb(
            service=SimpleNamespace(
                id=service_id,
                is_active=True,
            ),
            cost_record=SimpleNamespace(
                id=record_id,
                service_id=service_id,
                laptop_id=None,
                fiscal_year=2025,
                amount=150.0,
                record_type="actual",
            ),
        )
        client = _build_client(db, cost_records.router)

        for payload in (
            {"fiscal_year": None},
            {"amount": None},
            {"record_type": None},
        ):
            with self.subTest(payload=payload):
                response = client.put(
                    f"/api/services/{service_id}/cost-records/{record_id}",
                    json=payload,
                )
                self.assertEqual(response.status_code, 422)

        client.close()

    def test_laptop_cost_record_update_rejects_null_non_nullable_fields(self) -> None:
        laptop_id = uuid.uuid4()
        record_id = uuid.uuid4()
        db = _ValidationDb(
            laptop=SimpleNamespace(
                id=laptop_id,
                is_active=True,
                status="In Stock",
            ),
            cost_record=SimpleNamespace(
                id=record_id,
                service_id=None,
                laptop_id=laptop_id,
                fiscal_year=2025,
                amount=150.0,
                record_type="actual",
            ),
        )
        client = _build_client(db, laptop_cost_records.router)

        for payload in (
            {"fiscal_year": None},
            {"amount": None},
            {"record_type": None},
        ):
            with self.subTest(payload=payload):
                response = client.put(
                    f"/api/laptops/{laptop_id}/cost-records/{record_id}",
                    json=payload,
                )
                self.assertEqual(response.status_code, 422)

        client.close()


if __name__ == "__main__":
    unittest.main()
