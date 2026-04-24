"""Enrich audit `details` JSON with context (time, actor email, IP, entity metadata)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.exc import NoInspectionAvailable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.laptop import Laptop
from app.models.service import Service
from app.models.user import User
from app.models.vendor import Vendor
from app.request_context import client_ip_ctx, request_id_ctx, user_agent_ctx


def _apply_request_context(out: dict[str, Any]) -> None:
    out.setdefault("recorded_at", datetime.now(timezone.utc).isoformat())
    rid = request_id_ctx.get()
    if rid:
        out.setdefault("request_id", rid)
    ip = client_ip_ctx.get()
    if ip:
        out.setdefault("client_ip", ip)
    ua = user_agent_ctx.get()
    if ua:
        out.setdefault("user_agent", ua[:500])


def _serialize_context_value(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).isoformat()
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def _instance_key(instance: Any) -> str | None:
    if instance is None:
        return None
    try:
        inspected = sa_inspect(instance)
    except NoInspectionAvailable:
        raw_id = getattr(instance, "id", None)
        return str(raw_id) if raw_id is not None else None
    if inspected.identity is not None:
        return ":".join(str(_serialize_context_value(x)) for x in inspected.identity)
    parts = []
    for col in inspected.mapper.primary_key:
        val = getattr(instance, col.key, None)
        if val is None:
            return None
        parts.append(str(_serialize_context_value(val)))
    return ":".join(parts)


_ENTITY_TYPES = {
    "api_tokens": "api_token",
    "attachments": "attachment",
    "categories": "category",
    "contracts": "contract",
    "cost_centers": "cost_center",
    "cost_records": "cost_record",
    "hardware_locations": "hardware_location",
    "hardware_statuses": "hardware_status",
    "integration_config": "integration",
    "laptops": "hardware",
    "notification_global_settings": "notification_settings",
    "oidc_config": "oidc_config",
    "payment_methods": "payment_method",
    "service_classifications": "service_classification",
    "service_history": "service_history",
    "service_statuses": "service_status",
    "services": "service",
    "tags": "tag",
    "users": "user",
    "vendors": "vendor",
}


def _entity_type(table: str | None) -> str | None:
    if not table:
        return None
    return _ENTITY_TYPES.get(table, table[:-1] if table.endswith("s") else table)


def entity_display_label(instance: Any) -> str | None:
    """Best-effort human label for an ORM instance (service name, user email, file name, etc.)."""
    if instance is None:
        return None
    table = getattr(instance, "__tablename__", None)
    if table == "cost_records":
        year = getattr(instance, "fiscal_year", None)
        record_type = getattr(instance, "record_type", None)
        target = "service" if getattr(instance, "service_id", None) else "hardware"
        parts = [target.capitalize(), "cost"]
        if year is not None:
            parts.append(str(year))
        if record_type:
            parts.append(str(record_type))
        return " ".join(parts)
    if table == "service_history":
        action_type = getattr(instance, "action_type", None)
        action_date = getattr(instance, "action_date", None)
        if action_type or action_date:
            return " ".join(str(x) for x in (action_type, action_date) if x)
    if table == "laptops":
        model = getattr(instance, "model_name", None)
        serial = getattr(instance, "serial_number", None)
        if model and serial:
            return f"{model} ({serial})"
    for attr in (
        "name",
        "title",
        "email",
        "original_filename",
        "provider_name",
        "serial_number",
        "model_name",
        "contract_ref",
        "channel",
    ):
        v = getattr(instance, attr, None)
        if v is not None and str(v).strip():
            return str(v).strip()
    fn = getattr(instance, "first_name", None)
    ln = getattr(instance, "last_name", None)
    if fn or ln:
        parts = f"{fn or ''} {ln or ''}".strip()
        if parts:
            return parts
    return None


def _add_if_present(out: dict[str, Any], instance: Any, keys: tuple[str, ...]) -> None:
    for key in keys:
        value = getattr(instance, key, None)
        if value is not None:
            out[key] = _serialize_context_value(value)


def _compact_entity(
    *,
    table: str | None,
    key: str | None,
    label: str | None,
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if table:
        entity_type = _entity_type(table)
        if entity_type:
            out["type"] = entity_type
    if key:
        serialized_key = _serialize_context_value(key)
        out["id"] = serialized_key
    if label:
        out["label"] = label
    return out


def _drop_redundant_label(entity: dict[str, Any]) -> None:
    label = entity.get("label")
    if not label:
        return
    for key in (
        "name",
        "email",
        "display_name",
        "original_filename",
        "serial_number",
        "model_name",
        "contract_ref",
        "channel",
    ):
        if entity.get(key) == label:
            entity.pop("label", None)
            return


def _related_entity_from_instance(instance: Any) -> dict[str, Any] | None:
    if instance is None:
        return None
    table = getattr(instance, "__tablename__", None)
    key = _instance_key(instance)
    label = entity_display_label(instance)
    entity = _compact_entity(table=table, key=key, label=label)
    if table == "services":
        _add_if_present(entity, instance, ("name", "status"))
    elif table == "laptops":
        _add_if_present(entity, instance, ("model_name", "serial_number", "status"))
    elif table == "users":
        _add_if_present(entity, instance, ("email", "display_name", "department", "role"))
    elif table == "vendors":
        _add_if_present(entity, instance, ("name",))
    _drop_redundant_label(entity)
    return entity or None


def _load_related_sync(session: Session | None, model: type, entity_id: Any) -> Any | None:
    if session is None or entity_id is None:
        return None
    try:
        return session.get(model, entity_id)
    except Exception:
        return None


def entity_audit_context_sync(
    session: Session | None,
    instance: Any | None,
) -> dict[str, Any] | None:
    """Build a compact, human-oriented entity description for audit details."""
    if instance is None:
        return None
    table = getattr(instance, "__tablename__", None)
    key = _instance_key(instance)
    label = entity_display_label(instance)
    entity = _compact_entity(table=table, key=key, label=label)
    if not entity:
        return None

    if table == "services":
        _add_if_present(entity, instance, ("name", "status"))
    elif table == "laptops":
        _add_if_present(entity, instance, ("model_name", "serial_number", "status"))
    elif table == "users":
        _add_if_present(entity, instance, ("email", "display_name", "department", "role"))
    elif table == "vendors":
        _add_if_present(entity, instance, ("name",))
    elif table == "cost_records":
        _add_if_present(
            entity,
            instance,
            ("service_id", "laptop_id", "fiscal_year", "purchase_year", "record_type", "amount"),
        )
        service = _load_related_sync(session, Service, getattr(instance, "service_id", None))
        laptop = _load_related_sync(session, Laptop, getattr(instance, "laptop_id", None))
        parent = _related_entity_from_instance(service or laptop)
        if parent:
            entity["parent"] = parent
    elif table == "attachments":
        _add_if_present(
            entity,
            instance,
            ("entity_type", "entity_id", "filename", "original_filename", "content_type"),
        )
        target_type = getattr(instance, "entity_type", None)
        model = Service if target_type == "service" else Laptop if target_type == "laptop" else None
        parent = _related_entity_from_instance(
            _load_related_sync(session, model, getattr(instance, "entity_id", None)) if model else None
        )
        if parent:
            entity["parent"] = parent
    elif table == "service_history":
        _add_if_present(entity, instance, ("service_id", "action_date", "action_type"))
        parent = _related_entity_from_instance(
            _load_related_sync(session, Service, getattr(instance, "service_id", None))
        )
        if parent:
            entity["parent"] = parent
    elif table == "contracts":
        _add_if_present(entity, instance, ("vendor_id", "contract_ref", "start_date", "end_date"))
        parent = _related_entity_from_instance(
            _load_related_sync(session, Vendor, getattr(instance, "vendor_id", None))
        )
        if parent:
            entity["parent"] = parent
    else:
        _add_if_present(
            entity,
            instance,
            (
                "name",
                "email",
                "title",
                "original_filename",
                "provider_name",
                "contract_ref",
                "channel",
            ),
        )

    _drop_redundant_label(entity)
    return entity


def entity_audit_context_from_values(
    *,
    entity_table: str | None,
    entity_key: str | None,
    entity_label: str | None,
) -> dict[str, Any] | None:
    entity = _compact_entity(table=entity_table, key=entity_key, label=entity_label)
    return entity or None


def finalize_details_sync(
    session: Session,
    details: dict[str, Any] | None,
    actor_user_id: uuid.UUID | None,
    instance: Any | None = None,
) -> dict[str, Any]:
    out = dict(details) if details else {}
    _apply_request_context(out)
    if actor_user_id:
        user = session.get(User, actor_user_id)
        if user and user.email:
            out["actor_email"] = user.email
    if instance is not None:
        label = entity_display_label(instance)
        if label:
            out.setdefault("entity_label", label)
        entity = entity_audit_context_sync(session, instance)
        if entity:
            out.setdefault("entity", entity)
    return out


async def finalize_details_async(
    db: AsyncSession,
    details: dict[str, Any] | None,
    actor_user_id: uuid.UUID | None,
    *,
    entity_label: str | None = None,
    entity_table: str | None = None,
    entity_key: str | None = None,
) -> dict[str, Any]:
    out = dict(details) if details else {}
    _apply_request_context(out)
    if actor_user_id:
        user = await db.get(User, actor_user_id)
        if user and user.email:
            out["actor_email"] = user.email
    if entity_label:
        out.setdefault("entity_label", entity_label)
    entity = entity_audit_context_from_values(
        entity_table=entity_table,
        entity_key=entity_key,
        entity_label=entity_label,
    )
    if entity:
        out.setdefault("entity", entity)
    return out
