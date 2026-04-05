from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.global_audit import record_global_audit_event
from app.dependencies.auth import get_current_user, require_role
from app.dependencies.db import get_audited_db
from app.database import get_db
from app.integrations import constants as ic
from app.integrations.config_helpers import CHANNEL_ORDER, merged_metadata, row_to_read
from app.integrations.crypto import decrypt_json, encrypt_json
from app.integrations.telegram_api import normalize_bot_token
from app.integrations.gmail_send import oauth_expires_in_seconds, resolve_google_email_with_token
from app.integrations.notifier import get_notifier
from app.models.integration_config import IntegrationConfig
from app.models.oauth_state import OAuthState
from app.models.user import User
from app.schemas.integration import (
    GoogleMailIntegrationPatch,
    IntegrationChannelRead,
    IntegrationListResponse,
    IntegrationMetaResponse,
    SlackIntegrationPatch,
    TelegramIntegrationPatch,
    WebhookIntegrationPatch,
)

logger = logging.getLogger(__name__)

settings_router = APIRouter(prefix="/api/settings/integrations", tags=["integrations"])
oauth_router = APIRouter(prefix="/api/integrations", tags=["integrations"])

_admin = require_role("admin")

_ENCRYPTION_REQUIRED_DETAIL = (
    "Integration secret encryption is not configured. Set INTEGRATION_SECRET_KEY in the "
    "environment to a Fernet key (see .env.example or docs/integrations/README.md), then restart the API."
)


def _slack_token_exchange_error_message(slack_error: str) -> str:
    """Map Slack oauth.v2.access error codes to actionable text."""
    if slack_error == "bad_client_secret":
        return (
            "Slack rejected the OAuth client secret (bad_client_secret). "
            "In api.slack.com → Your App → Settings → Basic Information → App Credentials, "
            "use Client ID and Client Secret. Do not use the Signing Secret (shown on the same page "
            "but used to verify requests from Slack to your server, not for OAuth). "
            "Re-save both in CatalogIT and run Connect again."
        )
    if slack_error == "invalid_client_id":
        return (
            "Slack rejected the client ID (invalid_client_id). "
            "Copy Client ID from App Credentials on the same Slack app that has your redirect URI."
        )
    if slack_error == "bad_redirect_uri":
        return (
            "Slack rejected the redirect URI (bad_redirect_uri). "
            "It must match exactly: PUBLIC_BASE_URL + /api/integrations/slack/oauth/callback "
            "in both Slack app OAuth settings and your .env PUBLIC_BASE_URL."
        )
    return slack_error or "Slack OAuth token exchange failed"


def _public_base() -> str:
    return get_settings().PUBLIC_BASE_URL.rstrip("/")


def _merge_secrets_row(row: IntegrationConfig, new_secrets: dict[str, Any]) -> None:
    current = decrypt_json(row.secrets_encrypted)
    current.update(new_secrets)
    # Drop empty string values to clear optional secrets
    for k, v in list(current.items()):
        if v == "":
            del current[k]
    if not current:
        row.secrets_encrypted = None
        return
    try:
        row.secrets_encrypted = encrypt_json(current)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_ENCRYPTION_REQUIRED_DETAIL,
        ) from None


@settings_router.get("/meta", response_model=IntegrationMetaResponse)
async def get_integrations_meta(_user: User = Depends(_admin)):
    base = _public_base()
    cfg = get_settings()
    encryption_ok = bool(cfg.INTEGRATION_SECRET_KEY.strip())
    return IntegrationMetaResponse(
        public_base_url=base,
        secrets_encryption_configured=encryption_ok,
        webhook_payload_version=ic.WEBHOOK_PAYLOAD_VERSION,
        webhook_payload_example=ic.WEBHOOK_PAYLOAD_EXAMPLE,
        google={
            "oauth_scopes": ic.GOOGLE_OAUTH_SCOPES,
            "oauth_start_path": ic.GOOGLE_OAUTH_START_PATH,
            "oauth_start_method": "POST",
            "oauth_callback_path": ic.GOOGLE_OAUTH_CALLBACK_PATH,
            "redirect_uri": base + ic.GOOGLE_OAUTH_CALLBACK_PATH,
            "authorize_url": ic.GOOGLE_OAUTH_AUTHORIZE_URL,
        },
        slack={
            "oauth_scopes": ic.SLACK_OAUTH_SCOPES,
            "oauth_start_path": ic.SLACK_OAUTH_START_PATH,
            "oauth_start_method": "POST",
            "oauth_callback_path": ic.SLACK_OAUTH_CALLBACK_PATH,
            "redirect_uri": base + ic.SLACK_OAUTH_CALLBACK_PATH,
            "authorize_url": ic.SLACK_OAUTH_AUTHORIZE_URL,
        },
    )


