from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

notification_extra_recipients = Table(
    "notification_extra_recipients",
    Base.metadata,
    Column("settings_id", Integer, ForeignKey("notification_global_settings.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class NotificationGlobalSettings(Base):
    """Singleton (id=1) renewal and notification defaults for the deployment."""

    __tablename__ = "notification_global_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_notification_global_settings_singleton"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    renewal_reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    renewal_offsets_days: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    calendar_timezone: Mapped[str] = mapped_column(String(100), default="UTC")
    renewal_email_subject_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    renewal_email_html_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    renewal_email_text_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    # MinIO object key for uploaded HTML (when set, overrides renewal_email_html_template for send/preview).
    renewal_email_html_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # CID name -> S3 object key for inline images (e.g. {"logo": "email-templates/.../logo.png"}).
    renewal_email_template_asset_keys: Mapped[dict[str, str] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )

    extra_recipients: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=notification_extra_recipients,
        lazy="selectin",
    )
