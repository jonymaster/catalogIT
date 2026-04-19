"""Add case-insensitive unique index for laptop serial numbers.

Revision ID: 042
Revises: 041
Create Date: 2026-04-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "042"
down_revision: Union[str, None] = "041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_laptops_serial_number_lower",
        "laptops",
        [sa.text("lower(serial_number)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_laptops_serial_number_lower", table_name="laptops")
