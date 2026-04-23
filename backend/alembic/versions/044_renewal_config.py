"""Replace billing_schedule with renewal_config and add per-service notification recipients.

Revision ID: 044
Revises: 043
Create Date: 2026-04-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "044"
down_revision: Union[str, None] = "043"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column("renewal_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.create_table(
        "service_notification_recipients",
        sa.Column(
            "service_id",
            sa.Uuid(),
            sa.ForeignKey("services.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("service_id", "user_id"),
    )
    op.create_index(
        "ix_service_notification_recipients_user_id",
        "service_notification_recipients",
        ["user_id"],
    )

    # Data migration: derive renewal_config from billing_schedule + renewal_date.
    #   annually + renewal_date -> {type: annual, month, day}
    #   monthly  + renewal_date -> {type: monthly, day}
    #   anything else           -> renewal_config stays null; clear renewal_date
    #                              so "next renewal" semantics are consistent.
    op.execute(
        """
        UPDATE services
        SET renewal_config = jsonb_build_object(
            'type', 'annual',
            'month', EXTRACT(MONTH FROM renewal_date)::int,
            'day',   EXTRACT(DAY   FROM renewal_date)::int
        )
        WHERE lower(coalesce(billing_schedule, '')) = 'annually'
          AND renewal_date IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE services
        SET renewal_config = jsonb_build_object(
            'type', 'monthly',
            'day',  EXTRACT(DAY FROM renewal_date)::int
        )
        WHERE lower(coalesce(billing_schedule, '')) = 'monthly'
          AND renewal_date IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE services
        SET renewal_date = NULL
        WHERE renewal_config IS NULL
        """
    )

    op.drop_column("services", "billing_schedule")


def downgrade() -> None:
    op.add_column(
        "services",
        sa.Column(
            "billing_schedule",
            sa.String(length=100),
            nullable=False,
            server_default="",
        ),
    )
    # Best-effort restore from renewal_config.
    op.execute(
        """
        UPDATE services
        SET billing_schedule = CASE
            WHEN renewal_config->>'type' = 'annual'  THEN 'annually'
            WHEN renewal_config->>'type' = 'monthly' THEN 'monthly'
            ELSE ''
        END
        """
    )

    op.drop_index(
        "ix_service_notification_recipients_user_id",
        table_name="service_notification_recipients",
    )
    op.drop_table("service_notification_recipients")
    op.drop_column("services", "renewal_config")
