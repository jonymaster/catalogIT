from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, Integer, String, Table, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
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

    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )

    extra_recipients: Mapped[list["User"]] = relationship(  # noqa: F821
        secondary=notification_extra_recipients,
        lazy="selectin",
    )
