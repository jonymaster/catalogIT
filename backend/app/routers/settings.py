from __future__ import annotations

import os
import re
import uuid

import httpx

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.dependencies.storage import get_s3_client
from app.models.notification_global_settings import NotificationGlobalSettings
from app.models.oidc_config import OidcConfig
from app.models.global_audit_event import GlobalAuditEvent
from app.models.user import User
from app.notifications.email_templates import (
    collect_template_s3_keys,
    delete_s3_keys,
    preview_notification_email,
)
from app.schemas.audit import GlobalAuditEventRead, PaginatedGlobalAuditResponse
from app.schemas.notifications import (
    NotificationEmailPreviewRequest,
    NotificationEmailPreviewResponse,
    NotificationSettingsRead,
    NotificationSettingsUpdate,
)
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


def _normalize_asset_keys(raw: object) -> dict[str, str] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    for k, v in raw.items():
        if isinstance(k, str) and isinstance(v, str) and v.strip():
            out[k] = v.strip()
    return out or None


def _settings_to_read(row: NotificationGlobalSettings) -> NotificationSettingsRead:
    return NotificationSettingsRead(
        renewal_reminders_enabled=row.renewal_reminders_enabled,
        renewal_offsets_days=list(row.renewal_offsets_days),
        calendar_timezone=row.calendar_timezone,
        renewal_email_subject_template=row.renewal_email_subject_template,
        renewal_email_html_template=row.renewal_email_html_template,
        renewal_email_text_template=row.renewal_email_text_template,
        renewal_email_html_storage_key=row.renewal_email_html_storage_key,
        renewal_email_template_asset_keys=_normalize_asset_keys(row.renewal_email_template_asset_keys),
        extra_recipient_ids=[u.id for u in row.extra_recipients],
        updated_at=row.updated_at,
    )


async def _get_notification_settings_row(
    db: AsyncSession,
) -> NotificationGlobalSettings | None:
    result = await db.execute(
        select(NotificationGlobalSettings)
        .where(NotificationGlobalSettings.id == 1)
        .options(selectinload(NotificationGlobalSettings.extra_recipients))
    )
    return result.scalar_one_or_none()


_MAX_EMAIL_HTML_UPLOAD = 2 * 1024 * 1024
_MAX_EMAIL_ASSET_UPLOAD = 10 * 1024 * 1024
_ALLOWED_HTML_CT = frozenset(
    {"text/html", "application/octet-stream", "text/plain", "application/xhtml+xml"}
)
_ALLOWED_IMAGE_CT = frozenset(
    {
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "application/octet-stream",
    }
)


def _sanitize_asset_filename(name: str) -> str:
    base = os.path.basename(name or "asset")
    base = re.sub(r'[\x00-\x1f"\\]', "", base)
    return base or "asset.png"


def _cid_from_filename(filename: str) -> str:
    stem, _dot = os.path.splitext(filename)
    stem = stem.strip() or "asset"
    stem = re.sub(r"[^a-zA-Z0-9_-]", "_", stem)
    return stem[:64] or "asset"


@router.get("/notifications", response_model=NotificationSettingsRead)
async def get_notification_settings(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_notification_settings_row(db)
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
    row = await _get_notification_settings_row(db)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification settings not initialized",
        )
    old_s3_keys = collect_template_s3_keys(row)
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
    new_s3_keys = collect_template_s3_keys(row)
    await delete_s3_keys([k for k in old_s3_keys if k not in set(new_s3_keys)])
    return _settings_to_read(row)


@router.post(
    "/notifications/email-preview",
    response_model=NotificationEmailPreviewResponse,
)
async def preview_notification_email_endpoint(
    body: NotificationEmailPreviewRequest,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        subj, html, text = await preview_notification_email(db, body.sample_data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return NotificationEmailPreviewResponse(subject=subj, html=html, text=text)


@router.post("/notifications/email-template-upload", response_model=NotificationSettingsRead)
async def upload_notification_email_template(
    html: UploadFile = File(...),
    assets: list[UploadFile] | None = File(None),
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    row = await _get_notification_settings_row(db)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification settings not initialized",
        )
    old_s3_keys = collect_template_s3_keys(row)
    fname = (html.filename or "").lower()
    if not fname.endswith((".html", ".htm")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="HTML upload must be a .html or .htm file.",
        )
    ct = (html.content_type or "").split(";")[0].strip().lower()
    if ct and ct not in _ALLOWED_HTML_CT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported HTML content type: {html.content_type}",
        )
    html_bytes = await html.read()
    if len(html_bytes) > _MAX_EMAIL_HTML_UPLOAD:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="HTML file exceeds maximum size (2 MB).",
        )
    if not html_bytes.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="HTML file is empty.")

    asset_list = assets or []
    asset_keys: dict[str, str] = {}
    upload_uid = uuid.uuid4()
    prefix = f"email-templates/renewal/{upload_uid}/"
    html_key = prefix + "template.html"
    cfg = get_settings()

    async with get_s3_client() as s3:
        await s3.put_object(
            Bucket=cfg.MINIO_BUCKET_NAME,
            Key=html_key,
            Body=html_bytes,
            ContentType="text/html; charset=utf-8",
        )

        for uf in asset_list:
            raw = await uf.read()
            if len(raw) > _MAX_EMAIL_ASSET_UPLOAD:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"Asset {uf.filename} exceeds maximum size (10 MB).",
                )
            fn = _sanitize_asset_filename(uf.filename or "")
            if not re.search(r"\.(png|jpe?g|gif|webp|svg)$", fn, re.I):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported asset type (use png, jpg, gif, webp, svg): {fn}",
                )
            act = (uf.content_type or "").split(";")[0].strip().lower()
            if act and act not in _ALLOWED_IMAGE_CT:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported image content type for {fn}: {uf.content_type}",
                )
            cid = _cid_from_filename(fn)
            if cid in asset_keys:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Duplicate asset CID after normalizing filename: {fn}",
                )
            akey = prefix + fn
            await s3.put_object(
                Bucket=cfg.MINIO_BUCKET_NAME,
                Key=akey,
                Body=raw,
                ContentType=act or "application/octet-stream",
            )
            asset_keys[cid] = akey

    row.renewal_email_html_storage_key = html_key
    row.renewal_email_template_asset_keys = asset_keys or None
    row.renewal_email_html_template = None
    await db.flush()
    await db.refresh(row)
    new_keys = collect_template_s3_keys(row)
    await delete_s3_keys([k for k in old_s3_keys if k not in set(new_keys)])
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
