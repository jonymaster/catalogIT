"""Unit tests for the bootstrap admin seed that runs on API startup."""

from __future__ import annotations

import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import bcrypt

from app import main as main_module
from app.models.user import User

ADMIN_EMAIL = "admin@catalogit.local"
PASSWORD = "new-default"


def _settings() -> SimpleNamespace:
    return SimpleNamespace(
        ADMIN_EMAIL=ADMIN_EMAIL,
        ADMIN_DEFAULT_PASSWORD=PASSWORD,
        ADMIN_EXTERNAL_ID="local:admin",
        ADMIN_FIRST_NAME="Admin",
        ADMIN_LAST_NAME="User",
    )


def _result(value) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _session(*results) -> AsyncMock:
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=[_result(v) for v in results])
    session.add = MagicMock()
    return session


def _user(email: str, *, role: str = "admin", must_reset: bool = False) -> User:
    return User(
        email=email,
        role=role,
        password_hash="old-hash",
        must_reset_password=must_reset,
    )


class SeedAdminTest(unittest.TestCase):
    def _run(self, session: AsyncMock) -> None:
        factory = MagicMock()
        factory.return_value.__aenter__ = AsyncMock(return_value=session)
        factory.return_value.__aexit__ = AsyncMock(return_value=False)
        with (
            patch.object(main_module, "get_settings", return_value=_settings()),
            patch.object(main_module, "async_session", factory),
        ):
            asyncio.run(main_module._seed_admin())

    def test_creates_bootstrap_admin_when_no_admin_exists(self) -> None:
        session = _session(None, None)
        self._run(session)

        session.add.assert_called_once()
        created = session.add.call_args.args[0]
        self.assertEqual(created.email, ADMIN_EMAIL)
        self.assertEqual(created.role, "admin")
        self.assertTrue(created.must_reset_password)
        self.assertTrue(bcrypt.checkpw(PASSWORD.encode(), created.password_hash.encode()))
        session.commit.assert_awaited_once()

    def test_resyncs_bootstrap_admin_that_never_reset_password(self) -> None:
        admin = _user(ADMIN_EMAIL, must_reset=True)
        session = _session(admin)
        self._run(session)

        self.assertTrue(bcrypt.checkpw(PASSWORD.encode(), admin.password_hash.encode()))
        session.add.assert_not_called()

    def test_keeps_password_bootstrap_admin_chose(self) -> None:
        admin = _user(ADMIN_EMAIL, must_reset=False)
        session = _session(admin)
        self._run(session)

        self.assertEqual(admin.password_hash, "old-hash")

    def test_looks_up_bootstrap_admin_by_email(self) -> None:
        # Regression: another admin that already reset their password used to be
        # picked first, so the bootstrap admin was never re-synced.
        admin = _user(ADMIN_EMAIL, must_reset=True)
        session = _session(admin)
        self._run(session)

        query = session.execute.await_args_list[0].args[0]
        self.assertIn("users.email", str(query.whereclause))
        self.assertTrue(bcrypt.checkpw(PASSWORD.encode(), admin.password_hash.encode()))

    def test_does_not_create_when_other_admin_exists(self) -> None:
        session = _session(None, "other-admin-id")
        self._run(session)

        session.add.assert_not_called()
        session.commit.assert_not_awaited()

    def test_leaves_demoted_bootstrap_user_alone(self) -> None:
        user = _user(ADMIN_EMAIL, role="viewer", must_reset=True)
        session = _session(user)
        self._run(session)

        self.assertEqual(user.password_hash, "old-hash")
        self.assertEqual(user.role, "viewer")
        session.add.assert_not_called()


if __name__ == "__main__":
    unittest.main()
