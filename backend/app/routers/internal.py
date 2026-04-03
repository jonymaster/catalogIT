from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.notifications.renewal_dispatch import run_renewal_dispatch
from app.schemas.notifications import RenewalDispatchResult

router = APIRouter(prefix="/api/internal", tags=["internal"])


@router.post("/notifications/renewal-dispatch", response_model=RenewalDispatchResult)
async def post_renewal_dispatch(
    db: AsyncSession = Depends(get_db),
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
):
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
    return await run_renewal_dispatch(db)
