from __future__ import annotations

import httpx
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.dependencies.storage import get_s3_client
from app.models.branding_config import BrandingConfig
from app.models.notification_global_settings import NotificationGlobalSettings
from app.models.oidc_config import OidcConfig
from app.models.user import User
from app.schemas.branding import BrandingRead
from app.schemas.notifications import NotificationSettingsRead, NotificationSettingsUpdate
from sqlalchemy import select
from app.schemas.oidc import OidcConfigRead, OidcConfigWrite, OidcTestResult

router = APIRouter(prefix="/api/settings", tags=["settings"])

_admin = require_role("admin")
ALLOWED_LOGO_CONTENT_TYPES = {
    "image/png",
    "image/jpeg",
    "image/svg+xml",
    "image/webp",
}
MAX_LOGO_SIZE = 5 * 1024 * 1024


def _branding_payload(config: BrandingConfig | None) -> BrandingRead:
    logo_url = None
    logo_filename = None
    updated_at = None

    if config and config.logo_storage_key:
        logo_url = "/api/settings/branding/logo"
        logo_filename = config.logo_filename
        updated_at = config.updated_at

    return BrandingRead(
        logo_url=logo_url,
        logo_filename=logo_filename,
        updated_at=updated_at,
    )


async def _get_branding_config(db: AsyncSession) -> BrandingConfig | None:
    return await db.get(BrandingConfig, 1)


async def _get_or_create_branding_config(db: AsyncSession) -> BrandingConfig:
    config = await _get_branding_config(db)
    if config is None:
        config = BrandingConfig(id=1)
        db.add(config)
        await db.flush()
    return config


async def _delete_branding_logo(config: BrandingConfig) -> None:
    if not config.logo_storage_key:
        return

    settings = get_settings()
    async with get_s3_client() as s3:
        await s3.delete_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=config.logo_storage_key,
        )

    config.logo_filename = None
    config.logo_content_type = None
    config.logo_storage_key = None


@router.get("/branding", response_model=BrandingRead)
async def get_branding(
    db: AsyncSession = Depends(get_db),
):
    config = await _get_branding_config(db)
    return _branding_payload(config)


@router.get("/branding/logo")
async def get_branding_logo(
    db: AsyncSession = Depends(get_db),
):
    config = await _get_branding_config(db)
    if not config or not config.logo_storage_key or not config.logo_content_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Logo not configured",
        )

    settings = get_settings()
    async with get_s3_client() as s3:
        response = await s3.get_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=config.logo_storage_key,
        )
        body = await response["Body"].read()

    return Response(content=body, media_type=config.logo_content_type)


@router.post("/branding/logo", response_model=BrandingRead)
async def upload_branding_logo(
    file: UploadFile,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    if file.content_type not in ALLOWED_LOGO_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "File type not allowed. Accepted types: "
                + ", ".join(sorted(ALLOWED_LOGO_CONTENT_TYPES))
            ),
        )

    contents = await file.read()
    if len(contents) > MAX_LOGO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_LOGO_SIZE // (1024 * 1024)} MB",
        )

    config = await _get_or_create_branding_config(db)
    if config.logo_storage_key:
        await _delete_branding_logo(config)

    file_id = uuid.uuid4()
    original_name = file.filename or "logo"
    storage_key = f"branding/{file_id}_{original_name}"
    settings = get_settings()

    async with get_s3_client() as s3:
        await s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=storage_key,
            Body=contents,
            ContentType=file.content_type,
        )

    config.logo_filename = original_name
    config.logo_content_type = file.content_type
    config.logo_storage_key = storage_key
    await db.flush()
    await db.refresh(config)
    return _branding_payload(config)


@router.delete("/branding/logo", response_model=BrandingRead)
async def delete_branding_logo(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    config = await _get_branding_config(db)
    if not config or not config.logo_storage_key:
        return _branding_payload(config)

    await _delete_branding_logo(config)
    await db.flush()
    await db.refresh(config)
    return _branding_payload(config)


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
    return ScimStatus(
        enabled=bool(settings.SCIM_TOKEN),
        endpoint_url="/scim/v2",
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
