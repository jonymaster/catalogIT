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

    def test_patch_preferences_rejects_excessive_ui_preferences_depth(self) -> None:
        nested: dict[str, object] = {}
        cursor = nested
        for index in range(10):
            child: dict[str, object] = {}
            cursor[f"level_{index}"] = child
            cursor = child

        response = self.client.patch(
            "/api/me/preferences",
            json={"ui_preferences": {"dashboard": nested}},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "UI preferences exceed maximum nesting depth",
        )
        self.assertEqual(self.db.flush_calls, 0)

    def test_patch_preferences_rejects_oversized_ui_preferences_payload(self) -> None:
        response = self.client.patch(
            "/api/me/preferences",
            json={
                "ui_preferences": {
                    "dashboard": {"notes": "x" * (70 * 1024)},
                }
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "UI preferences exceed maximum size",
        )
        self.assertEqual(self.db.flush_calls, 0)

    def test_patch_preferences_rejects_unknown_preference_sections(self) -> None:
        response = self.client.patch(
            "/api/me/preferences",
            json={"ui_preferences": {"unexpected": {"enabled": True}}},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Unknown UI preference sections: unexpected",
        )
        self.assertEqual(self.db.flush_calls, 0)
        self.assertIsNone(self.user.ui_preferences)

    def test_patch_preferences_null_section_unsets_existing_section(self) -> None:
        self.user.ui_preferences = {
            "dashboard": {"visible_widget_ids": ["inventory_stats"]},
            "service_list": {"visible_columns": ["name", "status"]},
        }

        response = self.client.patch(
            "/api/me/preferences",
            json={"ui_preferences": {"dashboard": None}},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["ui_preferences"],
            {
                "service_list": {"visible_columns": ["name", "status"]},
            },
        )
        self.assertEqual(
            self.user.ui_preferences,
            {
                "service_list": {"visible_columns": ["name", "status"]},
            },
        )


if __name__ == "__main__":
    unittest.main()
