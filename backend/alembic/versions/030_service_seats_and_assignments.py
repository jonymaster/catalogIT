"""Add services.total_seats and service_assignments table.

Revision ID: 030
Revises: 029
Create Date: 2026-04-12
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "030"
down_revision: Union[str, None] = "029"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "services",
        sa.Column("total_seats", sa.Integer(), nullable=True),
    )
    op.create_table(
        "service_assignments",
        sa.Column("service_id", sa.Uuid(), sa.ForeignKey("services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("service_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("service_assignments")
    op.drop_column("services", "total_seats")
