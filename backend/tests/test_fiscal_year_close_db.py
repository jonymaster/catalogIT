"""Close financial year against a real PostgreSQL database (opt-in, skipped in CI).

Run from backend with a disposable database whose name ends with ``_test``, migrated to head:

    CATALOGIT_DB_TESTS=1 DATABASE_URL=postgresql+asyncpg://.../catalogit_test \\
        uv run --locked --with pytest pytest -q tests/test_fiscal_year_close_db.py

Every test truncates the tables it uses. Never point this at application data.
"""

from __future__ import annotations

import asyncio
import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy.engine import make_url

from app.config import get_settings


def _skip_reason() -> str | None:
    if os.environ.get("CATALOGIT_DB_TESTS") != "1":
        return "Set CATALOGIT_DB_TESTS=1 to run PostgreSQL tests"
    try:
        database = make_url(get_settings().DATABASE_URL).database or ""
    except Exception:
        database = ""
    if not database.endswith("_test"):
        return "Refusing to run: the DATABASE_URL database name must end with _test"
    return None


_reason = _skip_reason()
if _reason:
    raise unittest.SkipTest(_reason)

import httpx  # noqa: E402
from sqlalchemy import event, func, select, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app import audit  # noqa: E402
from app.database import async_session, engine  # noqa: E402
from app.dependencies.auth import get_current_user  # noqa: E402
from app.main import app  # noqa: E402  (creating the app registers the audit listeners once)
from app.models import (  # noqa: E402
    CostRecord,
    FiscalYearCloseBatch,
    GlobalAuditEvent,
    HardwareAsset,
    PaymentMethod,
    Service,
    User,
    UserPermission,
)
from app.permissions import PERMISSION_FINANCIAL_VIEW  # noqa: E402
from app.services import fiscal_year_close  # noqa: E402

if not event.contains(Session, "after_flush", audit._after_flush):
    audit.register_audit_listeners()

BASE = "/api/cost-records/close-year"
X = datetime.now(timezone.utc).year - 1
D = Decimal

_TABLES = (
    "global_audit_event",
    "cost_records",
    "fiscal_year_close_batches",
    "hardware_assets",
    "services",
    "payment_methods",
    "user_permissions",
    "users",
)


async def _truncate() -> None:
    async with engine.begin() as conn:
        name = await conn.scalar(text("SELECT current_database()"))
        assert name.endswith("_test"), "Refusing to truncate a database that is not *_test"
        await conn.execute(text(f"TRUNCATE {', '.join(_TABLES)} RESTART IDENTITY CASCADE"))


async def _add(*rows) -> None:
    async with async_session() as db:
        db.add_all(rows)
        await db.commit()


async def _get(model, row_id):
    async with async_session() as db:
        return await db.get(model, row_id)


async def _scalar(stmt):
    async with async_session() as db:
        return await db.scalar(stmt)


async def _all(stmt):
    async with async_session() as db:
        return list((await db.execute(stmt)).scalars().all())


def _user(role: str, first: str, last: str) -> User:
    return User(
        id=uuid.uuid4(),
        external_id=f"test:{uuid.uuid4()}",
        email=f"{uuid.uuid4().hex[:8]}@example.test",
        first_name=first,
        last_name=last,
        role=role,
        is_active=True,
    )


def _service(name: str, *, active: bool = True, created_at: datetime | None = None) -> Service:
    return Service(
        id=uuid.uuid4(),
        name=name,
        status="Active",
        is_active=active,
        created_at=created_at or datetime(2020, 1, 1, 9, 0, 0),
    )


def _cost(service: Service | None, record_type: str, amount: str, *, year: int = X, **extra) -> CostRecord:
    return CostRecord(
        id=uuid.uuid4(),
        service_id=service.id if service else None,
        fiscal_year=year,
        record_type=record_type,
        amount=D(amount),
        **extra,
    )


class CloseFiscalYearDbTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        await _truncate()
        self.admin = _user("admin", "Ada", "Admin")
        await _add(self.admin)
        self.actor = SimpleNamespace(id=self.admin.id, role="admin")
        app.dependency_overrides[get_current_user] = lambda: self.actor
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        app.dependency_overrides.clear()
        await _truncate()
        await engine.dispose()

    async def request(self, method: str, path: str, expected: int = 200, **kwargs):
        response = await self.client.request(method, path, **kwargs)
        self.assertEqual(response.status_code, expected, (method, path, response.text))
        return response.json() if response.content else None

    async def seed(self) -> SimpleNamespace:
        """CRM converts, Wiki has an actual (estimate excluded), Chat has a budget in X+1, Legacy is archived."""
        s = SimpleNamespace()
        s.card = PaymentMethod(id=uuid.uuid4(), name="Company card")
        s.crm = _service("CRM")
        s.wiki = _service("Wiki", created_at=datetime(X, 6, 1, 8, 0, 0))
        s.chat = _service("Chat")
        s.legacy = _service("Legacy", active=False)
        s.laptop = HardwareAsset(id=uuid.uuid4(), model_name="Laptop", status="In Stock")
        await _add(s.card, s.crm, s.wiki, s.chat, s.legacy, s.laptop)
        s.crm_e1 = _cost(s.crm, "estimated", "1200.00", payment_method_id=s.card.id, recorded_at=datetime(X, 1, 10))
        s.crm_e2 = _cost(s.crm, "estimated", "300.00", payment_method_id=s.card.id, recorded_at=datetime(X, 2, 10))
        s.crm_budget = _cost(s.crm, "budget", "999.00")
        s.wiki_actual = _cost(s.wiki, "actual", "500.00")
        s.wiki_e = _cost(s.wiki, "estimated", "100.00")
        s.chat_e = _cost(s.chat, "estimated", "10.00")
        s.chat_next_budget = _cost(s.chat, "budget", "20.00", year=X + 1)
        s.legacy_e = _cost(s.legacy, "estimated", "50.00")
        s.hardware = CostRecord(
            id=uuid.uuid4(), hardware_id=s.laptop.id, fiscal_year=X, record_type="estimated", amount=D("1500.00")
        )
        await _add(
            s.crm_e1, s.crm_e2, s.crm_budget, s.wiki_actual, s.wiki_e, s.chat_e, s.chat_next_budget, s.legacy_e, s.hardware
        )
        return s

    async def preview(self, year: int = X, uplift=10) -> dict:
        return await self.request("POST", f"{BASE}/preview", json={"fiscal_year": year, "uplift_pct": uplift})

    async def execute(self, s: SimpleNamespace, plan_hash: str, expected: int = 200, **extra):
        body = {
            "fiscal_year": X,
            "plan_hash": plan_hash,
            "uplift_pct": 10,
            "conversions": [{"record_id": str(s.crm_e1.id), "amount": 1250}],
            **extra,
        }
        return await self.request("POST", f"{BASE}/execute", expected, json=body)

    async def next_year_records(self) -> list[CostRecord]:
        return await _all(select(CostRecord).where(CostRecord.fiscal_year == X + 1).order_by(CostRecord.amount))

    async def test_preview_matches_rules_and_writes_nothing(self) -> None:
        s = await self.seed()
        audit_before = await _scalar(select(func.count()).select_from(GlobalAuditEvent))
        body = await self.preview()
        self.assertEqual((body["fiscal_year"], body["next_fiscal_year"], body["year_not_ended"]), (X, X + 1, False))
        self.assertEqual([row["service_name"] for row in body["services"]], ["Chat", "CRM", "Wiki"])
        chat, crm, wiki = body["services"]
        self.assertEqual([c["record_id"] for c in crm["conversions"]], [str(s.crm_e1.id), str(s.crm_e2.id)])
        self.assertEqual(crm["next_year"], {"action": "create", "amount": 1650.0, "payment_method_id": str(s.card.id), "skip_reason": None, "flags": []})
        self.assertEqual(wiki["conversions"][0]["include"], False)
        self.assertEqual(wiki["conversions"][0]["flags"], ["estimate_with_actual"])
        self.assertEqual(wiki["existing_actual_total"], 500.0)
        self.assertEqual(wiki["next_year"]["amount"], 550.0)
        self.assertEqual(wiki["next_year"]["flags"], ["added_during_year"])
        self.assertEqual((chat["next_year"]["action"], chat["next_year"]["skip_reason"]), ("skip", "next_year_exists"))
        self.assertEqual(body["skipped"], [{"service_id": str(s.legacy.id), "service_name": "Legacy", "reason": "archived"}])
        self.assertEqual(body["totals"], {"converted": 1510.0, "next_year": 2200.0})
        self.assertEqual(await _scalar(select(func.count()).select_from(GlobalAuditEvent)), audit_before)
        self.assertEqual(await _scalar(select(func.count()).select_from(FiscalYearCloseBatch)), 0)

        current = await self.preview(year=X + 1)
        self.assertTrue(current["year_not_ended"])
        await self.request("POST", f"{BASE}/preview", 400, json={"fiscal_year": X + 2})
        await self.request("POST", f"{BASE}/preview", 400, json={"fiscal_year": X, "uplift_pct": -101})

    async def test_execute_end_to_end(self) -> None:
        s = await self.seed()
        plan = await self.preview()
        result = await self.execute(s, plan["plan_hash"])
        self.assertEqual((result["converted_count"], result["created_count"]), (3, 2))
        self.assertEqual(result["totals"], {"converted": 1560.0, "next_year": 2255.0})
        batch_id = uuid.UUID(result["batch_id"])

        batch = await _get(FiscalYearCloseBatch, batch_id)
        self.assertEqual(batch.fiscal_year, X)
        self.assertEqual(batch.uplift_pct, D("10.00"))
        self.assertEqual((batch.converted_count, batch.created_count), (3, 2))
        self.assertEqual((batch.converted_total, batch.next_year_total), (D("1560.00"), D("2255.00")))
        self.assertEqual(batch.created_by_id, self.admin.id)
        self.assertIsNotNone(batch.created_at)
        self.assertIsNone(batch.reverted_at)

        converted = {r.id: r for r in await _all(select(CostRecord).where(CostRecord.rollover_action == "converted"))}
        self.assertEqual(set(converted), {s.crm_e1.id, s.crm_e2.id, s.chat_e.id})
        self.assertEqual(converted[s.crm_e1.id].amount, D("1250.00"))
        self.assertEqual(converted[s.crm_e2.id].amount, D("300.00"))
        for record in converted.values():
            self.assertEqual((record.record_type, record.rollover_batch_id), ("actual", batch_id))
            self.assertIsNone(record.rollover_created_batch_id)

        for untouched in (s.wiki_e, s.legacy_e, s.crm_budget, s.chat_next_budget, s.hardware):
            row = await _get(CostRecord, untouched.id)
            self.assertEqual((row.record_type, row.amount, row.rollover_batch_id), (untouched.record_type, untouched.amount, None))

        created = [r for r in await self.next_year_records() if r.rollover_action == "created"]
        self.assertEqual([(r.service_id, r.amount) for r in created], [(s.wiki.id, D("550.00")), (s.crm.id, D("1705.00"))])
        for record in created:
            self.assertEqual(record.record_type, "estimated")
            self.assertIsNone(record.purchase_year)
            self.assertIsNone(record.hardware_id)
            self.assertEqual(record.recorded_by_id, self.admin.id)
            self.assertEqual(record.notes, f"Rolled over from FY{X}")
            self.assertEqual(record.rollover_batch_id, batch_id)
            self.assertEqual(record.rollover_created_batch_id, batch_id)
        self.assertEqual({r.service_id: r.payment_method_id for r in created}, {s.crm.id: s.card.id, s.wiki.id: None})

        events = await _all(
            select(GlobalAuditEvent).where(
                GlobalAuditEvent.entity_table == "cost_records",
                GlobalAuditEvent.actor_user_id == self.admin.id,
            )
        )
        by_key = {(e.entity_key, e.event_type): e for e in events}
        for record_id in converted:
            update = by_key[(str(record_id), "UPDATE")]
            self.assertEqual(update.details["new_values"]["record_type"], "actual")
            self.assertEqual(update.details["new_values"]["rollover_action"], "converted")
            self.assertEqual(update.details["new_values"]["rollover_batch_id"], str(batch_id))
        self.assertEqual(by_key[(str(s.crm_e1.id), "UPDATE")].details["new_values"]["amount"], "1250.00")
        for record in created:
            self.assertIn((str(record.id), "INSERT"), by_key)
        self.assertEqual(len(events), 5)
        batch_events = await _all(select(GlobalAuditEvent).where(GlobalAuditEvent.entity_table == "fiscal_year_close_batches"))
        self.assertEqual([(e.event_type, e.actor_user_id) for e in batch_events], [("INSERT", self.admin.id)])

        history = await self.request("GET", f"/api/history/cost_records/{s.crm_e1.id}")
        self.assertEqual(history["items"][0]["new_values"]["rollover_action"], "converted")

    async def test_hash_mismatch_returns_409_and_changes_nothing(self) -> None:
        s = await self.seed()
        plan = await self.preview()
        await self.request("PUT", f"/api/services/{s.chat.id}/cost-records/{s.chat_e.id}", json={"amount": 12})
        body = await self.execute(s, plan["plan_hash"], 409)
        self.assertEqual(body["detail"], "Cost records changed since preview; reload the preview")
        self.assertEqual(await _scalar(select(func.count()).select_from(FiscalYearCloseBatch)), 0)
        self.assertEqual((await _get(CostRecord, s.crm_e1.id)).record_type, "estimated")
        self.assertEqual([r.id for r in await self.next_year_records()], [s.chat_next_budget.id])

    async def test_rerun_creates_nothing_and_empty_plan_is_400(self) -> None:
        s = await self.seed()
        await self.execute(s, (await self.preview())["plan_hash"])
        again = await self.preview()
        for row in again["services"]:
            self.assertEqual(row["next_year"]["skip_reason"], "next_year_exists")
            self.assertTrue(all(not c["include"] for c in row["conversions"]))
        self.assertEqual(again["totals"], {"converted": 0.0, "next_year": 0.0})
        body = await self.request(
            "POST", f"{BASE}/execute", 400, json={"fiscal_year": X, "plan_hash": again["plan_hash"]}
        )
        self.assertEqual(body["detail"], "Nothing to close for this year")
        self.assertEqual(await _scalar(select(func.count()).select_from(FiscalYearCloseBatch)), 1)
        self.assertEqual(len(await self.next_year_records()), 3)

    async def test_execute_rejects_bad_overrides(self) -> None:
        s = await self.seed()
        plan = await self.preview()
        cases = [
            {"conversions": [{"record_id": str(uuid.uuid4()), "include": True}]},
            {"conversions": [{"record_id": str(s.legacy_e.id), "include": True}]},
            {"conversions": [{"record_id": str(s.crm_e1.id), "amount": -5}]},
            {"next_year": [{"service_id": str(s.chat.id), "include": True}]},
            {"next_year": [{"service_id": str(s.legacy.id), "amount": 10}]},
            {"conversions": [{"record_id": str(s.crm_e1.id), "amount": 10000000000}]},
        ]
        for extra in cases:
            body = {"fiscal_year": X, "plan_hash": plan["plan_hash"], **extra}
            await self.request("POST", f"{BASE}/execute", 400, json=body)
        self.assertEqual(await _scalar(select(func.count()).select_from(FiscalYearCloseBatch)), 0)

    async def test_revert_flips_back_and_deletes_created(self) -> None:
        s = await self.seed()
        result = await self.execute(s, (await self.preview())["plan_hash"])
        batch_id = result["batch_id"]
        wiki_created = next(r for r in await self.next_year_records() if r.service_id == s.wiki.id)
        crm_created = next(r for r in await self.next_year_records() if r.service_id == s.crm.id)
        await self.request("DELETE", f"/api/services/{s.wiki.id}/cost-records/{wiki_created.id}", 204)
        events_before = {e.id for e in await _all(select(GlobalAuditEvent))}

        reverted = await self.request("POST", f"{BASE}/revert", json={"batch_id": batch_id})
        self.assertEqual(reverted, {"batch_id": batch_id, "restored_count": 3, "deleted_count": 1})

        revert_events = [e for e in await _all(select(GlobalAuditEvent)) if e.id not in events_before]
        self.assertTrue(all(e.actor_user_id == self.admin.id for e in revert_events), revert_events)
        record_events = sorted(
            (e.entity_key, e.event_type) for e in revert_events if e.entity_table == "cost_records"
        )
        self.assertEqual(
            record_events,
            sorted(
                [(str(r), "UPDATE") for r in (s.crm_e1.id, s.crm_e2.id, s.chat_e.id)]
                + [(str(crm_created.id), "DELETE")]
            ),
        )
        for event in revert_events:
            if event.entity_table == "cost_records" and event.event_type == "UPDATE":
                self.assertEqual(event.details["old_values"]["record_type"], "actual")
                self.assertEqual(event.details["new_values"]["record_type"], "estimated")
                self.assertIsNone(event.details["new_values"]["rollover_batch_id"])
        batch_events = [e for e in revert_events if e.entity_table == "fiscal_year_close_batches"]
        self.assertEqual([e.event_type for e in batch_events], ["UPDATE"])
        self.assertEqual(batch_events[0].entity_key, batch_id)
        self.assertEqual(batch_events[0].details["new_values"]["reverted_by_id"], str(self.admin.id))
        self.assertIsNotNone(batch_events[0].details["new_values"]["reverted_at"])
        for record_id, amount in ((s.crm_e1.id, D("1250.00")), (s.crm_e2.id, D("300.00")), (s.chat_e.id, D("10.00"))):
            row = await _get(CostRecord, record_id)
            self.assertEqual((row.record_type, row.amount, row.rollover_batch_id, row.rollover_action), ("estimated", amount, None, None))
        self.assertEqual([r.id for r in await self.next_year_records()], [s.chat_next_budget.id])
        batch = await _get(FiscalYearCloseBatch, uuid.UUID(batch_id))
        self.assertIsNotNone(batch.reverted_at)
        self.assertGreaterEqual(batch.reverted_at, batch.created_at)
        self.assertEqual(batch.reverted_by_id, self.admin.id)

        again = await self.request("POST", f"{BASE}/revert", 409, json={"batch_id": batch_id})
        self.assertEqual(again["detail"], "Batch already reverted")
        await self.request("POST", f"{BASE}/revert", 404, json={"batch_id": str(uuid.uuid4())})
        listed = await self.request("GET", f"{BASE}/batches")
        self.assertEqual(listed[0]["reverted_by_name"], "Ada Admin")
        self.assertEqual(datetime.fromisoformat(listed[0]["reverted_at"]).utcoffset(), timedelta(0))
        self.assertGreaterEqual(
            datetime.fromisoformat(listed[0]["reverted_at"]), datetime.fromisoformat(listed[0]["created_at"])
        )

    async def test_revert_with_archived_service_is_409_and_changes_nothing(self) -> None:
        s = await self.seed()
        batch_id = (await self.execute(s, (await self.preview())["plan_hash"]))["batch_id"]
        await self.request("POST", f"/api/services/{s.crm.id}/archive")
        await self.request("POST", f"/api/services/{s.chat.id}/archive")
        body = await self.request("POST", f"{BASE}/revert", 409, json={"batch_id": batch_id})
        self.assertEqual(body["detail"], "Unarchive these services before reverting: Chat, CRM")
        row = await _get(CostRecord, s.crm_e1.id)
        self.assertEqual((row.record_type, str(row.rollover_batch_id)), ("actual", batch_id))
        self.assertEqual(len(await self.next_year_records()), 3)
        self.assertIsNone((await _get(FiscalYearCloseBatch, uuid.UUID(batch_id))).reverted_at)

        await self.request("POST", f"/api/services/{s.crm.id}/unarchive")
        await self.request("POST", f"/api/services/{s.chat.id}/unarchive")
        await self.request("POST", f"{BASE}/revert", json={"batch_id": batch_id})

    async def test_batches_newest_first_with_changed_since_close(self) -> None:
        s = await self.seed()
        older_service = _service("Old ERP")
        await _add(older_service)
        older_record = _cost(older_service, "estimated", "40.00", year=X - 1)
        await _add(older_record)
        older = await self.request(
            "POST",
            f"{BASE}/execute",
            json={"fiscal_year": X - 1, "plan_hash": (await self.preview(year=X - 1))["plan_hash"]},
        )
        newer = await self.execute(s, (await self.preview())["plan_hash"])

        listed = await self.request("GET", f"{BASE}/batches")
        self.assertEqual([b["id"] for b in listed], [newer["batch_id"], older["batch_id"]])
        # The newer close converted the Old ERP estimate that the older close created.
        self.assertEqual([b["changed_since_close"] for b in listed], [0, 1])
        first = listed[0]
        self.assertEqual(
            set(first),
            {
                "id", "fiscal_year", "uplift_pct", "converted_count", "created_count", "converted_total",
                "next_year_total", "created_at", "created_by_id", "created_by_name", "reverted_at",
                "reverted_by_id", "reverted_by_name", "changed_since_close",
            },
        )
        self.assertEqual((first["fiscal_year"], first["uplift_pct"], first["created_by_id"]), (X, 10.0, str(self.admin.id)))
        self.assertEqual(first["created_by_name"], "Ada Admin")
        # The X-1 close created Old ERP's FY X estimate; the X close converted it (4 conversions, 3 creates).
        self.assertEqual((first["converted_count"], first["created_count"]), (4, 3))
        self.assertEqual((first["converted_total"], first["next_year_total"]), (1600.0, 2299.0))
        self.assertEqual((listed[1]["fiscal_year"], listed[1]["converted_total"]), (X - 1, 40.0))
        self.assertIsNone(first["reverted_at"])
        self.assertEqual(datetime.fromisoformat(first["created_at"]).utcoffset(), timedelta(0))
        created_at = datetime.fromisoformat(first["created_at"])
        self.assertLess(abs(created_at - datetime.now(timezone.utc)), timedelta(minutes=5))

        await self.request("PUT", f"/api/services/{s.crm.id}/cost-records/{s.crm_e1.id}", json={"notes": "Edited after close"})
        listed = await self.request("GET", f"{BASE}/batches")
        self.assertEqual([b["changed_since_close"] for b in listed], [1, 1])

    async def _cost_record_state(self) -> list[tuple]:
        rows = await _all(select(CostRecord).order_by(CostRecord.id))
        return [
            (
                r.id, r.service_id, r.hardware_id, r.payment_method_id, r.fiscal_year, r.purchase_year, r.amount,
                r.record_type, r.notes, r.recorded_by_id, r.rollover_batch_id, r.rollover_action,
                r.rollover_created_batch_id,
            )
            for r in rows
        ]

    async def test_chained_closes_revert_newest_first_restores_the_original(self) -> None:
        card = PaymentMethod(id=uuid.uuid4(), name="Company card")
        crm = _service("CRM")
        wiki = _service("Wiki")
        await _add(card, crm, wiki)
        estimate = _cost(crm, "estimated", "100.00", payment_method_id=card.id, notes="Annual plan")
        actual = _cost(wiki, "actual", "40.00")
        await _add(estimate, actual)
        original = await self._cost_record_state()

        first = await self.request(
            "POST", f"{BASE}/execute", json={"fiscal_year": X, "plan_hash": (await self.preview())["plan_hash"]}
        )
        first_id = uuid.UUID(first["batch_id"])
        created_by_first = {r.service_id: r for r in await self.next_year_records()}
        self.assertEqual(set(created_by_first), {crm.id, wiki.id})
        listed = await self.request("GET", f"{BASE}/batches")
        self.assertEqual([b["changed_since_close"] for b in listed], [0])

        # Close X+1 (the current year): converts the estimates the first close created.
        second = await self.request(
            "POST",
            f"{BASE}/execute",
            json={"fiscal_year": X + 1, "plan_hash": (await self.preview(year=X + 1))["plan_hash"]},
        )
        second_id = uuid.UUID(second["batch_id"])
        self.assertEqual((second["converted_count"], second["created_count"]), (2, 2))
        for record in created_by_first.values():
            row = await _get(CostRecord, record.id)
            self.assertEqual(
                (row.record_type, row.rollover_batch_id, row.rollover_action, row.rollover_created_batch_id),
                ("actual", second_id, "converted", first_id),
            )
        listed = {b["id"]: b for b in await self.request("GET", f"{BASE}/batches")}
        # The first close's created records were changed (converted) by the second close.
        self.assertEqual(listed[str(first_id)]["changed_since_close"], 2)
        self.assertEqual(listed[str(second_id)]["changed_since_close"], 0)

        # The first close cannot be reverted while the second one uses its records.
        before = await self._cost_record_state()
        events_before = await _scalar(select(func.count()).select_from(GlobalAuditEvent))
        body = await self.request("POST", f"{BASE}/revert", 409, json={"batch_id": str(first_id)})
        self.assertEqual(body["detail"], f"Revert these later closes first: FY{X + 1}")
        self.assertEqual(await self._cost_record_state(), before)
        self.assertIsNone((await _get(FiscalYearCloseBatch, first_id)).reverted_at)
        self.assertEqual(await _scalar(select(func.count()).select_from(GlobalAuditEvent)), events_before)

        # Revert the second close: its records go back to the first close as "created".
        reverted = await self.request("POST", f"{BASE}/revert", json={"batch_id": str(second_id)})
        self.assertEqual((reverted["restored_count"], reverted["deleted_count"]), (2, 2))
        for record in created_by_first.values():
            row = await _get(CostRecord, record.id)
            self.assertEqual(
                (row.record_type, row.amount, row.rollover_batch_id, row.rollover_action, row.rollover_created_batch_id),
                ("estimated", record.amount, first_id, "created", first_id),
            )
        self.assertEqual(await _all(select(CostRecord).where(CostRecord.fiscal_year == X + 2)), [])

        # Then the first close: back to exactly the records before any close.
        reverted = await self.request("POST", f"{BASE}/revert", json={"batch_id": str(first_id)})
        self.assertEqual((reverted["restored_count"], reverted["deleted_count"]), (1, 2))
        self.assertEqual(await self._cost_record_state(), original)

    async def test_revert_of_later_close_clears_link_when_creating_close_is_reverted(self) -> None:
        """A record converted by B whose creating batch A is already reverted is not handed back to A."""
        crm = _service("CRM")
        await _add(crm)
        first = _cost(crm, "estimated", "100.00")
        await _add(first)
        batch_a = (
            await self.request("POST", f"{BASE}/execute", json={"fiscal_year": X, "plan_hash": (await self.preview())["plan_hash"]})
        )["batch_id"]
        created = (await self.next_year_records())[0]
        batch_b = (
            await self.request(
                "POST", f"{BASE}/execute", json={"fiscal_year": X + 1, "plan_hash": (await self.preview(year=X + 1))["plan_hash"]}
            )
        )["batch_id"]
        # Not reachable through the API (revert A is refused while B links the record): set it directly.
        async with async_session() as db:
            row = await db.get(FiscalYearCloseBatch, uuid.UUID(batch_a))
            row.reverted_at = datetime.now(timezone.utc).replace(tzinfo=None)
            await db.commit()
        await self.request("POST", f"{BASE}/revert", json={"batch_id": batch_b})
        row = await _get(CostRecord, created.id)
        self.assertEqual((row.record_type, row.rollover_batch_id, row.rollover_action), ("estimated", None, None))
        self.assertEqual(row.rollover_created_batch_id, uuid.UUID(batch_a))

    async def test_editor_with_financial_view_gets_403(self) -> None:
        s = await self.seed()
        editor = _user("editor", "Eve", "Editor")
        await _add(editor)
        await _add(UserPermission(user_id=editor.id, permission=PERMISSION_FINANCIAL_VIEW))
        self.actor = SimpleNamespace(id=editor.id, role="editor")
        await self.request("GET", f"/api/services/{s.crm.id}/cost-records/")
        await self.request("POST", f"{BASE}/preview", 403, json={"fiscal_year": X})
        await self.request("POST", f"{BASE}/execute", 403, json={"fiscal_year": X, "plan_hash": "sha256:x"})
        await self.request("POST", f"{BASE}/revert", 403, json={"batch_id": str(uuid.uuid4())})
        await self.request("GET", f"{BASE}/batches", 403)

    async def test_concurrent_executes_one_wins_one_gets_409(self) -> None:
        await self.seed()
        plan_hash = (await self.preview())["plan_hash"]
        original = fiscal_year_close._lock_participating_services
        first_locked = asyncio.Event()
        calls = 0
        second_wait = 0.0

        async def lock_then_hold(db, fiscal_year):
            nonlocal calls, second_wait
            calls += 1
            first = calls == 1
            if not first:
                await first_locked.wait()
            started = asyncio.get_running_loop().time()
            await original(db, fiscal_year)
            if not first:
                second_wait = asyncio.get_running_loop().time() - started
            if first:
                first_locked.set()
                # Hold the lock so the second execute is waiting on it, not running after the commit.
                await asyncio.sleep(0.5)

        body = {"fiscal_year": X, "plan_hash": plan_hash, "uplift_pct": 10}
        with patch.object(fiscal_year_close, "_lock_participating_services", lock_then_hold):
            responses = await asyncio.gather(
                self.client.post(f"{BASE}/execute", json=body),
                self.client.post(f"{BASE}/execute", json=body),
            )
        statuses = sorted(r.status_code for r in responses)
        self.assertEqual(statuses, [200, 409], [r.text for r in responses])
        # The second execute blocked on the row locks until the first committed.
        self.assertGreater(second_wait, 0.3)
        loser = next(r for r in responses if r.status_code == 409)
        self.assertEqual(loser.json()["detail"], "Cost records changed since preview; reload the preview")
        self.assertEqual(await _scalar(select(func.count()).select_from(FiscalYearCloseBatch)), 1)
        self.assertEqual(len([r for r in await self.next_year_records() if r.rollover_action == "created"]), 2)

    async def test_record_edit_waits_for_execute_locks(self) -> None:
        s = await self.seed()
        plan_hash = (await self.preview())["plan_hash"]
        original = fiscal_year_close._load_records
        locked = asyncio.Event()
        finished: list[str] = []

        async def load_then_hold(db, fiscal_year, *, lock):
            rows = await original(db, fiscal_year, lock=lock)
            if lock:
                locked.set()
                # Hold the record locks so the edit below has to wait for the commit.
                await asyncio.sleep(0.5)
            return rows

        async def run_execute():
            response = await self.client.post(f"{BASE}/execute", json={"fiscal_year": X, "plan_hash": plan_hash, "uplift_pct": 10})
            finished.append("execute")
            return response

        async def run_edit():
            await locked.wait()
            started = asyncio.get_running_loop().time()
            response = await self.client.put(f"/api/services/{s.crm.id}/cost-records/{s.crm_e2.id}", json={"amount": 999})
            finished.append("edit")
            return response, asyncio.get_running_loop().time() - started

        with patch.object(fiscal_year_close, "_load_records", load_then_hold):
            executed, (edited, edit_wait) = await asyncio.gather(run_execute(), run_edit())
        self.assertEqual(executed.status_code, 200, executed.text)
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertGreater(edit_wait, 0.3)
        self.assertEqual(finished, ["execute", "edit"])

        # The close used the amounts from before the edit; the edit applied on top afterwards.
        result = executed.json()
        self.assertEqual(result["totals"], {"converted": 1510.0, "next_year": 2200.0})
        crm_created = next(r for r in await self.next_year_records() if r.service_id == s.crm.id)
        self.assertEqual(crm_created.amount, D("1650.00"))
        row = await _get(CostRecord, s.crm_e2.id)
        self.assertEqual((row.record_type, row.amount, str(row.rollover_batch_id)), ("actual", D("999.00"), result["batch_id"]))
        batch = await _get(FiscalYearCloseBatch, uuid.UUID(result["batch_id"]))
        self.assertEqual((batch.converted_total, batch.next_year_total), (D("1510.00"), D("2200.00")))


if __name__ == "__main__":
    unittest.main()
