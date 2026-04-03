"""Drop legacy free-text category column from services.

Revision ID: 014
Revises: 013
Create Date: 2026-04-03
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("services", "category")


def downgrade() -> None:
    op.add_column(
        "services",
        sa.Column("category", sa.String(length=100), nullable=False, server_default=""),
    )
    op.alter_column("services", "category", server_default=None)
