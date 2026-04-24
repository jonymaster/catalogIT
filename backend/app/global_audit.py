"""Insert global audit events (async); standalone commit for error logging outside requests."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_enrichment import finalize_details_async
from app.database import async_session
from app.models.global_audit_event import GlobalAuditEvent
from app.request_context import request_id_ctx


def _effective_request_id(request_id: str | None) -> str | None:
    return request_id if request_id is not None else request_id_ctx.get()


async def record_global_audit_event(
    db: AsyncSession,
    *,
    category: str,
    event_type: str,
    entity_table: str | None = None,
    entity_key: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    summary: str | None = None,
    details: dict[str, Any] | None = None,
    request_id: str | None = None,
    entity_label: str | None = None,
) -> None:
    merged = await finalize_details_async(
        db,
        details,
        actor_user_id,
        entity_label=entity_label,
        entity_table=entity_table,
        entity_key=entity_key,
    )
    db.add(
        GlobalAuditEvent(
            category=category,
            event_type=event_type,
            entity_table=entity_table,
            entity_key=entity_key,
            actor_user_id=actor_user_id,
            summary=summary,
            details=merged,
            request_id=_effective_request_id(request_id),
        )
    )


async def record_global_audit_event_committed(
    *,
    category: str,
    event_type: str,
    entity_table: str | None = None,
    entity_key: str | None = None,
    actor_user_id: uuid.UUID | None = None,
    summary: str | None = None,
    details: dict[str, Any] | None = None,
    request_id: str | None = None,
    entity_label: str | None = None,
) -> None:
    """Own session + commit; use when the caller session may be rolled back (e.g. error handler)."""
    async with async_session() as session:
        merged = await finalize_details_async(
            session,
            details,
            actor_user_id,
            entity_label=entity_label,
            entity_table=entity_table,
            entity_key=entity_key,
        )
        session.add(
            GlobalAuditEvent(
                category=category,
                event_type=event_type,
                entity_table=entity_table,
                entity_key=entity_key,
                actor_user_id=actor_user_id,
                summary=summary,
                details=merged,
                request_id=_effective_request_id(request_id),
            )
        )
        await session.commit()
