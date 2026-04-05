"""Drop branding_config table (logos are static frontend assets).

Revision ID: 021
Revises: 020
Create Date: 2026-04-06
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("branding_config")


def downgrade() -> None:
    op.create_table(
        "branding_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("logo_filename", sa.String(length=255), nullable=True),
        sa.Column("logo_content_type", sa.String(length=100), nullable=True),
        sa.Column("logo_storage_key", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_branding_config_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )
