from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.models.integration_config import IntegrationConfig

CHANNEL_ORDER = ("google_mail", "slack", "telegram", "webhook")


def default_metadata(channel: str) -> dict[str, Any]:
    if channel == "google_mail":
        return {
            "client_id": "",
            "google_email": "",
            "email_subject_template": "{{title}}",
            "email_html_template": "<p>{{body}}</p>",
            "email_text_template": "{{body}}",
        }
    if channel == "slack":
        return {
            "client_id": "",
            "team_id": "",
            "team_name": "",
            "default_channel_id": "",
            "default_channel_label": "",
        }
    if channel == "telegram":
        return {"chat_id": ""}
    if channel == "webhook":
        return {"url": ""}
    return {}


def merged_metadata(row: IntegrationConfig, channel: str) -> dict[str, Any]:
    base = default_metadata(channel)
    stored = row.metadata_ if isinstance(row.metadata_, dict) else {}
    base.update(stored)
    return base


def mask_metadata_for_read(channel: str, meta: dict[str, Any]) -> dict[str, Any]:
    """Return metadata safe for API responses (no secrets)."""
    out = deepcopy(meta)
    # No secret keys in metadata by convention; client_secret lives in encrypted blob only
    return out


def row_to_read(row: IntegrationConfig, channel: str) -> dict[str, Any]:
    meta = merged_metadata(row, channel)
    return {
        "channel": channel,
        "enabled": row.enabled,
        "connection_status": row.connection_status,
        "last_error": row.last_error,
        "last_success_at": row.last_success_at,
        "token_expires_at": row.token_expires_at,
        "metadata": mask_metadata_for_read(channel, meta),
        "has_encrypted_secrets": bool(row.secrets_encrypted),
    }
