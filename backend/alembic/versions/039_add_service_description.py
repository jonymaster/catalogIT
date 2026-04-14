"""Add description to services.

Revision ID: 039
Revises: 038
Create Date: 2026-04-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "039"
down_revision: Union[str, None] = "038"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("services", sa.Column("description", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("services", "description")
