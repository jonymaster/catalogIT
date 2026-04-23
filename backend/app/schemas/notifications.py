from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class NotificationSettingsRead(BaseModel):
    renewal_reminders_enabled: bool
    renewal_offsets_days: list[int]
    calendar_timezone: str
    renewal_email_subject_template: str | None = None
    renewal_email_html_template: str | None = None
    renewal_email_text_template: str | None = None
    renewal_email_html_storage_key: str | None = None
    renewal_email_template_asset_keys: dict[str, str] | None = None
    extra_recipient_ids: list[uuid.UUID] = []
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class NotificationSettingsUpdate(BaseModel):
    renewal_reminders_enabled: bool | None = None
    renewal_offsets_days: list[int] | None = Field(
        default=None,
        description="Ordered day offsets before renewal (e.g. 30, 14, 7, 1). Must be positive integers.",
    )
    calendar_timezone: str | None = None
    renewal_email_subject_template: str | None = None
    renewal_email_html_template: str | None = None
    renewal_email_text_template: str | None = None
    renewal_email_html_storage_key: str | None = None
    renewal_email_template_asset_keys: dict[str, str] | None = None
    extra_recipient_ids: list[uuid.UUID] | None = None


class NotificationEmailPreviewRequest(BaseModel):
    sample_data: dict[str, Any] = Field(default_factory=dict)


class NotificationEmailPreviewResponse(BaseModel):
    subject: str
    html: str
    text: str


class RenewalDispatchResult(BaseModel):
    today: str
    timezone: str
    skipped_reason: str | None = None
    examined_services: int = 0
    eligible_windows: int = 0
    eligible_recipients: int = 0
    skipped_existing: int = 0
    emails_sent: int = 0
    slack_sent: int = 0
    telegram_sent: int = 0
    webhook_sent: int = 0
    errors: list[str] = []
