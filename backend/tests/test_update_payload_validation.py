from __future__ import annotations

from collections.abc import AsyncGenerator
from types import SimpleNamespace
import unittest
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.dependencies.auth import get_current_user
from app.dependencies.db import get_audited_db
from app.models.laptop import Laptop
from app.models.service import Service
from app.routers import laptops, services


class _ValidationDb:
    def __init__(
        self,
        *,
        laptop: SimpleNamespace | None = None,
        service: SimpleNamespace | None = None,
    ) -> None:
        self._rows: dict[tuple[type[object], uuid.UUID], object] = {}
        if laptop is not None:
            self._rows[(Laptop, laptop.id)] = laptop
        if service is not None:
            self._rows[(Service, service.id)] = service

    async def get(self, model: type[object], row_id: uuid.UUID) -> object | None:
        return self._rows.get((model, row_id))

    async def scalar(self, _stmt: object) -> object | None:
        return None

    async def flush(self) -> None:
        for row in self._rows.values():
            if isinstance(row, SimpleNamespace) and getattr(row, "billing_schedule", "") is None:
                raise IntegrityError("UPDATE services", {}, None)

    async def refresh(self, _row: object) -> None:
        return None


def _build_client(db: _ValidationDb, router) -> TestClient:
    app = FastAPI()
    app.include_router(router)

    async def override_current_user() -> SimpleNamespace:
        return SimpleNamespace(id=uuid.uuid4(), role="editor")

    async def override_db() -> AsyncGenerator[_ValidationDb, None]:
        yield db

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_audited_db] = override_db
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

    def test_service_update_rejects_null_billing_schedule(self) -> None:
        service_id = uuid.uuid4()
        db = _ValidationDb(
            service=SimpleNamespace(
                id=service_id,
                is_active=True,
                status="Contract",
                billing_schedule="monthly",
                assignees=[],
                total_seats=None,
            )
        )
        client = _build_client(db, services.router)

        response = client.put(
            f"/api/services/{service_id}",
            json={"billing_schedule": None},
        )

        self.assertEqual(response.status_code, 422)
        client.close()


if __name__ == "__main__":
    unittest.main()
