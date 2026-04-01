"""Load seed data from data/seed/*.json into the local database.

Usage (from backend/):
    python -m scripts.seed_from_json

Or via Docker:
    docker compose exec api python -m scripts.seed_from_json

The script is idempotent: it skips rows whose unique key already exists.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session, engine
from app.models import (
    Category,
    CostRecord,
    LoginMethod,
    PaymentMethod,
    Service,
    ServiceHistoryEntry,
    ServiceLogin,
    User,
    Vendor,
    service_owners,
)

import os as _os

_default_seed = Path(__file__).resolve().parent.parent.parent / "data" / "seed"
SEED_DIR = Path(_os.environ.get("SEED_DIR", str(_default_seed)))

# Stable UUID namespace so repeated runs produce the same IDs
NS = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")


def _uuid(table: str, seed_id: int) -> uuid.UUID:
    return uuid.uuid5(NS, f"{table}:{seed_id}")


def _load(name: str) -> list[dict]:
    path = SEED_DIR / name
    if not path.exists():
        print(f"  [skip] {path} not found")
        return []
    with open(path) as f:
        return json.load(f)


async def _seed_vendors(session: AsyncSession) -> None:
    rows = _load("vendors.json")
    for r in rows:
        uid = _uuid("vendor", r["id"])
        existing = await session.get(Vendor, uid)
        if existing:
            continue
        session.add(Vendor(id=uid, name=r["name"]))
    await session.flush()
    print(f"  vendors: {len(rows)} processed")


async def _seed_categories(session: AsyncSession) -> None:
    rows = _load("categories.json")
    for r in rows:
        uid = _uuid("category", r["id"])
        existing = await session.get(Category, uid)
        if existing:
            continue
        session.add(Category(id=uid, name=r["name"], description=r.get("description")))
    await session.flush()
    print(f"  categories: {len(rows)} processed")


async def _seed_login_methods(session: AsyncSession) -> None:
    rows = _load("login_methods.json")
    for r in rows:
        uid = _uuid("login_method", r["id"])
        existing = await session.get(LoginMethod, uid)
        if existing:
            continue
        session.add(LoginMethod(id=uid, name=r["name"]))
    await session.flush()
    print(f"  login_methods: {len(rows)} processed")


async def _seed_payment_methods(session: AsyncSession) -> None:
    rows = _load("payment_methods.json")
    for r in rows:
        uid = _uuid("payment_method", r["id"])
        existing = await session.get(PaymentMethod, uid)
        if existing:
            continue
        session.add(PaymentMethod(id=uid, name=r["name"], method_type=r.get("method_type", "")))
    await session.flush()
    print(f"  payment_methods: {len(rows)} processed")


async def _seed_users(session: AsyncSession) -> None:
    """Seed users from the JSON file. Only creates users that don't already
    exist by email, and sets the department + display_name fields."""
    rows = _load("users.json")
    for r in rows:
        result = await session.execute(select(User).where(User.email == r["email"]))
        user = result.scalar_one_or_none()
        if user:
            if not user.department and r.get("department"):
                user.department = r["department"]
            if not user.display_name and r.get("name"):
                user.display_name = r["name"]
            continue
        name_parts = r["name"].split(" ", 1)
        first = name_parts[0]
        last = name_parts[1] if len(name_parts) > 1 else ""
        session.add(User(
            id=_uuid("user", r["id"]),
            external_id=f"seed:{r['email']}",
            email=r["email"],
            first_name=first,
            last_name=last,
            display_name=r["name"],
            department=r.get("department"),
            role="viewer",
        ))
    await session.flush()
    print(f"  users: {len(rows)} processed")


async def _seed_services(session: AsyncSession) -> None:
    rows = _load("services.json")
    user_rows = _load("users.json")
    user_email_by_seed_id = {u["id"]: u["email"] for u in user_rows}

    for r in rows:
        svc_id = _uuid("service", r["id"])
        existing = await session.get(Service, svc_id)
        if existing:
            continue

        svc = Service(
            id=svc_id,
            name=r["name"],
            status=r.get("service_type", "self_managed"),
            license_type=r.get("classification", ""),
            category="",
            billing_schedule=r.get("billing_schedule", ""),
            vendor_id=_uuid("vendor", r["vendor_id"]),
            category_id=_uuid("category", r["category_id"]),
            payment_method_id=_uuid("payment_method", r["payment_method_id"]),
            classification=r.get("classification"),
            service_type=r.get("service_type"),
            scim_enabled=r.get("scim_enabled", False),
            criticality=r.get("criticality"),
        )
        session.add(svc)
        await session.flush()

        # Owners
        for owner_seed_id in r.get("owner_ids", []):
            email = user_email_by_seed_id.get(owner_seed_id)
            if not email:
                continue
            result = await session.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            if user:
                await session.execute(
                    service_owners.insert().values(
                        id=str(uuid.uuid4()),
                        service_id=svc_id,
                        user_id=user.id,
                        role="owner",
                    )
                )

        # Login methods
        for i, lm_seed_id in enumerate(r.get("login_method_ids", [])):
            session.add(ServiceLogin(
                service_id=svc_id,
                login_method_id=_uuid("login_method", lm_seed_id),
                is_primary=(i == 0),
            ))

    await session.flush()
    print(f"  services: {len(rows)} processed")


async def _seed_cost_records(session: AsyncSession) -> None:
    rows = _load("cost_records.json")
    for r in rows:
        svc_id = _uuid("service", r["service_id"])
        result = await session.execute(
            select(CostRecord).where(
                CostRecord.service_id == svc_id,
                CostRecord.fiscal_year == r["fiscal_year"],
                CostRecord.record_type == r["record_type"],
            )
        )
        if result.scalar_one_or_none():
            continue
        session.add(CostRecord(
            service_id=svc_id,
            fiscal_year=r["fiscal_year"],
            amount=r["amount"],
            record_type=r["record_type"],
            notes=r.get("notes"),
        ))
    await session.flush()
    print(f"  cost_records: {len(rows)} processed")


async def _seed_service_history(session: AsyncSession) -> None:
    rows = _load("service_history.json")
    for r in rows:
        svc_id = _uuid("service", r["service_id"])
        result = await session.execute(
            select(ServiceHistoryEntry).where(
                ServiceHistoryEntry.service_id == svc_id,
                ServiceHistoryEntry.action_date == r["date"],
                ServiceHistoryEntry.action_type == r["action_type"],
            )
        )
        if result.scalar_one_or_none():
            continue
        session.add(ServiceHistoryEntry(
            service_id=svc_id,
            action_date=r["date"],
            action_type=r["action_type"],
            description=r.get("description"),
        ))
    await session.flush()
    print(f"  service_history: {len(rows)} processed")


async def main() -> None:
    print(f"Seeding from {SEED_DIR} ...")
    async with async_session() as session:
        try:
            await _seed_vendors(session)
            await _seed_categories(session)
            await _seed_login_methods(session)
            await _seed_payment_methods(session)
            await _seed_users(session)
            await _seed_services(session)
            await _seed_cost_records(session)
            await _seed_service_history(session)
            await session.commit()
            print("Done.")
        except Exception:
            await session.rollback()
            raise
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
