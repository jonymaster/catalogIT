"""Add theme preference to users.

Revision ID: 024
Revises: 023
Create Date: 2026-04-06
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "024"
down_revision: Union[str, None] = "023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("theme", sa.String(length=10), nullable=False, server_default="light"),
    )
    op.alter_column("users", "theme", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "theme")
