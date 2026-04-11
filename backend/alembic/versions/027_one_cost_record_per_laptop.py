"""At most one cost record per laptop (partial unique index).

Revision ID: 027
Revises: 026
Create Date: 2026-04-11
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "027"
down_revision: Union[str, None] = "026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM cost_records c
            WHERE c.laptop_id IS NOT NULL
            AND c.id NOT IN (
                SELECT DISTINCT ON (laptop_id) id
                FROM cost_records
                WHERE laptop_id IS NOT NULL
                ORDER BY laptop_id, recorded_at DESC NULLS LAST, id DESC
            )
            """
        )
    )
    op.create_index(
        "uq_cost_records_laptop_id",
        "cost_records",
        ["laptop_id"],
        unique=True,
        postgresql_where=sa.text("laptop_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_cost_records_laptop_id",
        table_name="cost_records",
        postgresql_where=sa.text("laptop_id IS NOT NULL"),
    )
