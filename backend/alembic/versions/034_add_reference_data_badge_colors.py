"""Add badge color to reference data tables.

Revision ID: 034
Revises: 033
Create Date: 2026-04-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "034"
down_revision: Union[str, None] = "033"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_PALETTE = (
    "#6366f1",
    "#8b5cf6",
    "#ec4899",
    "#f43f5e",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#14b8a6",
    "#06b6d4",
    "#3b82f6",
    "#a855f7",
    "#0ea5e9",
)


def _backfill_table(table: str) -> None:
    palette_sql = ", ".join(f"'{c}'" for c in _PALETTE)
    op.execute(
        sa.text(
            f"""
            UPDATE {table} AS t
            SET color = sub.c
            FROM (
                SELECT id,
                    (ARRAY[{palette_sql}])[
                        ((ROW_NUMBER() OVER (ORDER BY id) - 1) % 12) + 1
                    ] AS c
                FROM {table}
            ) AS sub
            WHERE t.id = sub.id
            """
        )
    )


def upgrade() -> None:
    for table in (
        "categories",
        "payment_methods",
        "service_statuses",
        "service_classifications",
    ):
        op.add_column(table, sa.Column("color", sa.String(7), nullable=True))

    for table in (
        "categories",
        "payment_methods",
        "service_statuses",
        "service_classifications",
    ):
        _backfill_table(table)
        op.alter_column(table, "color", nullable=False)


def downgrade() -> None:
    for table in (
        "categories",
        "payment_methods",
        "service_statuses",
        "service_classifications",
    ):
        op.drop_column(table, "color")
