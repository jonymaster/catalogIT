"""Add user_permissions for global permission slugs.

Revision ID: 031
Revises: 030
Create Date: 2026-04-12
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "031"
down_revision: Union[str, None] = "030"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_permissions",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "permission"),
    )


def downgrade() -> None:
    op.drop_table("user_permissions")
