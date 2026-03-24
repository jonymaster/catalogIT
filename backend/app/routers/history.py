from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.db import get_audited_db
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogRead

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/{table_name}/{record_id}", response_model=list[AuditLogRead])
async def get_history(
    table_name: str,
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_audited_db),
):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.table_name == table_name, AuditLog.record_id == record_id)
        .order_by(AuditLog.timestamp.desc())
    )
    return result.scalars().all()
