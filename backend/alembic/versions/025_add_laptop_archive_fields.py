"""Add archive fields to laptops.

Revision ID: 025
Revises: 024
Create Date: 2026-04-06
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "025"
down_revision: Union[str, None] = "024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "laptops",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column("laptops", sa.Column("archived_at", sa.DateTime(), nullable=True))
    op.alter_column("laptops", "is_active", server_default=None)


def downgrade() -> None:
    op.drop_column("laptops", "archived_at")
    op.drop_column("laptops", "is_active")
