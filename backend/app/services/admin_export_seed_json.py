"""JSON snapshots in the same spirit as repository ``data/seed/*.json`` (UUID ids)."""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.models.cost_record import CostRecord
from app.models.payment_method import PaymentMethod
from app.models.service import Service
from app.models.service_history import ServiceHistoryEntry
from app.models.user import User
from app.models.vendor import Vendor


def _dumps(data: Any) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False, default=_json_default)


def _json_default(o: Any) -> Any:
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


def _status_to_service_type_slug(status: str) -> str:
    return status.strip().lower().replace(" ", "_").replace("-", "_")


async def build_seed_json_files(db) -> dict[str, str]:
    """Return map of zip path (under data/seed-json/) -> JSON string."""
    vendors = (
        await db.execute(select(Vendor).order_by(Vendor.name))
    ).scalars().all()
    vendors_out = [
        {
            "id": str(v.id),
            "name": v.name,
            "website": v.website,
            "notes": v.notes,
        }
        for v in vendors
    ]

    categories = (
        await db.execute(select(Category).order_by(Category.name))
    ).scalars().all()
    categories_out = [
        {
            "id": str(c.id),
            "name": c.name,
            "description": c.description,
            "color": c.color,
        }
        for c in categories
    ]

    payment_methods = (
        await db.execute(select(PaymentMethod).order_by(PaymentMethod.name))
    ).scalars().all()
    payment_methods_out = [
        {
            "id": str(pm.id),
            "name": pm.name,
            "method_type": pm.method_type,
            "last_four": pm.last_four,
            "notes": pm.notes,
            "color": pm.color,
        }
        for pm in payment_methods
    ]

    users = (await db.execute(select(User).order_by(User.email))).scalars().all()
    users_out = []
    for u in users:
        display = u.display_name or f"{u.first_name} {u.last_name}".strip()
        users_out.append(
            {
                "id": str(u.id),
                "name": display,
                "email": u.email,
                "department": u.department,
                "role": u.role,
                "is_active": u.is_active,
                "provisioning_source": u.provisioning_source,
            }
        )

    services = (
        await db.execute(
            select(Service)
            .options(
                selectinload(Service.owners),
                selectinload(Service.assignees),
                selectinload(Service.service_classification),
            )
            .order_by(Service.name)
        )
    ).scalars().all()
    services_out = []
    for s in services:
        slug = _status_to_service_type_slug(s.status)
        row: dict[str, Any] = {
            "id": str(s.id),
            "name": s.name,
            "description": s.description,
            "status": s.status,
            "service_type": slug,
            "billing_schedule": s.billing_schedule or "",
            "vendor_id": str(s.vendor_id) if s.vendor_id else None,
            "category_id": str(s.category_id) if s.category_id else None,
            "payment_method_id": str(s.payment_method_id) if s.payment_method_id else None,
            "cost_center_id": str(s.cost_center_id) if s.cost_center_id else None,
            "owner_ids": [str(u.id) for u in s.owners],
            "assignee_ids": [str(u.id) for u in s.assignees],
            "classification": (
                s.service_classification.slug if s.service_classification else None
            ),
            "scim_enabled": s.scim_enabled,
            "criticality": s.criticality,
            "nonprofit_pricing": s.nonprofit_pricing,
            "is_active": s.is_active,
            "deprecated_at": s.deprecated_at.isoformat() if s.deprecated_at else None,
            "renewal_date": s.renewal_date.isoformat() if s.renewal_date else None,
            "renewal_reminders_enabled": s.renewal_reminders_enabled,
            "renewal_offsets_days": s.renewal_offsets_days,
            "total_seats": s.total_seats,
            "point_of_contact": s.point_of_contact,
            "notes": s.notes,
        }
        services_out.append(row)

    cost_rows = (
        await db.execute(
            select(CostRecord).order_by(
                CostRecord.fiscal_year,
                CostRecord.service_id,
                CostRecord.laptop_id,
            )
        )
    ).scalars().all()
    cost_records_out = []
    for r in cost_rows:
        item: dict[str, Any] = {
            "id": str(r.id),
            "fiscal_year": r.fiscal_year,
            "amount": float(r.amount),
            "record_type": r.record_type,
            "notes": r.notes,
            "purchase_year": r.purchase_year,
            "payment_method_id": str(r.payment_method_id) if r.payment_method_id else None,
            "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
        }
        if r.service_id is not None:
            item["service_id"] = str(r.service_id)
        else:
            item["service_id"] = None
        if r.laptop_id is not None:
            item["laptop_id"] = str(r.laptop_id)
        else:
            item["laptop_id"] = None
        cost_records_out.append(item)

    history_rows = (
        await db.execute(
            select(ServiceHistoryEntry).order_by(
                ServiceHistoryEntry.action_date.desc(),
                ServiceHistoryEntry.service_id,
            )
        )
    ).scalars().all()
    service_history_out = [
        {
            "id": str(h.id),
            "date": h.action_date,
            "service_id": str(h.service_id),
            "action_type": h.action_type,
            "description": h.description,
            "changed_by_id": str(h.changed_by_id) if h.changed_by_id else None,
        }
        for h in history_rows
    ]

    readme = """Seed-style JSON snapshots (same filenames as repository data/seed/).

Ids are live database UUIDs (strings), not integer seed ids. Checked-in
data/seed uses integers and scripts/seed_from_json.py derives UUIDs with a
fixed namespace; this export is for backup and portability. CSV files in the
same zip remain the canonical tabular export.
"""

    prefix = "data/seed-json/"
    return {
        f"{prefix}README.txt": readme,
        f"{prefix}vendors.json": _dumps(vendors_out),
        f"{prefix}categories.json": _dumps(categories_out),
        f"{prefix}payment_methods.json": _dumps(payment_methods_out),
        f"{prefix}users.json": _dumps(users_out),
        f"{prefix}services.json": _dumps(services_out),
        f"{prefix}cost_records.json": _dumps(cost_records_out),
        f"{prefix}service_history.json": _dumps(service_history_out),
    }
