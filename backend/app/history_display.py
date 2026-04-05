"""Resolve FK UUIDs in audit old/new values to human-readable labels for API responses."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.cost_center import CostCenter
from app.models.contract import Contract
from app.models.payment_method import PaymentMethod
from app.models.service_status import ServiceStatus
from app.models.user import User
from app.models.vendor import Vendor


def _parse_uuid(val: Any) -> uuid.UUID | None:
    if val is None:
        return None
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        return None


def _user_label(u: User) -> str:
    if u.email:
        return u.email
    name = f"{u.first_name or ''} {u.last_name or ''}".strip()
    return name or str(u.id)


def _contract_label(c: Contract) -> str:
    ref = c.contract_ref
    if ref and str(ref).strip():
        return str(ref).strip()
    return f"#{str(c.id)[:8]}"


async def _load_labels(
    db: AsyncSession,
    model: type,
    ids: set[uuid.UUID],
    label_fn: Callable[[Any], str],
) -> dict[uuid.UUID, str]:
    if not ids:
        return {}
    result = await db.execute(select(model).where(model.id.in_(ids)))
    rows = result.scalars().all()
    return {row.id: label_fn(row) for row in rows}


async def _humanize_service_fks(
    db: AsyncSession,
    old_values: dict[str, Any] | None,
    new_values: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    keys = {
        "category_id": (Category, lambda r: r.name),
        "cost_center_id": (CostCenter, lambda r: r.name),
        "vendor_id": (Vendor, lambda r: r.name),
        "payment_method_id": (PaymentMethod, lambda r: r.name),
        "service_status_id": (ServiceStatus, lambda r: r.name),
        "contract_id": (Contract, _contract_label),
    }

    id_by_key: dict[str, set[uuid.UUID]] = {k: set() for k in keys}
    for side in (old_values, new_values):
        if not side:
            continue
        for col, (model, _) in keys.items():
            if col not in side:
                continue
            uid = _parse_uuid(side[col])
            if uid:
                id_by_key[col].add(uid)

    label_maps: dict[str, dict[uuid.UUID, str]] = {}
    for col, (model, label_fn) in keys.items():
        ids = id_by_key[col]
        if ids:
            label_maps[col] = await _load_labels(db, model, ids, label_fn)

    def remap(d: dict[str, Any] | None) -> dict[str, Any] | None:
        if not d:
            return d
        out = dict(d)
        for col, _ in keys.items():
            if col not in out:
                continue
            uid = _parse_uuid(out[col])
            if uid and col in label_maps and uid in label_maps[col]:
                out[col] = label_maps[col][uid]
        return out

    return remap(old_values), remap(new_values)


def _friendly_service_value_dict(d: dict[str, Any] | None) -> dict[str, Any] | None:
    """Drop duplicate status FK lines; rename remaining *_id keys for timeline display."""
    if not d:
        return d
    out = dict(d)
    if "service_status_id" in out:
        if "status" in out:
            del out["service_status_id"]
        else:
            out["status"] = out.pop("service_status_id")
    for src, dst in (
        ("vendor_id", "vendor"),
        ("category_id", "category"),
        ("cost_center_id", "cost_center"),
        ("payment_method_id", "payment_method"),
        ("contract_id", "contract"),
    ):
        if src in out:
            val = out.pop(src)
            if dst not in out:
                out[dst] = val
    return out


def _friendly_laptop_value_dict(d: dict[str, Any] | None) -> dict[str, Any] | None:
    if not d:
        return d
    out = dict(d)
    if "assigned_to_id" in out:
        val = out.pop("assigned_to_id")
        if "assigned_to" not in out:
            out["assigned_to"] = val
    return out


def _friendly_attachment_value_dict(d: dict[str, Any] | None) -> dict[str, Any] | None:
    if not d:
        return d
    out = dict(d)
    if "uploaded_by_id" in out:
        val = out.pop("uploaded_by_id")
        if "uploaded_by" not in out:
            out["uploaded_by"] = val
    return out


async def _humanize_laptop_fks(
    db: AsyncSession,
    old_values: dict[str, Any] | None,
    new_values: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    ids: set[uuid.UUID] = set()
    for side in (old_values, new_values):
        if not side or "assigned_to_id" not in side:
            continue
        uid = _parse_uuid(side["assigned_to_id"])
        if uid:
            ids.add(uid)
    if not ids:
        return old_values, new_values
    labels = await _load_labels(db, User, ids, _user_label)

    def remap(d: dict[str, Any] | None) -> dict[str, Any] | None:
        if not d or "assigned_to_id" not in d:
            return d
        out = dict(d)
        uid = _parse_uuid(out["assigned_to_id"])
        if uid and uid in labels:
            out["assigned_to_id"] = labels[uid]
        return out

    return remap(old_values), remap(new_values)


async def _humanize_attachment_fks(
    db: AsyncSession,
    old_values: dict[str, Any] | None,
    new_values: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    ids: set[uuid.UUID] = set()
    for side in (old_values, new_values):
        if not side or "uploaded_by_id" not in side:
            continue
        uid = _parse_uuid(side["uploaded_by_id"])
        if uid:
            ids.add(uid)
    if not ids:
        return old_values, new_values
    labels = await _load_labels(db, User, ids, _user_label)

    def remap(d: dict[str, Any] | None) -> dict[str, Any] | None:
        if not d or "uploaded_by_id" not in d:
            return d
        out = dict(d)
        uid = _parse_uuid(out["uploaded_by_id"])
        if uid and uid in labels:
            out["uploaded_by_id"] = labels[uid]
        return out

    return remap(old_values), remap(new_values)


async def humanize_audit_values(
    db: AsyncSession,
    entity_table: str | None,
    old_values: dict[str, Any] | None,
    new_values: dict[str, Any] | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if not entity_table:
        return old_values, new_values
    if entity_table == "services":
        old_h, new_h = await _humanize_service_fks(db, old_values, new_values)
        return _friendly_service_value_dict(old_h), _friendly_service_value_dict(new_h)
    if entity_table == "laptops":
        old_h, new_h = await _humanize_laptop_fks(db, old_values, new_values)
        return _friendly_laptop_value_dict(old_h), _friendly_laptop_value_dict(new_h)
    if entity_table == "attachments":
        old_h, new_h = await _humanize_attachment_fks(db, old_values, new_values)
        return _friendly_attachment_value_dict(old_h), _friendly_attachment_value_dict(new_h)
    return old_values, new_values
