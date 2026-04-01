"""Audit trail via SQLAlchemy session events.

The current user's ID is attached to the session via `session.info["current_user_id"]`
by the `get_db` dependency. The `after_flush` listener inspects the session for
new, modified, and deleted instances of audited models and writes AuditLog rows.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session, UOWTransaction

from app.models.audit_log import AuditLog

AUDITED_TABLES: set[str] = {"services", "laptops"}


def _serialize(instance) -> dict:
    """Convert an ORM instance to a plain dict of column values."""
    mapper = inspect(type(instance))
    result = {}
    for col in mapper.columns:
        val = getattr(instance, col.key, None)
        if isinstance(val, uuid.UUID):
            val = str(val)
        elif isinstance(val, datetime):
            val = val.isoformat()
        result[col.key] = val
    return result


def _get_changed_by(session: Session) -> uuid.UUID | None:
    raw = session.info.get("current_user_id")
    if raw is None:
        return None
    return raw if isinstance(raw, uuid.UUID) else uuid.UUID(str(raw))


def _after_flush(session: Session, flush_context: UOWTransaction) -> None:
    user_id = _get_changed_by(session)

    for instance in list(session.new):
        table = getattr(instance, "__tablename__", None)
        if table not in AUDITED_TABLES:
            continue
        session.add(AuditLog(
            table_name=table,
            record_id=instance.id,
            action="INSERT",
            changed_by_id=user_id,
            new_values=_serialize(instance),
        ))

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
                if isinstance(old_val, uuid.UUID):
                    old_val = str(old_val)
                if isinstance(new_val, uuid.UUID):
                    new_val = str(new_val)
                if isinstance(old_val, datetime):
                    old_val = old_val.isoformat()
                if isinstance(new_val, datetime):
                    new_val = new_val.isoformat()
                old_vals[key] = old_val
                new_vals[key] = new_val
        if old_vals or new_vals:
            session.add(AuditLog(
                table_name=table,
                record_id=instance.id,
                action="UPDATE",
                changed_by_id=user_id,
                old_values=old_vals,
                new_values=new_vals,
            ))

    for instance in list(session.deleted):
        table = getattr(instance, "__tablename__", None)
        if table not in AUDITED_TABLES:
            continue
        session.add(AuditLog(
            table_name=table,
            record_id=instance.id,
            action="DELETE",
            changed_by_id=user_id,
            old_values=_serialize(instance),
        ))


def register_audit_listeners() -> None:
    """Call once at app startup to wire up audit event listeners."""
    event.listen(Session, "after_flush", _after_flush)
