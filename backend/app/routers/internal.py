from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_retention import purge_global_audit_events_older_than
from app.config import get_settings
from app.database import get_db
from app.notifications.renewal_dispatch import run_renewal_dispatch
from app.schemas.notifications import RenewalDispatchResult

router = APIRouter(prefix="/api/internal", tags=["internal"])


def _require_cron_secret(x_cron_secret: str | None) -> None:
    cfg = get_settings()
    secret = (cfg.CRON_SECRET or "").strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRON_SECRET is not configured",
        )
    if not x_cron_secret:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing X-Cron-Secret header",
        )
    try:
        ok = secrets.compare_digest(x_cron_secret, secret)
    except (TypeError, ValueError):
        ok = False
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid X-Cron-Secret",
        )


@router.post("/notifications/renewal-dispatch", response_model=RenewalDispatchResult)
async def post_renewal_dispatch(
    db: AsyncSession = Depends(get_db),
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
    _require_cron_secret(x_cron_secret)
    return await run_renewal_dispatch(db)


class AuditRetentionResult(BaseModel):
    deleted_rows: int
    retention_days: int


@router.post("/audit-retention", response_model=AuditRetentionResult)
async def post_audit_retention(
    db: AsyncSession = Depends(get_db),
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
    retention_days: int | None = Query(
        None,
        ge=1,
        le=3650,
        description="Defaults to AUDIT_RETENTION_DAYS from settings (e.g. 90).",
    ),
):
    """Delete global audit events older than retention_days. Schedule daily (same CRON_SECRET as renewal-dispatch)."""
    _require_cron_secret(x_cron_secret)
    cfg = get_settings()
    days = retention_days if retention_days is not None else cfg.AUDIT_RETENTION_DAYS
    deleted = await purge_global_audit_events_older_than(db, retention_days=days)
    return AuditRetentionResult(deleted_rows=deleted, retention_days=days)