@settings_router.get("", response_model=IntegrationListResponse)
async def list_integrations(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(IntegrationConfig).where(IntegrationConfig.channel.in_(CHANNEL_ORDER))
    )
    rows = {r.channel: r for r in result.scalars().all()}
    channels = []
    for ch in CHANNEL_ORDER:
        row = rows.get(ch)
        if row is None:
            continue
        channels.append(IntegrationChannelRead(**row_to_read(row, ch)))
    return IntegrationListResponse(channels=channels)


@settings_router.get("/{channel}", response_model=IntegrationChannelRead)
async def get_integration(
    channel: str,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_db),
):
    if channel not in CHANNEL_ORDER:
        raise HTTPException(status_code=404, detail="Unknown channel")
    row = await db.get(IntegrationConfig, channel)
    if row is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    return IntegrationChannelRead(**row_to_read(row, channel))


@settings_router.patch("/webhook", response_model=IntegrationChannelRead)
async def patch_webhook(
    body: WebhookIntegrationPatch,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    channel = "webhook"
    row = await db.get(IntegrationConfig, channel)
    if row is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    meta = merged_metadata(row, channel)
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.url is not None:
        meta["url"] = body.url
    if body.signing_secret is not None:
        _merge_secrets_row(row, {"signing_secret": body.signing_secret})
    row.metadata_ = meta
    await db.flush()
    await db.refresh(row)
    return IntegrationChannelRead(**row_to_read(row, channel))


@settings_router.patch("/telegram", response_model=IntegrationChannelRead)
async def patch_telegram(
    body: TelegramIntegrationPatch,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    channel = "telegram"
    row = await db.get(IntegrationConfig, channel)
    if row is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    meta = merged_metadata(row, channel)
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.chat_id is not None:
        meta["chat_id"] = body.chat_id
    if body.bot_token is not None:
        _merge_secrets_row(row, {"bot_token": normalize_bot_token(body.bot_token)})
    row.metadata_ = meta
    await db.flush()
    await db.refresh(row)
    return IntegrationChannelRead(**row_to_read(row, channel))


@settings_router.patch("/slack", response_model=IntegrationChannelRead)
async def patch_slack(
    body: SlackIntegrationPatch,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    channel = "slack"
    row = await db.get(IntegrationConfig, channel)
    if row is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    meta = merged_metadata(row, channel)
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.client_id is not None:
        meta["client_id"] = body.client_id.strip()
    if body.default_channel_id is not None:
        meta["default_channel_id"] = body.default_channel_id
    if body.default_channel_label is not None:
        meta["default_channel_label"] = body.default_channel_label
    if body.client_secret is not None:
        _merge_secrets_row(row, {"client_secret": body.client_secret.strip()})
    row.metadata_ = meta
    await db.flush()
    await db.refresh(row)
    return IntegrationChannelRead(**row_to_read(row, channel))


@settings_router.patch("/google_mail", response_model=IntegrationChannelRead)
async def patch_google_mail(
    body: GoogleMailIntegrationPatch,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    channel = "google_mail"
    row = await db.get(IntegrationConfig, channel)
    if row is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    meta = merged_metadata(row, channel)
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.client_id is not None:
        meta["client_id"] = body.client_id
    if body.client_secret is not None:
        _merge_secrets_row(row, {"client_secret": body.client_secret})
    row.metadata_ = meta
    await db.flush()
    await db.refresh(row)
    return IntegrationChannelRead(**row_to_read(row, channel))


class TestSendResponse(BaseModel):
    ok: bool
    detail: str | None = None


@settings_router.post("/{channel}/test", response_model=TestSendResponse)
async def test_integration(
    channel: str,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    if channel not in CHANNEL_ORDER:
        raise HTTPException(status_code=404, detail="Unknown channel")
    row = await db.get(IntegrationConfig, channel)
    if row is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    notifier = get_notifier(channel)
    try:
        await notifier.send_test(db, row)
    except Exception as exc:
        logger.exception("Integration test failed for %s", channel)
        row.connection_status = "error"
        row.last_error = str(exc)[:2000]
        await db.flush()
        await record_global_audit_event(
            db,
            category="notification",
            event_type="integration_test_failed",
            entity_table="integration_config",
            entity_key=channel,
            actor_user_id=_user.id,
            summary=f"Integration test failed ({channel})",
            details={"channel": channel, "error": str(exc)[:500]},
            entity_label=f"Integration ({channel})",
        )
        return TestSendResponse(ok=False, detail=str(exc))
    row.connection_status = "connected"
    row.last_error = None
    row.last_success_at = datetime.now(timezone.utc)
    await db.flush()
    await record_global_audit_event(
        db,
        category="notification",
        event_type="integration_test_sent",
        entity_table="integration_config",
        entity_key=channel,
        actor_user_id=_user.id,
        summary=f"Integration test succeeded ({channel})",
        details={"channel": channel},
        entity_label=f"Integration ({channel})",
    )
    return TestSendResponse(ok=True, detail=None)


# --- OAuth: Google ---


async def _cleanup_expired_oauth_states(db: AsyncSession) -> None:
    now = datetime.now(timezone.utc)
    await db.execute(delete(OAuthState).where(OAuthState.expires_at < now))


async def _consume_oauth_state(db: AsyncSession, state: str) -> OAuthState | None:
    row = await db.get(OAuthState, state)
    if row is None or row.consumed or row.expires_at < datetime.now(timezone.utc):
        return None
    row.consumed = True
    await db.flush()
    return row


class OAuthStartResponse(BaseModel):
    authorization_url: str


@oauth_router.post("/google/oauth/start", response_model=OAuthStartResponse)
async def google_oauth_start(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_audited_db),
):
    """POST so the SPA can send Bearer token; returns URL to open in the browser."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    row = await db.get(IntegrationConfig, "google_mail")
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    meta = merged_metadata(row, "google_mail")
    client_id = (meta.get("client_id") or "").strip()
    secrets = decrypt_json(row.secrets_encrypted)
    client_secret = (secrets.get("client_secret") or "").strip()
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="Configure Google OAuth client id and client secret first",
        )
    await _cleanup_expired_oauth_states(db)
    import secrets as std_secrets

    state = std_secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.add(
        OAuthState(
            state=state,
            channel="google_mail",
            user_id=user.id,
            expires_at=expires,
            consumed=False,
        )
    )
    await db.flush()
    redirect_uri = _public_base() + ic.GOOGLE_OAUTH_CALLBACK_PATH
    params = {
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": ic.GOOGLE_OAUTH_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    url = ic.GOOGLE_OAUTH_AUTHORIZE_URL + "?" + urlencode(params)
    return OAuthStartResponse(authorization_url=url)


@oauth_router.get("/google/oauth/callback")
async def google_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    # Browser redirect from Google has no JWT; do not use get_audited_db here.
    if error:
        raise HTTPException(status_code=400, detail=error)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")
    st = await _consume_oauth_state(db, state)
    if st is None:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    db.info["current_user_id"] = st.user_id
    row = await db.get(IntegrationConfig, "google_mail")
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    meta = merged_metadata(row, "google_mail")
    client_id = (meta.get("client_id") or "").strip()
    secrets = decrypt_json(row.secrets_encrypted)
    client_secret = (secrets.get("client_secret") or "").strip()
    redirect_uri = _public_base() + ic.GOOGLE_OAUTH_CALLBACK_PATH
    async with httpx.AsyncClient(timeout=30) as client:
        token_resp = await client.post(
            ic.GOOGLE_OAUTH_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if token_resp.status_code != 200:
        logger.error("Google token exchange failed: %s", token_resp.text)
        row.connection_status = "error"
        row.last_error = "Google token exchange failed"
        await db.flush()
        raise HTTPException(status_code=502, detail="Token exchange failed")
    data = token_resp.json()
    refresh = data.get("refresh_token") or secrets.get("refresh_token")
    access = data.get("access_token", "")
    expires_in = oauth_expires_in_seconds(data)
    if not refresh and not access:
        row.connection_status = "error"
        row.last_error = "No tokens returned from Google"
        await db.flush()
        raise HTTPException(status_code=502, detail="No tokens returned")
    new_secrets = dict(secrets)
    new_secrets["refresh_token"] = refresh or new_secrets.get("refresh_token", "")
    new_secrets["access_token"] = access
    if not new_secrets.get("refresh_token"):
        row.connection_status = "error"
        row.last_error = "No refresh token; revoke app access in Google and reconnect with prompt=consent"
        await db.flush()
        raise HTTPException(status_code=400, detail=row.last_error)
    try:
        row.secrets_encrypted = encrypt_json(new_secrets)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_ENCRYPTION_REQUIRED_DETAIL,
        ) from None
    row.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60)
    row.connection_status = "connected"
    row.last_error = None
    email = await resolve_google_email_with_token(access)
    if email:
        meta["google_email"] = email
    row.metadata_ = meta
    await db.flush()
    fe = get_settings().FRONTEND_URL.rstrip("/")
    return RedirectResponse(url=f"{fe}/settings/integrations?google=connected")


@oauth_router.post("/slack/oauth/start", response_model=OAuthStartResponse)
async def slack_oauth_start(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_audited_db),
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    row = await db.get(IntegrationConfig, "slack")
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    meta = merged_metadata(row, "slack")
    client_id = (meta.get("client_id") or "").strip()
    secrets = decrypt_json(row.secrets_encrypted)
    client_secret = (secrets.get("client_secret") or "").strip()
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="Configure Slack OAuth client id and client secret first",
        )
    await _cleanup_expired_oauth_states(db)
    import secrets as std_secrets

    state = std_secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.add(
        OAuthState(
            state=state,
            channel="slack",
            user_id=user.id,
            expires_at=expires,
            consumed=False,
        )
    )
    await db.flush()
    redirect_uri = _public_base() + ic.SLACK_OAUTH_CALLBACK_PATH
    params = {
        "client_id": client_id,
        "scope": ic.SLACK_OAUTH_SCOPES,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    url = ic.SLACK_OAUTH_AUTHORIZE_URL + "?" + urlencode(params)
    return OAuthStartResponse(authorization_url=url)


@oauth_router.get("/slack/oauth/callback")
async def slack_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    # Browser redirect from Slack has no JWT; do not use get_audited_db here.
    if error:
        raise HTTPException(status_code=400, detail=error)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")
    st = await _consume_oauth_state(db, state)
    if st is None:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    db.info["current_user_id"] = st.user_id
    row = await db.get(IntegrationConfig, "slack")
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    meta = merged_metadata(row, "slack")
    secrets = decrypt_json(row.secrets_encrypted)
    client_id = (meta.get("client_id") or "").strip()
    client_secret = (secrets.get("client_secret") or "").strip()
    redirect_uri = _public_base() + ic.SLACK_OAUTH_CALLBACK_PATH
    async with httpx.AsyncClient(timeout=30) as client:
        token_resp = await client.post(
            ic.SLACK_OAUTH_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if token_resp.status_code != 200:
        logger.error("Slack token exchange failed: %s", token_resp.text)
        row.connection_status = "error"
        row.last_error = "Slack token exchange failed"
        await db.flush()
        raise HTTPException(status_code=502, detail="Token exchange failed")
    data = token_resp.json()
    if not data.get("ok"):
        raw_err = data.get("error") or "Slack OAuth failed"
        row.connection_status = "error"
        row.last_error = _slack_token_exchange_error_message(raw_err)[:2000]
        await db.flush()
        raise HTTPException(
            status_code=400,
            detail=_slack_token_exchange_error_message(raw_err),
        )
    access_token = data.get("access_token") or ""
    authed = data.get("authed_user") or {}
    # Bot token is in root for bot install
    bot = data.get("bot") or {}
    bot_token = bot.get("bot_access_token") or access_token
    team = data.get("team") or {}
    new_secrets = dict(secrets)
    new_secrets["access_token"] = bot_token
    if data.get("refresh_token"):
        new_secrets["refresh_token"] = data["refresh_token"]
    try:
        row.secrets_encrypted = encrypt_json(new_secrets)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_ENCRYPTION_REQUIRED_DETAIL,
        ) from None
    meta["team_id"] = team.get("id", "")
    meta["team_name"] = team.get("name", "")
    row.metadata_ = meta
    row.token_expires_at = None
    row.connection_status = "connected"
    row.last_error = None
    await db.flush()
    fe = get_settings().FRONTEND_URL.rstrip("/")
    return RedirectResponse(url=f"{fe}/settings/integrations?slack=connected")


class SlackResolveBody(BaseModel):
    label: str


@settings_router.post("/slack/resolve-channel", response_model=dict)
async def slack_resolve_channel(
    body: SlackResolveBody,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    """Resolve a human-entered channel to a Slack channel ID."""
    row = await db.get(IntegrationConfig, "slack")
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    from app.integrations import slack_api

    secrets = decrypt_json(row.secrets_encrypted)
    token = secrets.get("access_token", "")
    if not token:
        raise HTTPException(status_code=400, detail="Connect Slack first")
    try:
        cid = await slack_api.resolve_channel_id(token, body.label.strip())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    meta = merged_metadata(row, "slack")
    meta["default_channel_id"] = cid
    meta["default_channel_label"] = body.label.strip()
    row.metadata_ = meta
    await db.flush()
    return {"channel_id": cid, "label": body.label.strip()}
