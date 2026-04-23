"""JSON snapshots in the same spirit as repository ``data/seed/*.json`` (UUID ids)."""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.models.cost_center import CostCenter
from app.models.cost_record import CostRecord
from app.models.hardware_location import HardwareLocation
from app.models.hardware_status import HardwareStatus
from app.models.laptop import Laptop
from app.models.payment_method import PaymentMethod
from app.models.service import Service
from app.models.service_classification import ServiceClassification
from app.models.service_history import ServiceHistoryEntry
from app.models.service_status import ServiceStatus
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

    cost_centers = (
        await db.execute(select(CostCenter).order_by(CostCenter.name))
    ).scalars().all()
    cost_centers_out = [
        {
            "id": str(cc.id),
            "name": cc.name,
            "description": cc.description,
        }
        for cc in cost_centers
    ]

    service_statuses = (
        await db.execute(select(ServiceStatus).order_by(ServiceStatus.name))
    ).scalars().all()
    service_statuses_out = [
        {
            "id": str(ss.id),
            "name": ss.name,
            "description": ss.description,
            "color": ss.color,
        }
        for ss in service_statuses
    ]

    service_classifications = (
        await db.execute(select(ServiceClassification).order_by(ServiceClassification.name))
    ).scalars().all()
    service_classifications_out = [
        {
            "id": str(sc.id),
            "slug": sc.slug,
            "name": sc.name,
            "description": sc.description,
            "color": sc.color,
        }
        for sc in service_classifications
    ]

    hardware_statuses = (
        await db.execute(select(HardwareStatus).order_by(HardwareStatus.name))
    ).scalars().all()
    hardware_statuses_out = [
        {
            "id": str(hs.id),
            "name": hs.name,
            "description": hs.description,
            "color": hs.color,
        }
        for hs in hardware_statuses
    ]

    hardware_locations = (
        await db.execute(select(HardwareLocation).order_by(HardwareLocation.name))
    ).scalars().all()
    hardware_locations_out = [
        {
            "id": str(hl.id),
            "name": hl.name,
            "description": hl.description,
        }
        for hl in hardware_locations
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
            "renewal_config": s.renewal_config,
            "vendor_id": str(s.vendor_id) if s.vendor_id else None,
            "category_id": str(s.category_id) if s.category_id else None,
            "payment_method_id": str(s.payment_method_id) if s.payment_method_id else None,
            "cost_center_id": str(s.cost_center_id) if s.cost_center_id else None,
            "classification_id": str(s.classification_id) if s.classification_id else None,
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

    laptops = (
        await db.execute(
            select(Laptop)
            .options(
                selectinload(Laptop.hardware_status),
                selectinload(Laptop.hardware_location),
                selectinload(Laptop.assigned_to),
            )
            .order_by(Laptop.serial_number)
        )
    ).scalars().all()
    laptops_out = [
        {
            "id": str(l.id),
            "serial_number": l.serial_number,
            "model_name": l.model_name,
            "cpu": l.cpu,
            "ram": l.ram,
            "storage_size": l.storage_size,
            "operating_system": l.operating_system,
            "status": l.status,
            "hardware_status_id": str(l.hardware_status_id) if l.hardware_status_id else None,
            "hardware_location_id": (
                str(l.hardware_location_id) if l.hardware_location_id else None
            ),
            "assigned_to_id": str(l.assigned_to_id) if l.assigned_to_id else None,
            "notes": l.notes,
            "mdm_connected": l.mdm_connected,
            "is_active": l.is_active,
            "archived_at": l.archived_at.isoformat() if l.archived_at else None,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "updated_at": l.updated_at.isoformat() if l.updated_at else None,
        }
        for l in laptops
    ]

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
        f"{prefix}cost_centers.json": _dumps(cost_centers_out),
        f"{prefix}service_statuses.json": _dumps(service_statuses_out),
        f"{prefix}service_classifications.json": _dumps(service_classifications_out),
        f"{prefix}hardware_statuses.json": _dumps(hardware_statuses_out),
        f"{prefix}hardware_locations.json": _dumps(hardware_locations_out),
        f"{prefix}users.json": _dumps(users_out),
        f"{prefix}services.json": _dumps(services_out),
        f"{prefix}laptops.json": _dumps(laptops_out),
        f"{prefix}cost_records.json": _dumps(cost_records_out),
        f"{prefix}service_history.json": _dumps(service_history_out),
    }
