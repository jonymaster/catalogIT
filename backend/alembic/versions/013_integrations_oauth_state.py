"""Integration configs and OAuth state store.

Revision ID: 013
Revises: 012
Create Date: 2026-04-03
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "integration_config",
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("connection_status", sa.String(length=32), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("metadata", JSONB(), nullable=True),
        sa.Column("secrets_encrypted", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("channel"),
    )
    op.create_table(
        "oauth_state",
        sa.Column("state", sa.String(length=128), nullable=False),
        sa.Column("channel", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("state"),
    )
    op.create_index("ix_oauth_state_expires_at", "oauth_state", ["expires_at"])

    op.execute(
        sa.text(
            """INSERT INTO integration_config (channel, enabled, connection_status, metadata)
            VALUES
            ('google_mail', false, 'not_configured', '{}'::jsonb),
            ('slack', false, 'not_configured', '{}'::jsonb),
            ('telegram', false, 'not_configured', '{}'::jsonb),
            ('webhook', false, 'not_configured', '{}'::jsonb)
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_oauth_state_expires_at", table_name="oauth_state")
    op.drop_table("oauth_state")
    op.drop_table("integration_config")
