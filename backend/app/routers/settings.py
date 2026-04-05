from __future__ import annotations

import httpx

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.notification_global_settings import NotificationGlobalSettings
from app.models.oidc_config import OidcConfig
from app.models.global_audit_event import GlobalAuditEvent
from app.models.user import User
from app.schemas.audit import GlobalAuditEventRead, PaginatedGlobalAuditResponse
from app.schemas.notifications import NotificationSettingsRead, NotificationSettingsUpdate
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from app.schemas.oidc import OidcConfigRead, OidcConfigWrite, OidcTestResult

router = APIRouter(prefix="/api/settings", tags=["settings"])

_admin = require_role("admin")


@router.get("/oidc", response_model=OidcConfigRead | None)
async def get_oidc_config(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    config = await db.get(OidcConfig, 1)
    return config


@router.put("/oidc", response_model=OidcConfigRead)
async def save_oidc_config(
    body: OidcConfigWrite,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    config = await db.get(OidcConfig, 1)
    if config is None:
        config = OidcConfig(id=1)
        db.add(config)

    config.provider_name = body.provider_name
    config.issuer_url = body.issuer_url
    config.client_id = body.client_id
    if body.client_secret:
        config.client_secret = body.client_secret
    config.scopes = body.scopes
    config.enabled = body.enabled

    await db.flush()
    await db.refresh(config)
    return config


@router.post("/oidc/test", response_model=OidcTestResult)
async def test_oidc_config(
    body: OidcConfigWrite,
    _user: User = Depends(_admin),
):
    """Fetch the OIDC discovery document to verify the configuration is reachable."""
    url = body.issuer_url.rstrip("/") + "/.well-known/openid-configuration"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return OidcTestResult(success=False, error=f"HTTP {resp.status_code} from discovery endpoint")
        data = resp.json()
        return OidcTestResult(
            success=True,
            issuer=data.get("issuer", ""),
            authorization_endpoint=data.get("authorization_endpoint", ""),
            token_endpoint=data.get("token_endpoint", ""),
        )
    except httpx.HTTPError as exc:
        return OidcTestResult(success=False, error=str(exc))


class ScimStatus(BaseModel):
    enabled: bool
    endpoint_url: str


@router.get("/scim", response_model=ScimStatus)
async def get_scim_status(_user: User = Depends(_admin)):
    settings = get_settings()
    base = settings.PUBLIC_BASE_URL.rstrip("/")
    return ScimStatus(
        enabled=bool(settings.SCIM_TOKEN),
        endpoint_url=f"{base}/scim/v2",
    )


def _validate_renewal_offsets(days: list[int]) -> list[int]:
    if not days:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="renewal_offsets_days must contain at least one positive integer",
        )
    seen: set[int] = set()
    out: list[int] = []
    for x in days:
        if not isinstance(x, int) or x <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="renewal_offsets_days must be positive integers only",
            )
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _settings_to_read(row: NotificationGlobalSettings) -> NotificationSettingsRead:
    return NotificationSettingsRead(
        renewal_reminders_enabled=row.renewal_reminders_enabled,
        renewal_offsets_days=list(row.renewal_offsets_days),
        calendar_timezone=row.calendar_timezone,
        renewal_email_subject_template=row.renewal_email_subject_template,
        renewal_email_html_template=row.renewal_email_html_template,
        renewal_email_text_template=row.renewal_email_text_template,
        extra_recipient_ids=[u.id for u in row.extra_recipients],
        updated_at=row.updated_at,
    )


@router.get("/notifications", response_model=NotificationSettingsRead)
async def get_notification_settings(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(NotificationGlobalSettings, 1)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification settings not initialized",
        )
    return _settings_to_read(row)


@router.patch("/notifications", response_model=NotificationSettingsRead)
async def patch_notification_settings(
    body: NotificationSettingsUpdate,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await db.get(NotificationGlobalSettings, 1)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification settings not initialized",
        )
    data = body.model_dump(exclude_unset=True)
    if "renewal_offsets_days" in data:
        data["renewal_offsets_days"] = _validate_renewal_offsets(data["renewal_offsets_days"])

    extra_ids = data.pop("extra_recipient_ids", None)
    if extra_ids is not None:
        users = (
            await db.execute(
                select(User).where(User.id.in_(extra_ids), User.is_active.is_(True))
            )
        ).scalars().all()
        found_ids = {u.id for u in users}
        missing = [str(uid) for uid in extra_ids if uid not in found_ids]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Users not found or inactive: {', '.join(missing)}",
            )
        row.extra_recipients = list(users)

    for key, value in data.items():
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)
    return _settings_to_read(row)


@router.get("/audit-events", response_model=PaginatedGlobalAuditResponse)
async def list_audit_events(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    category: str | None = Query(
        None,
        description="Filter: data_change, security, notification, error",
    ),
):
    filters = []
    if category:
        filters.append(GlobalAuditEvent.category == category)

    count_stmt = select(func.count()).select_from(GlobalAuditEvent)
    if filters:
        count_stmt = count_stmt.where(*filters)
    total_count = int((await db.execute(count_stmt)).scalar_one())

    if total_count == 0:
        return PaginatedGlobalAuditResponse(
            items=[],
            page=page,
            per_page=per_page,
            total_count=0,
            total_pages=0,
        )

    total_pages = (total_count + per_page - 1) // per_page
    if page > total_pages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Page out of range (max {total_pages})",
        )

    offset = (page - 1) * per_page
    stmt = select(GlobalAuditEvent).options(selectinload(GlobalAuditEvent.actor))
    if filters:
        stmt = stmt.where(*filters)
    stmt = (
        stmt.order_by(GlobalAuditEvent.occurred_at.desc(), GlobalAuditEvent.id.desc())
        .offset(offset)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    items = [GlobalAuditEventRead.from_orm_event(e) for e in rows]
    return PaginatedGlobalAuditResponse(
        items=items,
        page=page,
        per_page=per_page,
        total_count=total_count,
        total_pages=total_pages if total_count else 0,
    )
