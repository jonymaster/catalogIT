"""Resolve notification email templates (DB text, MinIO HTML, packaged default)."""
from __future__ import annotations

import base64
import mimetypes
import re
from dataclasses import dataclass
from typing import Any
from functools import lru_cache
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies.storage import get_s3_client
from app.models.notification_global_settings import NotificationGlobalSettings

_RESOURCES = Path(__file__).resolve().parent.parent / "resources" / "email"
_DEFAULT_HTML_PATH = _RESOURCES / "renewal_default.html"

DEFAULT_RENEWAL_SUBJECT = "Renewal in {{days_before}} days: {{service_name}}"
DEFAULT_RENEWAL_TEXT = (
    "Hi {{owner_name}},\n\n"
    "The service {{service_name}} renews on {{renewal_date}} (in {{days_before}} days).\n\n"
    "Please review licensing and budget in CatalogIT."
)


@lru_cache
def load_default_renewal_html() -> str:
    return _DEFAULT_HTML_PATH.read_text(encoding="utf-8")


def _apply_logo_block(html: str, asset_keys: dict[str, str] | None) -> str:
    """Replace {{logo_block}} with a cid: reference when a logo asset exists."""
    keys = asset_keys or {}
    if "logo" in keys:
        block = (
            '<img src="cid:logo" alt="" width="120" style="display:block;'
            'margin-bottom:8px;border:0;" />'
        )
    else:
        block = ""
    return html.replace("{{logo_block}}", block)


async def fetch_s3_text(object_key: str) -> str:
    cfg = get_settings()
    async with get_s3_client() as s3:
        resp = await s3.get_object(Bucket=cfg.MINIO_BUCKET_NAME, Key=object_key)
        body = await resp["Body"].read()
    return body.decode("utf-8")


async def fetch_s3_bytes(object_key: str) -> bytes:
    cfg = get_settings()
    async with get_s3_client() as s3:
        resp = await s3.get_object(Bucket=cfg.MINIO_BUCKET_NAME, Key=object_key)
        return await resp["Body"].read()


async def delete_s3_keys(keys: list[str]) -> None:
    if not keys:
        return
    cfg = get_settings()
    async with get_s3_client() as s3:
        for key in keys:
            if key.strip():
                await s3.delete_object(Bucket=cfg.MINIO_BUCKET_NAME, Key=key)


def guess_content_type(object_key: str) -> str:
    ct, _ = mimetypes.guess_type(object_key)
    return ct or "application/octet-stream"


@dataclass(frozen=True)
class ResolvedEmailTemplates:
    email_subject_template: str
    email_html_template: str
    email_text_template: str
    """CID (without cid: prefix) -> MinIO object key for inline images."""
    inline_asset_keys: dict[str, str]


async def resolve_notification_email_templates(
    _session: AsyncSession,
    ngs: NotificationGlobalSettings,
) -> ResolvedEmailTemplates:
    subject = (ngs.renewal_email_subject_template or "").strip() or DEFAULT_RENEWAL_SUBJECT
    text_t = (ngs.renewal_email_text_template or "").strip() or DEFAULT_RENEWAL_TEXT

    storage_key = (ngs.renewal_email_html_storage_key or "").strip()
    inline_raw = ngs.renewal_email_template_asset_keys
    inline_keys: dict[str, str] = {}
    if isinstance(inline_raw, dict):
        for k, v in inline_raw.items():
            if isinstance(k, str) and isinstance(v, str) and v.strip():
                inline_keys[k] = v.strip()

    if storage_key:
        html_t = await fetch_s3_text(storage_key)
    elif (ngs.renewal_email_html_template or "").strip():
        html_t = ngs.renewal_email_html_template.strip()
    else:
        html_t = load_default_renewal_html()

    html_t = _apply_logo_block(html_t, inline_keys)

    return ResolvedEmailTemplates(
        email_subject_template=subject,
        email_html_template=html_t,
        email_text_template=text_t,
        inline_asset_keys=inline_keys,
    )


async def load_resolved_templates_or_none(
    session: AsyncSession,
) -> ResolvedEmailTemplates | None:
    ngs = await session.get(NotificationGlobalSettings, 1)
    if ngs is None:
        return None
    return await resolve_notification_email_templates(session, ngs)


def _strip_tags(html: str) -> str:
    text = re.sub(r"<[^>]+>", "", html)
    return re.sub(r"\s+", " ", text).strip()


async def preview_notification_email(
    session: AsyncSession,
    sample_data: dict[str, Any],
) -> tuple[str, str, str]:
    """Rendered subject/HTML/text; HTML uses data: URIs instead of cid for browser preview."""
    from app.integrations.gmail_render import render_templates

    ngs = await session.get(NotificationGlobalSettings, 1)
    if ngs is None:
        raise ValueError("Notification settings not initialized")
    resolved = await resolve_notification_email_templates(session, ngs)
    meta = {
        "email_subject_template": resolved.email_subject_template,
        "email_html_template": resolved.email_html_template,
        "email_text_template": resolved.email_text_template,
    }
    data = dict(sample_data)
    data.setdefault("title", "CatalogIT")
    data.setdefault("service_name", "Example Service")
    data.setdefault("renewal_date", "2026-12-31")
    data.setdefault("days_before", "7")
    data.setdefault("owner_name", "Jane Doe")
    data.setdefault("recipient_name", "Jane Doe")
    subj, html, text = render_templates(meta, data)
    for cid, object_key in resolved.inline_asset_keys.items():
        raw = await fetch_s3_bytes(object_key)
        ct = guess_content_type(object_key)
        b64 = base64.b64encode(raw).decode("ascii")
        data_uri = f"data:{ct};base64,{b64}"
        html = html.replace(f"cid:{cid}", data_uri)
    if not text.strip():
        text = _strip_tags(html)
    return subj, html, text


def collect_template_s3_keys(ngs: NotificationGlobalSettings) -> list[str]:
    """All MinIO keys used by the notification email template (for delete/replace)."""
    keys: list[str] = []
    sk = (ngs.renewal_email_html_storage_key or "").strip()
    if sk:
        keys.append(sk)
    raw = ngs.renewal_email_template_asset_keys
    if isinstance(raw, dict):
        for v in raw.values():
            if isinstance(v, str) and v.strip():
                keys.append(v.strip())
    return keys
