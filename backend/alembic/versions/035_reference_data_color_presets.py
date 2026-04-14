"""Store reference badge colors as preset ids (not hex).

Revision ID: 035
Revises: 034
Create Date: 2026-04-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "035"
down_revision: Union[str, None] = "034"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_TABLES = (
    "categories",
    "payment_methods",
    "service_statuses",
    "service_classifications",
)


def upgrade() -> None:
    for table in _TABLES:
        op.alter_column(
            table,
            "color",
            type_=sa.String(length=32),
            existing_type=sa.String(length=7),
            nullable=False,
        )

    case_sql = """
 CASE lower(btrim(color))
        WHEN '#6366f1' THEN 'indigo'
        WHEN '#8b5cf6' THEN 'violet'
        WHEN '#ec4899' THEN 'pink'
        WHEN '#f43f5e' THEN 'rose'
        WHEN '#f97316' THEN 'orange'
        WHEN '#eab308' THEN 'yellow'
        WHEN '#22c55e' THEN 'emerald'
        WHEN '#14b8a6' THEN 'teal'
        WHEN '#06b6d4' THEN 'cyan'
        WHEN '#3b82f6' THEN 'blue'
        WHEN '#a855f7' THEN 'purple'
        WHEN '#0ea5e9' THEN 'sky'
        ELSE 'slate'
    END
    """

    for table in _TABLES:
        op.execute(
            sa.text(
                f"UPDATE {table} SET color = {case_sql} "
                f"WHERE color ~ '^#[0-9a-fA-F]{{6}}$'"
            )
        )


def downgrade() -> None:
    for table in _TABLES:
        op.alter_column(
            table,
            "color",
            type_=sa.String(length=7),
            existing_type=sa.String(length=32),
            nullable=False,
        )
