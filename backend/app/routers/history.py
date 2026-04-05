from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.db import get_audited_db
from app.history_display import humanize_audit_values
from app.models.global_audit_event import GlobalAuditEvent
from app.schemas.audit import AuditLogRead, PaginatedHistoryResponse

router = APIRouter(prefix="/api/history", tags=["history"])


def _history_filters(table_name: str, record_id: uuid.UUID):
    """Service/laptop asset timelines include their attachment rows (see audit linked_entity_*)."""
    key = str(record_id)
    base = GlobalAuditEvent.category == "data_change"

    if table_name == "services":
        return and_(
            base,
            or_(
                and_(
                    GlobalAuditEvent.entity_table == "services",
                    GlobalAuditEvent.entity_key == key,
                ),
                and_(
                    GlobalAuditEvent.entity_table == "attachments",
                    GlobalAuditEvent.details["linked_entity_type"].astext == "service",
                    GlobalAuditEvent.details["linked_entity_id"].astext == key,
                ),
            ),
        )

    if table_name == "laptops":
        return and_(
            base,
            or_(
                and_(
                    GlobalAuditEvent.entity_table == "laptops",
                    GlobalAuditEvent.entity_key == key,
                ),
                and_(
                    GlobalAuditEvent.entity_table == "attachments",
                    GlobalAuditEvent.details["linked_entity_type"].astext == "laptop",
                    GlobalAuditEvent.details["linked_entity_id"].astext == key,
                ),
            ),
        )

    return and_(
        base,
        GlobalAuditEvent.entity_table == table_name,
        GlobalAuditEvent.entity_key == key,
    )


@router.get("/{table_name}/{record_id}", response_model=PaginatedHistoryResponse)
async def get_history(
    table_name: str,
    record_id: uuid.UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_audited_db),
):
    scope = _history_filters(table_name, record_id)

    count_stmt = select(func.count()).select_from(GlobalAuditEvent).where(scope)
    total_count = int((await db.execute(count_stmt)).scalar_one())

    if total_count == 0:
        return PaginatedHistoryResponse(
            items=[],
            page=page,
            per_page=per_page,
            total_count=0,
            total_pages=0,
        )

    total_pages = (total_count + per_page - 1) // per_page
    if page > total_pages:
        raise HTTPException(status_code=400, detail=f"Page out of range (max {total_pages})")

    offset = (page - 1) * per_page
    stmt = (
        select(GlobalAuditEvent)
        .options(selectinload(GlobalAuditEvent.actor))
        .where(scope)
        .order_by(GlobalAuditEvent.occurred_at.desc(), GlobalAuditEvent.id.desc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    items: list[AuditLogRead] = []
    for e in rows:
        read = AuditLogRead.from_global_event(e, record_id)
        old, new = await humanize_audit_values(
            db, e.entity_table, read.old_values, read.new_values
        )
        items.append(read.model_copy(update={"old_values": old, "new_values": new}))
    return PaginatedHistoryResponse(
        items=items,
        page=page,
        per_page=per_page,
        total_count=total_count,
        total_pages=total_pages,
    )
