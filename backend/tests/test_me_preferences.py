from __future__ import annotations

import unittest
import uuid
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies.auth import get_current_user
from app.dependencies.db import get_audited_db
from app.models.user import User
from app.routers import me


class _FakeDb:
    def __init__(self, user: User):
        self.user = user
        self.flush_calls = 0
        self.refresh_calls = 0

    async def get(self, model, row_id):
        if model is User and row_id == self.user.id:
            return self.user
        return None

    async def flush(self) -> None:
        self.flush_calls += 1

    async def refresh(self, _user: User) -> None:
        self.refresh_calls += 1


def _make_user(**overrides) -> User:
    data = {
        "id": uuid.uuid4(),
        "external_id": "oidc|me-preferences",
        "email": "me@example.com",
        "first_name": "Mina",
        "last_name": "Example",
        "display_name": None,
        "department": None,
        "locale": None,
        "timezone": None,
        "theme": "light",
        "ui_preferences": None,
        "is_active": True,
        "receive_renewal_notifications": True,
        "role": "viewer",
        "must_reset_password": False,
        "provisioning_source": "local",
    }
    data.update(overrides)
    return User(**data)


class MePreferencesRouterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.user = _make_user()
        self.db = _FakeDb(self.user)
        app = FastAPI()
        app.include_router(me.router)

        async def override_current_user() -> User:
            return self.user

        async def override_db() -> AsyncGenerator[_FakeDb, None]:
            yield self.db

        app.dependency_overrides[get_current_user] = override_current_user
        app.dependency_overrides[get_audited_db] = override_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def test_get_preferences_includes_empty_ui_preferences_object(self) -> None:
        response = self.client.get("/api/me/preferences")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "locale": None,
                "timezone": None,
                "theme": "light",
                "ui_preferences": {},
            },
        )

    def test_patch_preferences_deep_merges_ui_preferences(self) -> None:
        self.user.ui_preferences = {
            "dashboard": {"visible_widget_ids": ["inventory", "financial_kpis"]},
            "service_list": {
                "visible_columns": ["name", "status"],
                "filters": {"status": ["Active"]},
            },
        }

        response = self.client.patch(
            "/api/me/preferences",
            json={
                "timezone": " Europe/Madrid ",
                "ui_preferences": {
                    "service_list": {
                        "sort": {"key": "renewal_date", "direction": "desc"},
                    }
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["ui_preferences"],
            {
                "dashboard": {
                    "visible_widget_ids": ["inventory", "financial_kpis"],
                },
                "service_list": {
                    "visible_columns": ["name", "status"],
                    "filters": {"status": ["Active"]},
                    "sort": {"key": "renewal_date", "direction": "desc"},
                },
            },
        )
        self.assertEqual(self.user.timezone, "Europe/Madrid")
        self.assertEqual(
            self.user.ui_preferences,
            {
                "dashboard": {
                    "visible_widget_ids": ["inventory", "financial_kpis"],
                },
                "service_list": {
                    "visible_columns": ["name", "status"],
                    "filters": {"status": ["Active"]},
                    "sort": {"key": "renewal_date", "direction": "desc"},
                },
            },
        )
        self.assertEqual(self.db.flush_calls, 1)
        self.assertEqual(self.db.refresh_calls, 1)

    def test_patch_preferences_can_clear_ui_preferences(self) -> None:
        self.user.ui_preferences = {"dashboard": {"visible_widget_ids": ["inventory"]}}

        response = self.client.patch(
            "/api/me/preferences",
            json={"ui_preferences": None},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ui_preferences"], {})
        self.assertEqual(self.user.ui_preferences, {})


if __name__ == "__main__":
    unittest.main()
