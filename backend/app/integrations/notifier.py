from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations import constants as ic
from app.integrations.config_helpers import merged_metadata
from app.integrations.http_utils import status_is_success
from app.integrations.crypto import decrypt_json
from app.models.integration_config import IntegrationConfig

logger = logging.getLogger(__name__)


class Notifier(ABC):
    @abstractmethod
    async def send_test(self, db: AsyncSession, row: IntegrationConfig) -> None:
        pass


class WebhookNotifier(Notifier):
    async def send_test(self, db: AsyncSession, row: IntegrationConfig) -> None:
        meta = merged_metadata(row, "webhook")
        url = (meta.get("url") or "").strip()
        if not url:
            raise ValueError("Webhook URL is not configured")
        secrets = decrypt_json(row.secrets_encrypted)
        signing = (secrets.get("signing_secret") or "").strip()
        payload = dict(ic.WEBHOOK_PAYLOAD_EXAMPLE)
        payload["event"] = "test"
        payload["body"] = "CatalogIT webhook test"
        body_bytes = json.dumps(payload, separators=(",", ":")).encode()
        headers = {"Content-Type": "application/json"}
        if signing:
            sig = hmac.new(signing.encode(), body_bytes, hashlib.sha256).hexdigest()
            headers["X-CatalogIT-Signature"] = sig
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post(url, content=body_bytes, headers=headers)
                if status_is_success(resp.status_code):
                    return
                last_exc = ValueError(f"HTTP {resp.status_code}: {resp.text[:500]}")
            except httpx.HTTPError as exc:
                last_exc = exc
            if attempt < 2:
                time.sleep(0.5 * (2**attempt))
        assert last_exc is not None
        raise last_exc


class TelegramNotifier(Notifier):
    async def send_test(self, db: AsyncSession, row: IntegrationConfig) -> None:
        from app.integrations import telegram_api

        meta = merged_metadata(row, "telegram")
        chat_id = (meta.get("chat_id") or "").strip()
        secrets = decrypt_json(row.secrets_encrypted)
        raw_token = secrets.get("bot_token") or ""
        token = telegram_api.normalize_bot_token(raw_token)
        if not token:
            raise ValueError("Telegram bot token is not configured")
        if not chat_id:
            raise ValueError("Telegram chat_id is not configured")
        text = "CatalogIT: test notification (integrations)."
        # Validates token (getMe); then send. Telegram often returns HTTP 200 with ok:false in JSON.
        await telegram_api.get_me(token)
        await telegram_api.send_message(token, chat_id, text)


class SlackNotifier(Notifier):
    async def send_test(self, db: AsyncSession, row: IntegrationConfig) -> None:
        from app.integrations import slack_api

        meta = merged_metadata(row, "slack")
        secrets = decrypt_json(row.secrets_encrypted)
        token = (secrets.get("access_token") or "").strip()
        if not token:
            raise ValueError("Slack is not connected; complete OAuth first")
        channel = (meta.get("default_channel_id") or "").strip()
        if not channel:
            raise ValueError("Set a default Slack channel (resolve channel id first)")
        await slack_api.post_message(
            token,
            channel,
            ":white_check_mark: CatalogIT test message from integrations.",
        )


class GoogleMailNotifier(Notifier):
    async def send_test(self, db: AsyncSession, row: IntegrationConfig) -> None:
        from app.integrations import gmail_send

        await gmail_send.send_test_to_self(db, row)


_REGISTRY: dict[str, Notifier] = {
    "webhook": WebhookNotifier(),
    "telegram": TelegramNotifier(),
    "slack": SlackNotifier(),
    "google_mail": GoogleMailNotifier(),
}


def get_notifier(channel: str) -> Notifier:
    n = _REGISTRY.get(channel)
    if n is None:
        raise ValueError(f"Unknown channel: {channel}")
    return n
