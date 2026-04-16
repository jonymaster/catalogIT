"""Drop persisted yearly_cost from services (derived from cost_records).

Revision ID: 040
Revises: 039
Create Date: 2026-04-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "040"
down_revision: Union[str, None] = "039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("services", "yearly_cost")


def downgrade() -> None:
    op.add_column(
        "services",
        sa.Column("yearly_cost", sa.Numeric(12, 2), nullable=True),
    )
