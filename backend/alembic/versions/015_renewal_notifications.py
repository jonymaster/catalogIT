"""Renewal notification settings, per-service overrides, sent log.

Revision ID: 015
Revises: 014
Create Date: 2026-04-04
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, UUID

revision: str = "015"
down_revision: Union[str, None] = "014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_global_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("renewal_reminders_enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "renewal_offsets_days",
            ARRAY(sa.Integer()),
            nullable=False,
            server_default="{30,14,7,1}",
        ),
        sa.Column("calendar_timezone", sa.String(length=100), nullable=False, server_default="UTC"),
        sa.Column("renewal_email_subject_template", sa.Text(), nullable=True),
        sa.Column("renewal_email_html_template", sa.Text(), nullable=True),
        sa.Column("renewal_email_text_template", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_notification_global_settings_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        """
        INSERT INTO notification_global_settings (id, renewal_reminders_enabled, renewal_offsets_days, calendar_timezone)
        SELECT 1, true, ARRAY[30,14,7,1]::integer[], 'UTC'
        WHERE NOT EXISTS (SELECT 1 FROM notification_global_settings WHERE id = 1)
        """
    )

    op.add_column(
        "services",
        sa.Column(
            "renewal_reminders_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.add_column(
        "services",
        sa.Column("renewal_offsets_days", ARRAY(sa.Integer()), nullable=True),
    )

    op.add_column(
        "users",
        sa.Column(
            "receive_renewal_notifications",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )

    op.create_table(
        "renewal_notification_sent",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("service_id", UUID(as_uuid=True), nullable=False),
        sa.Column("renewal_date", sa.Date(), nullable=False),
        sa.Column("days_before", sa.Integer(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False, server_default="email"),
        sa.Column(
            "sent_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "service_id",
            "renewal_date",
            "days_before",
            "user_id",
            name="uq_renewal_notification_sent_dedup",
        ),
    )
    op.create_index(
        "ix_renewal_notification_sent_service_renewal",
        "renewal_notification_sent",
        ["service_id", "renewal_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_renewal_notification_sent_service_renewal", table_name="renewal_notification_sent")
    op.drop_table("renewal_notification_sent")
    op.drop_column("users", "receive_renewal_notifications")
    op.drop_column("services", "renewal_offsets_days")
    op.drop_column("services", "renewal_reminders_enabled")
    op.drop_table("notification_global_settings")
