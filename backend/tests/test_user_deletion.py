"""Unit tests for user DELETE blocking and service assignee/owner removal."""

from __future__ import annotations

import asyncio
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock

from fastapi import HTTPException

from app.routers.services import remove_service_assignee, remove_service_owner
from app.routers.users import delete_user


def _make_user(role: str = "viewer", user_id: uuid.UUID | None = None) -> MagicMock:
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.role = role
    user.email = "target@example.com"
    return user


class DeleteUserValidationTest(unittest.TestCase):
    def test_blocks_when_user_has_assignments_or_owners_or_laptops(self) -> None:
        async def run() -> None:
            target_id = uuid.uuid4()
            target = _make_user(user_id=target_id)
            actor = _make_user(role="admin")

            db = AsyncMock()
            db.get = AsyncMock(return_value=target)
            # First .execute is the last-admin check (target.role != "admin", so it's skipped).
            # Subsequent calls are db.scalar for assignee_count, owner_count, laptop_count.
            db.scalar = AsyncMock(side_effect=[2, 1, 3])

            with self.assertRaises(HTTPException) as ctx:
                await delete_user(target_id, actor, db)
            self.assertEqual(ctx.exception.status_code, 400)
            detail = ctx.exception.detail
            self.assertIn("assigned to 2 service(s)", detail)
            self.assertIn("owns 1 service(s)", detail)
            self.assertIn("holds 3 laptop(s)", detail)
            db.delete.assert_not_called()

        asyncio.run(run())

    def test_blocks_only_with_assignee_count(self) -> None:
        async def run() -> None:
            target_id = uuid.uuid4()
            target = _make_user(user_id=target_id)
            actor = _make_user(role="admin")

            db = AsyncMock()
            db.get = AsyncMock(return_value=target)
            db.scalar = AsyncMock(side_effect=[5, 0, 0])

            with self.assertRaises(HTTPException) as ctx:
                await delete_user(target_id, actor, db)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("assigned to 5 service(s)", ctx.exception.detail)
            self.assertNotIn("owns", ctx.exception.detail)
            self.assertNotIn("holds", ctx.exception.detail)

        asyncio.run(run())

    def test_proceeds_when_no_assignments(self) -> None:
        async def run() -> None:
            target_id = uuid.uuid4()
            target = _make_user(user_id=target_id)
            actor = _make_user(role="admin")

            db = AsyncMock()
            db.get = AsyncMock(return_value=target)
            db.scalar = AsyncMock(side_effect=[0, 0, 0])
            # delete_user calls db.execute twice (last-admin skipped since target is viewer,
            # then the ApiToken delete) — return MagicMocks for both.
            db.execute = AsyncMock(return_value=MagicMock())

            await delete_user(target_id, actor, db)
            db.delete.assert_awaited_once_with(target)

        asyncio.run(run())

    def test_self_delete_blocked_before_validation(self) -> None:
        async def run() -> None:
            target = _make_user(role="admin")
            actor = target  # same instance — same id

            db = AsyncMock()
            db.get = AsyncMock(return_value=target)

            with self.assertRaises(HTTPException) as ctx:
                await delete_user(target.id, actor, db)
            self.assertEqual(ctx.exception.status_code, 400)
            self.assertIn("Cannot delete your own account", ctx.exception.detail)
            db.scalar.assert_not_called()

        asyncio.run(run())


class RemoveServiceAssigneeTest(unittest.TestCase):
    def test_removes_only_matching_user(self) -> None:
        async def run() -> None:
            target_id = uuid.uuid4()
            other_id = uuid.uuid4()
            service = MagicMock()
            assignee_a = MagicMock(); assignee_a.id = target_id
            assignee_b = MagicMock(); assignee_b.id = other_id
            service.assignees = [assignee_a, assignee_b]

            db = AsyncMock()
            db.get = AsyncMock(return_value=service)

            await remove_service_assignee(uuid.uuid4(), target_id, _make_user(), db)

            self.assertEqual(len(service.assignees), 1)
            self.assertEqual(service.assignees[0].id, other_id)
            db.flush.assert_awaited_once()

        asyncio.run(run())

    def test_idempotent_when_user_not_assigned(self) -> None:
        async def run() -> None:
            other_id = uuid.uuid4()
            target_id = uuid.uuid4()
            service = MagicMock()
            assignee = MagicMock(); assignee.id = other_id
            service.assignees = [assignee]

            db = AsyncMock()
            db.get = AsyncMock(return_value=service)

            await remove_service_assignee(uuid.uuid4(), target_id, _make_user(), db)

            self.assertEqual(len(service.assignees), 1)
            db.flush.assert_not_called()

        asyncio.run(run())

    def test_404_when_service_missing(self) -> None:
        async def run() -> None:
            db = AsyncMock()
            db.get = AsyncMock(return_value=None)

            with self.assertRaises(HTTPException) as ctx:
                await remove_service_assignee(
                    uuid.uuid4(), uuid.uuid4(), _make_user(), db
                )
            self.assertEqual(ctx.exception.status_code, 404)

        asyncio.run(run())


class RemoveServiceOwnerTest(unittest.TestCase):
    def test_removes_only_matching_owner(self) -> None:
        async def run() -> None:
            target_id = uuid.uuid4()
            other_id = uuid.uuid4()
            service = MagicMock()
            owner_a = MagicMock(); owner_a.id = target_id
            owner_b = MagicMock(); owner_b.id = other_id
            service.owners = [owner_a, owner_b]

            db = AsyncMock()
            db.get = AsyncMock(return_value=service)

            await remove_service_owner(uuid.uuid4(), target_id, _make_user(), db)

            self.assertEqual(len(service.owners), 1)
            self.assertEqual(service.owners[0].id, other_id)
            db.flush.assert_awaited_once()

        asyncio.run(run())


if __name__ == "__main__":
    unittest.main()
