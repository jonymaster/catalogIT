from __future__ import annotations

import asyncio
from datetime import datetime
from types import SimpleNamespace
import unittest
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.dependencies.auth import get_current_user
from app.dependencies.db import get_audited_db
from app.routers import user_directory
from app.routers.user_directory import _apply_directory_search, get_user_profile
from app.models.user import User


class _FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeExecuteResult:
    def __init__(self, *, rows=None, scalar=None):
        self._rows = rows or []
        self._scalar = scalar

    def scalar_one(self):
        return self._scalar

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return _FakeScalarResult(self._rows)


class _FakeDb:
    def __init__(self, responses):
        self._responses = list(responses)

    async def execute(self, _stmt):
        return self._responses.pop(0)


class UserDirectorySearchTest(unittest.TestCase):
    def test_blank_query_leaves_statement_unfiltered(self) -> None:
        stmt = _apply_directory_search(select(User), "   ")
        compiled = stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
        sql = str(compiled).lower()
        self.assertNotIn(" where ", sql)

    def test_query_filters_across_directory_fields(self) -> None:
        stmt = _apply_directory_search(select(User), "Alice")
        compiled = stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
        sql = str(compiled).lower()
        self.assertIn("lower(users.email)", sql)
        self.assertIn("lower(users.first_name)", sql)
        self.assertIn("lower(users.last_name)", sql)
        self.assertIn("lower(coalesce(users.display_name", sql)
        self.assertIn("lower(coalesce(users.department", sql)
        self.assertIn("%alice%", sql)

    def test_query_escapes_like_metacharacters(self) -> None:
        stmt = _apply_directory_search(select(User), r"50%_off")
        compiled = stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
        sql = str(compiled).lower()

        self.assertIn(r" escape '\\'", sql)
        self.assertIn(r"50\\%%\\_off", sql)


class UserProfileRouteTest(unittest.TestCase):
    def test_profile_includes_owned_services_assigned_services_and_laptops(self) -> None:
        async def run() -> None:
            user_id = uuid.uuid4()
            user = SimpleNamespace(
                id=user_id,
                external_id="user-1",
                email="alex@example.com",
                first_name="Alex",
                last_name="Morgan",
                display_name="Alex Morgan",
                department="IT",
                locale="en-US",
                timezone="Europe/Madrid",
                is_active=True,
                receive_renewal_notifications=True,
                role="viewer",
                provisioning_source="local",
                created_at=datetime(2026, 1, 1, 10, 0, 0),
                updated_at=datetime(2026, 4, 1, 11, 0, 0),
                permission_rows=[SimpleNamespace(permission="financial_view")],
            )
            owned_service = SimpleNamespace(
                id=uuid.uuid4(),
                name="Email Suite",
                status="Active",
                is_active=True,
                category_rel=SimpleNamespace(name="Core SaaS"),
            )
            assigned_service = SimpleNamespace(
                id=uuid.uuid4(),
                name="Support Desk",
                status="Active",
                is_active=True,
                category_rel=None,
            )
            assigned_laptop = SimpleNamespace(
                id=uuid.uuid4(),
                model_name="ThinkPad X1",
                serial_number="SN-100",
                status="Assigned",
                is_active=True,
                hardware_location=SimpleNamespace(name="HQ"),
            )
            db = _FakeDb(
                [
                    _FakeExecuteResult(scalar=user),
                    _FakeExecuteResult(rows=[owned_service]),
                    _FakeExecuteResult(rows=[assigned_service]),
                    _FakeExecuteResult(rows=[assigned_laptop]),
                ]
            )

            profile = await get_user_profile(
                user_id,
                _current_user=SimpleNamespace(id=uuid.uuid4(), role="viewer"),
                db=db,
            )

            self.assertEqual(profile.user.email, "alex@example.com")
            self.assertEqual(profile.user.permissions, ["financial_view"])
            self.assertEqual(profile.owned_services[0].name, "Email Suite")
            self.assertEqual(profile.owned_services[0].category_name, "Core SaaS")
            self.assertEqual(profile.assigned_services[0].name, "Support Desk")
            self.assertIsNone(profile.assigned_services[0].category_name)
            self.assertEqual(profile.assigned_laptops[0].serial_number, "SN-100")
            self.assertEqual(profile.assigned_laptops[0].hardware_location_name, "HQ")

        asyncio.run(run())


class UserProfileRouteValidationTest(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        app.include_router(user_directory.router)

        async def override_current_user():
            return SimpleNamespace(id=uuid.uuid4(), role="viewer")

        async def override_db():
            yield _FakeDb([])

        app.dependency_overrides[get_current_user] = override_current_user
        app.dependency_overrides[get_audited_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def test_profile_rejects_invalid_uuid_path_param(self) -> None:
        response = self.client.get("/api/users/not-a-uuid/profile")

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
