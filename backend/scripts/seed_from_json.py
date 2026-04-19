"""Load seed data from ``backend/sample_data/*.json`` into the local database.

Override directory with env ``SEED_DIR`` (Docker image sets ``/app/sample_data``).

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
from app.reference_data_colors import coerce_badge_preset_value, pick_random_badge_color
from app.models import (
    Category,
    CostRecord,
    Laptop,
    PaymentMethod,
    Service,
    ServiceClassification,
    ServiceHistoryEntry,
    ServiceStatus,
    User,
    Vendor,
    service_owners,
)

import os as _os

_default_seed = Path(__file__).resolve().parent.parent / "sample_data"
SEED_DIR = Path(_os.environ.get("SEED_DIR", str(_default_seed)))

# Stable UUID namespace so repeated runs produce the same IDs
NS = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

STATUS_NAME_MAP = {
    "contract": "Contract",
    "self_managed": "Self-Managed",
    "self-managed": "Self-Managed",
    "active": "Active",
    "under_review": "Under Review",
    "under-review": "Under Review",
    "under review": "Under Review",
    "deprecated": "Deprecated",
    "trial": "Trial",
}


def _uuid(table: str, seed_id: int) -> uuid.UUID:
    return uuid.uuid5(NS, f"{table}:{seed_id}")


def _laptop_id(serial_number: str) -> uuid.UUID:
    return uuid.uuid5(NS, f"laptop:{serial_number.strip()}")


def _load(name: str) -> list[dict]:
    path = SEED_DIR / name
    if not path.exists():
        print(f"  [skip] {path} not found")
        return []
    with open(path) as f:
        return json.load(f)


def _normalize_status_name(raw: str | None) -> str:
    if not raw:
        return "Active"
    normalized = raw.strip()
    if not normalized:
        return "Active"
    lookup_key = normalized.lower().replace(" ", "_")
    return STATUS_NAME_MAP.get(lookup_key, normalized)


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
        raw_color = r.get("color")
        color = (
            coerce_badge_preset_value(str(raw_color))
            if raw_color
            else pick_random_badge_color()
        )
        session.add(
            Category(id=uid, name=r["name"], description=r.get("description"), color=color)
        )
    await session.flush()
    print(f"  categories: {len(rows)} processed")


async def _seed_payment_methods(session: AsyncSession) -> None:
    rows = _load("payment_methods.json")
    for r in rows:
        uid = _uuid("payment_method", r["id"])
        existing = await session.get(PaymentMethod, uid)
        if existing:
            continue
        raw_color = r.get("color")
        color = (
            coerce_badge_preset_value(str(raw_color))
            if raw_color
            else pick_random_badge_color()
        )
        session.add(
            PaymentMethod(
                id=uid,
                name=r["name"],
                method_type=r.get("method_type", ""),
                color=color,
            )
        )
    await session.flush()
    print(f"  payment_methods: {len(rows)} processed")


async def _seed_service_statuses(session: AsyncSession) -> None:
    default_statuses = [
        ("Contract", "Service is in contract onboarding or procurement."),
        ("Self-Managed", "Service is operated internally or outside a vendor contract."),
        ("Active", "Service is active and in normal use."),
        ("Under Review", "Service is being reviewed for fit, cost, or compliance."),
        ("Deprecated", "Service is being phased out or replaced."),
        ("Trial", "Service is being evaluated before broader adoption."),
    ]
    seeded_statuses = {
        _normalize_status_name(row.get("status"))
        for row in _load("services.json")
    }
    status_rows = []
    existing_names = set()
    for name, description in default_statuses:
        status_rows.append((name, description))
        existing_names.add(name.lower())
    for name in sorted(seeded_statuses):
        if name.lower() not in existing_names:
            status_rows.append((name, "Imported from service seed data."))
            existing_names.add(name.lower())

    for index, (name, description) in enumerate(status_rows, start=1):
        uid = _uuid("service_status", index)
        existing = await session.get(ServiceStatus, uid)
        if existing:
            continue
        result = await session.execute(
            select(ServiceStatus).where(ServiceStatus.name == name)
        )
        if result.scalar_one_or_none():
            continue
        session.add(
            ServiceStatus(
                id=uid,
                name=name,
                description=description,
                color=pick_random_badge_color(),
            )
        )
    await session.flush()
    print(f"  service_statuses: {len(status_rows)} processed")


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
            provisioning_source="local",
        ))
    await session.flush()
    print(f"  users: {len(rows)} processed")


async def _seed_services(session: AsyncSession) -> None:
    rows = _load("services.json")
    user_rows = _load("users.json")
    user_email_by_seed_id = {u["id"]: u["email"] for u in user_rows}
    result = await session.execute(select(ServiceStatus))
    service_statuses = {
        status.name.lower(): status.id
        for status in result.scalars().all()
    }
    cls_result = await session.execute(select(ServiceClassification))
    classifications_by_slug = {
        c.slug: c.id for c in cls_result.scalars().all()
    }

    for r in rows:
        svc_id = _uuid("service", r["id"])
        existing = await session.get(Service, svc_id)
        if existing:
            continue

        normalized_status = _normalize_status_name(r.get("status"))

        svc = Service(
            id=svc_id,
            name=r["name"],
            status=normalized_status,
            billing_schedule=r.get("billing_schedule", ""),
            vendor_id=_uuid("vendor", r["vendor_id"]),
            category_id=_uuid("category", r["category_id"]),
            payment_method_id=_uuid("payment_method", r["payment_method_id"]),
            service_status_id=service_statuses.get(normalized_status.lower()),
            classification_id=(
                classifications_by_slug.get(raw)
                if (raw := r.get("classification"))
                else None
            ),
            scim_enabled=r.get("scim_enabled", False),
            criticality=r.get("criticality"),
            nonprofit_pricing=r.get("nonprofit_pricing", False),
            point_of_contact=r.get("point_of_contact"),
            notes=r.get("notes"),
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


async def _seed_laptops(session: AsyncSession) -> None:
    rows = _load("laptops.json")
    if not rows:
        print("  laptops: 0 processed")
        return
    user_rows = _load("users.json")
    user_email_by_seed_id = {u["id"]: u["email"] for u in user_rows}
    for r in rows:
        serial = str(r["serial_number"]).strip()
        if not serial:
            continue
        result = await session.execute(select(Laptop).where(Laptop.serial_number == serial))
        if result.scalar_one_or_none():
            continue
        assigned_to_id = None
        seed_uid = r.get("assigned_to_user_seed_id")
        if seed_uid is not None:
            email = user_email_by_seed_id.get(int(seed_uid))
            if email:
                ur = await session.execute(select(User).where(User.email == email))
                u = ur.scalar_one_or_none()
                if u:
                    assigned_to_id = u.id
        os_raw = r.get("operating_system")
        operating_system = str(os_raw).strip().lower() if os_raw not in (None, "") else None
        if operating_system not in (None, "macos", "linux", "windows"):
            operating_system = None
        session.add(Laptop(
            id=_laptop_id(serial),
            serial_number=serial,
            model_name=str(r.get("model_name") or "Laptop"),
            cpu=str(r.get("cpu") or ""),
            ram=str(r.get("ram") or ""),
            storage_size=str(r.get("storage_size") or ""),
            operating_system=operating_system,
            status=str(r.get("status") or "In Stock"),
            assigned_to_id=assigned_to_id,
            notes=r.get("notes"),
            mdm_connected=bool(r.get("mdm_connected", False)),
        ))
    await session.flush()
    print(f"  laptops: {len(rows)} processed")


async def _seed_laptop_cost_records(session: AsyncSession) -> None:
    rows = _load("laptop_cost_records.json")
    for r in rows:
        serial = str(r["serial_number"]).strip()
        if not serial:
            continue
        lap_id = _laptop_id(serial)
        lap = await session.get(Laptop, lap_id)
        if not lap:
            continue
        existing = await session.execute(select(CostRecord).where(CostRecord.laptop_id == lap_id))
        if existing.scalar_one_or_none():
            continue
        pm_id = None
        if r.get("payment_method_id") is not None:
            pm_id = _uuid("payment_method", int(r["payment_method_id"]))
        session.add(CostRecord(
            service_id=None,
            laptop_id=lap_id,
            payment_method_id=pm_id,
            fiscal_year=int(r["fiscal_year"]),
            purchase_year=r.get("purchase_year"),
            amount=r["amount"],
            record_type=str(r["record_type"]),
            notes=r.get("notes"),
        ))
    await session.flush()
    print(f"  laptop_cost_records: {len(rows)} processed")


async def seed_database() -> None:
    print(f"Seeding from {SEED_DIR} ...")
    async with async_session() as session:
        try:
            await _seed_vendors(session)
            await _seed_categories(session)
            await _seed_payment_methods(session)
            await _seed_service_statuses(session)
            await _seed_users(session)
            await _seed_services(session)
            await _seed_cost_records(session)
            await _seed_service_history(session)
            await _seed_laptops(session)
            await _seed_laptop_cost_records(session)
            await session.commit()
            print("Done.")
        except Exception:
            await session.rollback()
            raise


async def main() -> None:
    await seed_database()
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
