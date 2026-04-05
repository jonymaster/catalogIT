"""Audit trail via SQLAlchemy session events.

The current user's ID is attached to the session via `session.info["current_user_id"]`
by the `get_audited_db` dependency. The `after_flush` listener inspects the session for
new, modified, and deleted instances of audited models and writes GlobalAuditEvent rows.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session, UOWTransaction

from app.audit_enrichment import finalize_details_sync
from app.audit_redaction import redact_mapping, redact_serialized_row
from app.models.global_audit_event import GlobalAuditEvent

# Column names never stored in data_change audit payloads (too sensitive or noisy).
_AUDIT_OMIT_COLUMNS: dict[str, frozenset[str]] = {
    "users": frozenset({"password_hash"}),
}


def _omit_audit_columns(table: str, row: dict) -> dict:
    omit = _AUDIT_OMIT_COLUMNS.get(table, frozenset())
    return {k: v for k, v in row.items() if k not in omit}


AUDITED_TABLES: frozenset[str] = frozenset(
    {
        "services",
        "laptops",
        "vendors",
        "categories",
        "cost_centers",
        "login_methods",
        "payment_methods",
        "service_statuses",
        "contracts",
        "service_logins",
        "cost_records",
        "attachments",
        "service_history",
        "oidc_config",
        "branding_config",
        "integration_config",
        "notification_global_settings",
        "users",
        "api_tokens",
    }
)


def _serialize_value(value):
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (date, datetime)):
        if isinstance(value, datetime) and value.tzinfo is not None:
            return value.astimezone(timezone.utc).isoformat()
        return value.isoformat()
    return value


def _serialize(instance) -> dict:
    mapper = inspect(type(instance))
    result = {}
    for col in mapper.columns:
        result[col.key] = _serialize_value(getattr(instance, col.key, None))
    return redact_serialized_row(result)


def _entity_key(instance) -> str:
    insp = inspect(instance)
    if insp.identity is not None:
        return ":".join(_serialize_value(x) for x in insp.identity)
    mapper = insp.mapper
    parts = []
    for col in mapper.primary_key:
        parts.append(_serialize_value(getattr(instance, col.key, None)))
    return ":".join(parts)


def _get_changed_by(session: Session) -> uuid.UUID | None:
    raw = session.info.get("current_user_id")
    if raw is None:
        return None
    return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))


def _summary_line(table: str, action: str) -> str:
    return f"{table} {action}"


def _with_attachment_link(table: str, instance, details: dict) -> dict:
    """So asset history can include attachment rows for the parent service/laptop."""
    if table != "attachments":
        return details
    return {
        **details,
        "linked_entity_type": instance.entity_type,
        "linked_entity_id": str(instance.entity_id),
    }


def _after_flush(session: Session, flush_context: UOWTransaction) -> None:
    user_id = _get_changed_by(session)

    for instance in list(session.new):
        table = getattr(instance, "__tablename__", None)
        if table not in AUDITED_TABLES:
            continue
        key = _entity_key(instance)
        new_vals = _omit_audit_columns(table, _serialize(instance))
        ins_details = _with_attachment_link(
            table,
            instance,
            {"action": "INSERT", "old_values": None, "new_values": new_vals},
        )
        details_final = finalize_details_sync(
            session,
            redact_mapping(ins_details),
            user_id,
            instance,
        )
        session.add(
            GlobalAuditEvent(
                category="data_change",
                event_type="INSERT",
                entity_table=table,
                entity_key=key,
                actor_user_id=user_id,
                summary=_summary_line(table, "INSERT"),
                details=details_final,
            )
        )

    for instance in list(session.dirty):
        table = getattr(instance, "__tablename__", None)
        if table not in AUDITED_TABLES:
            continue
        insp = inspect(instance)
        column_keys = {a.key for a in insp.mapper.column_attrs}
        old_vals = {}
        new_vals = {}
        for attr in insp.attrs:
            if attr.key not in column_keys:
                continue
            hist = attr.history
            if hist.has_changes():
                key = attr.key
                old_val = hist.deleted[0] if hist.deleted else None
                new_val = hist.added[0] if hist.added else None
                old_vals[key] = _serialize_value(old_val)
                new_vals[key] = _serialize_value(new_val)
        old_vals = _omit_audit_columns(table, old_vals)
        new_vals = _omit_audit_columns(table, new_vals)
        if not old_vals and not new_vals:
            continue
        key = _entity_key(instance)
        upd_details = _with_attachment_link(
            table,
            instance,
            {"action": "UPDATE", "old_values": old_vals, "new_values": new_vals},
        )
        details_final = finalize_details_sync(
            session,
            redact_mapping(upd_details),
            user_id,
            instance,
        )
        session.add(
            GlobalAuditEvent(
                category="data_change",
                event_type="UPDATE",
                entity_table=table,
                entity_key=key,
                actor_user_id=user_id,
                summary=_summary_line(table, "UPDATE"),
                details=details_final,
            )
        )

    for instance in list(session.deleted):
        table = getattr(instance, "__tablename__", None)
        if table not in AUDITED_TABLES:
            continue
        old_vals = _omit_audit_columns(table, _serialize(instance))
        key = _entity_key(instance)
        del_details = _with_attachment_link(
            table,
            instance,
            {"action": "DELETE", "old_values": old_vals, "new_values": None},
        )
        details_final = finalize_details_sync(
            session,
            redact_mapping(del_details),
            user_id,
            instance,
        )
        session.add(
            GlobalAuditEvent(
                category="data_change",
                event_type="DELETE",
                entity_table=table,
                entity_key=key,
                actor_user_id=user_id,
                summary=_summary_line(table, "DELETE"),
                details=details_final,
            )
        )


def register_audit_listeners() -> None:
    """Call once at app startup to wire up audit event listeners."""
    event.listen(Session, "after_flush", _after_flush)
