"""Add badge color preset to hardware_statuses.

Revision ID: 038
Revises: 037
Create Date: 2026-04-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "038"
down_revision: Union[str, None] = "037"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Keep in sync with app.reference_data_colors.BADGE_COLOR_PRESETS (order + length).
_PRESETS = (
    "white",
    "yellow",
    "lime",
    "cyan",
    "sky",
    "green",
    "emerald",
    "teal",
    "blue",
    "pink",
    "rose",
    "fuchsia",
    "magenta",
    "violet",
    "purple",
    "orange",
    "amber",
    "red",
    "indigo",
    "brand",
    "gray",
    "navy",
    "brown",
    "dark_gray",
)


def _backfill() -> None:
    palette_sql = ", ".join(f"'{p}'" for p in _PRESETS)
    n = len(_PRESETS)
    op.execute(
        sa.text(
            f"""
            UPDATE hardware_statuses AS t
            SET color = sub.c
            FROM (
                SELECT id,
                    (ARRAY[{palette_sql}])[
                        ((ROW_NUMBER() OVER (ORDER BY id) - 1) % {n}) + 1
                    ] AS c
                FROM hardware_statuses
            ) AS sub
            WHERE t.id = sub.id
            """
        )
    )


def upgrade() -> None:
    op.add_column(
        "hardware_statuses",
        sa.Column("color", sa.String(length=32), nullable=True),
    )
    _backfill()
    op.alter_column("hardware_statuses", "color", nullable=False)


def downgrade() -> None:
    op.drop_column("hardware_statuses", "color")
