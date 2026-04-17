"""Add ui_preferences JSON storage to users.

Revision ID: 041
Revises: 040
Create Date: 2026-04-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "041"
down_revision: Union[str, None] = "040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ui_preferences", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "ui_preferences")
