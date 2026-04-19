"""Add operating_system to laptops.

Revision ID: 041
Revises: 040
Create Date: 2026-04-20
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "041"
down_revision: Union[str, None] = "040"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "laptops",
        sa.Column("operating_system", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("laptops", "operating_system")
