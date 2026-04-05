"""Purge old rows from global_audit_event (scheduled via internal cron endpoint)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_audit_event import GlobalAuditEvent


async def purge_global_audit_events_older_than(
    db: AsyncSession,
    *,
    retention_days: int,
) -> int:
    """Delete audit events with occurred_at strictly before the cutoff. Returns rows deleted."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        delete(GlobalAuditEvent).where(GlobalAuditEvent.occurred_at < cutoff)
    )
    return result.rowcount or 0
