from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class IntegrationMetaResponse(BaseModel):
    public_base_url: str
    secrets_encryption_configured: bool = Field(
        description="True when INTEGRATION_SECRET_KEY is set; required to store tokens and secrets.",
    )
    webhook_payload_version: str
    webhook_payload_example: dict[str, Any]
    google: dict[str, Any]
    slack: dict[str, Any]


class IntegrationChannelRead(BaseModel):
    channel: str
    enabled: bool
    connection_status: str
    last_error: str | None
    last_success_at: datetime | None
    token_expires_at: datetime | None
    metadata: dict[str, Any]
    has_encrypted_secrets: bool


class IntegrationListResponse(BaseModel):
    channels: list[IntegrationChannelRead]


class WebhookIntegrationPatch(BaseModel):
    enabled: bool | None = None
    url: str | None = None
    signing_secret: str | None = Field(None, description="If set, replaces webhook signing secret")


class TelegramIntegrationPatch(BaseModel):
    enabled: bool | None = None
    bot_token: str | None = Field(None, description="If set, replaces bot token")
    chat_id: str | None = None


class SlackIntegrationPatch(BaseModel):
    enabled: bool | None = None
    client_id: str | None = None
    client_secret: str | None = Field(None, description="If set, replaces OAuth client secret")
    default_channel_id: str | None = None
    default_channel_label: str | None = None


class GoogleMailIntegrationPatch(BaseModel):
    enabled: bool | None = None
    client_id: str | None = None
    client_secret: str | None = Field(None, description="If set, replaces OAuth client secret")
    email_subject_template: str | None = None
    email_html_template: str | None = None
    email_text_template: str | None = None


class EmailTemplatePreviewRequest(BaseModel):
    sample_data: dict[str, Any] = Field(default_factory=dict)


class EmailTemplatePreviewResponse(BaseModel):
    subject: str
    html: str
    text: str
