from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies.db import get_audited_db
from app.dependencies.auth import (
    ensure_financial_view_access,
    ensure_hardware_view_access,
    get_current_user,
)
from app.models.cost_record import CostRecord
from app.models.user import User
from app.history_display import humanize_audit_values
from app.models.global_audit_event import GlobalAuditEvent
from app.schemas.audit import AuditLogRead, PaginatedHistoryResponse

router = APIRouter(prefix="/api/history", tags=["history"])

# Access needed to read each audited table's history. Tables not listed return 404.
_CATALOG_TABLES = frozenset({
    "services",
    "vendors",
    "tags",
    "categories",
    "cost_centers",
    "payment_methods",
    "service_statuses",
    "service_classifications",
    "contracts",
    "service_history",
})
_HARDWARE_TABLES = frozenset({"hardware_assets", "laptops", "hardware_statuses", "hardware_locations"})
_FINANCIAL_TABLES = frozenset({"cost_records"})
# Attachments are read through their service/hardware timelines; standalone history is admin-only.
_ADMIN_TABLES = frozenset({
    "users",
    "api_tokens",
    "oidc_config",
    "integration_config",
    "notification_global_settings",
    "attachments",
})


async def _ensure_history_access(
    table_name: str, record_id: uuid.UUID, user: User, db: AsyncSession
) -> None:
    if table_name in _CATALOG_TABLES:
        return
    if table_name in _HARDWARE_TABLES:
        await ensure_hardware_view_access(user, db)
        return
    if table_name in _FINANCIAL_TABLES:
        await ensure_financial_view_access(user, db)
        # Hardware cost records also need hardware visibility, as on their own router.
        record = await db.get(CostRecord, record_id)
        if record is not None and record.hardware_id is not None:
            await ensure_hardware_view_access(user, db)
        return
    if table_name in _ADMIN_TABLES:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return
    raise HTTPException(status_code=404, detail="History is not available for this table")


def _history_filters(table_name: str, record_id: uuid.UUID):
    """Service/hardware asset timelines include their attachment rows (see audit linked_entity_*)."""
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

    if table_name in ("hardware_assets", "laptops"):
        # Historical events remain immutable and are read alongside new events.
        return and_(
            base,
            or_(
                and_(
                    GlobalAuditEvent.entity_table.in_(["hardware_assets", "laptops"]),
                    GlobalAuditEvent.entity_key == key,
                ),
                and_(
                    GlobalAuditEvent.entity_table == "attachments",
                    GlobalAuditEvent.details["linked_entity_type"].astext.in_(["hardware", "laptop"]),
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
    user: User = Depends(get_current_user),
):
    await _ensure_history_access(table_name, record_id, user, db)
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
