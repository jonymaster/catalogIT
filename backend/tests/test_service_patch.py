"""Tests for partial service updates through PATCH /api/services/{id}."""

from __future__ import annotations

import asyncio
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import HTTPException

from app.routers import services
from app.schemas.service import ServiceUpdate


def _service(**overrides) -> SimpleNamespace:
    fields = {
        "id": uuid.uuid4(),
        "name": "Slack",
        "description": "Chat",
        "environment": "Production",
        "notes": "Keep",
        "is_active": True,
        "total_seats": None,
        "assignees": [],
        "yearly_cost": None,
    }
    fields.update(overrides)
    return SimpleNamespace(**fields)


def _db(service: SimpleNamespace | None) -> AsyncMock:
    db = AsyncMock()
    db.get = AsyncMock(return_value=service)
    return db


def _patch(service: SimpleNamespace | None, body: ServiceUpdate):
    return asyncio.run(
        services.update_service(
            service.id if service else uuid.uuid4(),
            body,
            _user=SimpleNamespace(role="editor"),
            has_financial_view=True,
            db=_db(service),
        )
    )


class ServicePatchRouteTest(unittest.TestCase):
    def test_patch_and_put_share_the_update_handler(self) -> None:
        methods = {
            method
            for route in services.router.routes
            if getattr(route, "path", None) == "/api/services/{service_id}"
            and getattr(route, "endpoint", None) is services.update_service
            for method in route.methods
        }
        self.assertTrue({"PATCH", "PUT"} <= methods)


class ServicePartialUpdateTest(unittest.TestCase):
    def test_only_fields_in_body_change(self) -> None:
        service = _service()
        _patch(service, ServiceUpdate(description="Team chat"))
        self.assertEqual(service.description, "Team chat")
        self.assertEqual(service.name, "Slack")
        self.assertEqual(service.environment, "Production")
        self.assertEqual(service.notes, "Keep")

    def test_missing_service_404(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            _patch(None, ServiceUpdate(description="x"))
        self.assertEqual(ctx.exception.status_code, 404)

    def test_archived_service_rejects_other_fields(self) -> None:
        service = _service(is_active=False)
        with self.assertRaises(HTTPException) as ctx:
            _patch(service, ServiceUpdate(name="Renamed"))
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(service.name, "Slack")


if __name__ == "__main__":
    unittest.main()
