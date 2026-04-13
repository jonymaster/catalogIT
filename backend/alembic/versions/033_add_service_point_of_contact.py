"""Add point_of_contact to services.

Revision ID: 033
Revises: 032
Create Date: 2026-04-13
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "033"
down_revision: Union[str, None] = "032"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("services", sa.Column("point_of_contact", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("services", "point_of_contact")
