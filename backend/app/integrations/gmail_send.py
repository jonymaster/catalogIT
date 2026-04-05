from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from email import encoders
from email.message import EmailMessage
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.policy import default as EMAIL_POLICY
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import constants as ic
from app.integrations.config_helpers import merged_metadata
from app.integrations.crypto import decrypt_json, encrypt_json
from app.integrations.gmail_render import render_templates
from app.integrations.http_utils import status_is_success
from app.models.integration_config import IntegrationConfig
from app.models.notification_global_settings import NotificationGlobalSettings
from app.notifications.email_templates import (
    guess_content_type,
    fetch_s3_bytes,
    resolve_notification_email_templates,
)

GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def oauth_expires_in_seconds(data: dict[str, Any]) -> int:
    """Google may omit expires_in or send null; avoid int(None)."""
    raw = data.get("expires_in")
    if raw is None:
        return 3600
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 3600


async def resolve_google_email_with_token(access_token: str) -> str | None:
    """Resolve the account email using Gmail profile, then OAuth2 userinfo."""
    headers = {"Authorization": f"Bearer {access_token}"}
    async with httpx.AsyncClient(timeout=15) as client:
        prof = await client.get(GMAIL_PROFILE_URL, headers=headers)
        if prof.status_code == 200:
            addr = (prof.json().get("emailAddress") or "").strip()
            if addr:
                return addr
        ui = await client.get(GOOGLE_USERINFO_URL, headers=headers)
        if ui.status_code == 200:
            addr = (ui.json().get("email") or "").strip()
            if addr:
                return addr
    return None


async def ensure_google_sender_email(db: AsyncSession, row: IntegrationConfig) -> str:
    """Return sender email from metadata, or fetch with the current access token and persist."""
    meta = merged_metadata(row, "google_mail")
    existing = (meta.get("google_email") or "").strip()
    if existing:
        return existing
    token = await ensure_access_token(row, db)
    addr = await resolve_google_email_with_token(token)
    if addr:
        meta["google_email"] = addr
        row.metadata_ = meta
        await db.flush()
        return addr
    raise ValueError(
        "Could not read your Google account email (Gmail profile and userinfo both failed). "
        "Reconnect Google on Settings → Integrations, and ensure the Gmail API is enabled for the OAuth project."
    )


async def ensure_access_token(row: IntegrationConfig, db: AsyncSession) -> str:
    secrets = decrypt_json(row.secrets_encrypted)
    refresh = secrets.get("refresh_token", "")
    access = secrets.get("access_token", "")
    meta = merged_metadata(row, "google_mail")
    client_id = (meta.get("client_id") or "").strip()
    client_secret = (secrets.get("client_secret") or "").strip()
    now = datetime.now(timezone.utc)
    exp = row.token_expires_at
    if (
        access
        and isinstance(exp, datetime)
        and exp > now + timedelta(minutes=2)
    ):
        return access
    if not refresh:
        raise ValueError("Google refresh token missing; reconnect OAuth")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            ic.GOOGLE_OAUTH_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if resp.status_code != 200:
        raise ValueError(f"Google token refresh failed: {resp.text[:500]}")
    data = resp.json()
    access = data.get("access_token", "")
    expires_in = oauth_expires_in_seconds(data)
    if not access:
        raise ValueError("No access token from Google refresh")
    secrets["access_token"] = access
    row.secrets_encrypted = encrypt_json(secrets)
    row.token_expires_at = now + timedelta(seconds=expires_in - 60)
    await db.flush()
    return access


def _build_raw_rfc822(
    to_addr: str, subject: str, html_body: str, text_body: str
) -> str:
    # Do not use email.policy.HTTP: max_line_length is None and Python 3.12's
    # contentmanager compares line length to it, raising TypeError.
    msg = EmailMessage(policy=EMAIL_POLICY)
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    return msg.as_string()


def _build_raw_rfc822_with_inline(
    to_addr: str,
    subject: str,
    html_body: str,
    text_body: str,
    inline: list[tuple[str, str, bytes]],
) -> str:
    """RFC822 with multipart/related for HTML + inline images (Content-ID)."""
    if not inline:
        return _build_raw_rfc822(to_addr, subject, html_body, text_body)

    related = MIMEMultipart("related")
    related["To"] = to_addr
    related["Subject"] = subject

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(text_body, "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    related.attach(alt)

    for cid, content_type, raw in inline:
        if content_type.startswith("image/"):
            sub = content_type.split("/", 1)[1]
            part = MIMEImage(raw, _subtype=sub)
        else:
            main, sub = (
                content_type.split("/", 1)
                if "/" in content_type
                else ("application", "octet-stream")
            )
            part = MIMEBase(main, sub)
            part.set_payload(raw)
            encoders.encode_base64(part)
        part.add_header("Content-ID", f"<{cid}>")
        part.add_header("Content-Disposition", "inline", filename=cid)
        related.attach(part)

    return related.as_string()


async def send_mail(
    db: AsyncSession,
    row: IntegrationConfig,
    to_addr: str,
    sample_data: dict[str, Any],
) -> None:
    ngs = await db.get(NotificationGlobalSettings, 1)
    if ngs is None:
        raise ValueError("Notification settings not initialized")
    resolved = await resolve_notification_email_templates(db, ngs)
    meta = {
        "email_subject_template": resolved.email_subject_template,
        "email_html_template": resolved.email_html_template,
        "email_text_template": resolved.email_text_template,
    }
    data = dict(sample_data)
    subj, html, text = render_templates(meta, data)
    await ensure_google_sender_email(db, row)
    token = await ensure_access_token(row, db)

    inline_parts: list[tuple[str, str, bytes]] = []
    for cid, object_key in resolved.inline_asset_keys.items():
        raw = await fetch_s3_bytes(object_key)
        inline_parts.append((cid, guess_content_type(object_key), raw))

    raw = _build_raw_rfc822_with_inline(to_addr, subj, html, text, inline_parts)
    raw_b64 = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            GMAIL_SEND_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"raw": raw_b64},
        )
        if not status_is_success(resp.status_code):
            raw_b64_padded = base64.urlsafe_b64encode(raw.encode()).decode()
            resp = await client.post(
                GMAIL_SEND_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={"raw": raw_b64_padded},
            )
        if not status_is_success(resp.status_code):
            raise ValueError(f"Gmail API error: {resp.status_code} {resp.text[:800]}")


async def send_test_to_self(db: AsyncSession, row: IntegrationConfig) -> None:
    sample = {
        "title": "CatalogIT test",
        "service_name": "Example Service",
        "renewal_date": "2026-12-31",
        "days_before": "7",
        "owner_name": "You",
        "recipient_name": "You",
    }
    to_addr = await ensure_google_sender_email(db, row)
    await send_mail(db, row, to_addr, sample)
