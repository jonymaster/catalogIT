"""Extra notification recipients (global settings → users).

Revision ID: 016
Revises: 015
Create Date: 2026-04-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_extra_recipients",
        sa.Column("settings_id", sa.Integer(), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["settings_id"],
            ["notification_global_settings.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("settings_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("notification_extra_recipients")
