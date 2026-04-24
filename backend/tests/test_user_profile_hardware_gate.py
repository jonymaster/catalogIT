"""Ensure the user profile endpoint hides assigned_laptops when caller lacks hardware_view."""

from __future__ import annotations

import asyncio
import unittest
import uuid
from datetime import datetime
from types import SimpleNamespace

from app.routers.user_directory import get_user_profile


class _FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeExecuteResult:
    def __init__(self, *, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = rows or []

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return _FakeScalarResult(self._rows)


class _FakeDb:
    def __init__(self, results):
        self._results = list(results)

    async def execute(self, _stmt):
        return self._results.pop(0)


def _fake_user(user_id: uuid.UUID) -> SimpleNamespace:
    return SimpleNamespace(
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
        permission_rows=[],
    )


class ProfileHardwareGateTest(unittest.TestCase):
    def test_profile_hides_assigned_laptops_when_no_hardware_view(self) -> None:
        async def run() -> None:
            user_id = uuid.uuid4()
            # Three execute() calls expected when hardware_view is False:
            # user load, owned services, assigned services.
            db = _FakeDb(
                [
                    _FakeExecuteResult(scalar=_fake_user(user_id)),
                    _FakeExecuteResult(rows=[]),
                    _FakeExecuteResult(rows=[]),
                ]
            )

            profile = await get_user_profile(
                user_id,
                _current_user=SimpleNamespace(id=uuid.uuid4(), role="viewer"),
                has_hardware_view=False,
                db=db,
            )

            self.assertEqual(profile.assigned_laptops, [])

        asyncio.run(run())

    def test_profile_includes_assigned_laptops_when_has_hardware_view(self) -> None:
        async def run() -> None:
            user_id = uuid.uuid4()
            laptop = SimpleNamespace(
                id=uuid.uuid4(),
                model_name="ThinkPad",
                serial_number="SN-42",
                status="Assigned",
                is_active=True,
                hardware_location=SimpleNamespace(name="HQ"),
            )
            # Four execute() calls when hardware_view is True.
            db = _FakeDb(
                [
                    _FakeExecuteResult(scalar=_fake_user(user_id)),
                    _FakeExecuteResult(rows=[]),
                    _FakeExecuteResult(rows=[]),
                    _FakeExecuteResult(rows=[laptop]),
                ]
            )

            profile = await get_user_profile(
                user_id,
                _current_user=SimpleNamespace(id=uuid.uuid4(), role="viewer"),
                has_hardware_view=True,
                db=db,
            )

            self.assertEqual(len(profile.assigned_laptops), 1)
            self.assertEqual(profile.assigned_laptops[0].serial_number, "SN-42")

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
