"""Rename badge preset beige -> brown for databases that already ran 036 with beige.

Revision ID: 037
Revises: 036
Create Date: 2026-04-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "037"
down_revision: Union[str, None] = "036"
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
        op.execute(
            sa.text(
                f"UPDATE {table} SET color = 'brown' "
                f"WHERE lower(btrim(color)) = 'beige'"
            )
        )


def downgrade() -> None:
    # No-op: reversing would turn native `brown` rows into invalid `beige` ids.
    pass
