"""Add service reporting dimensions and related-service links.

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
    op.add_column("services", sa.Column("subcategory", sa.String(length=100), nullable=True))
    op.add_column("services", sa.Column("environment", sa.String(length=100), nullable=True))
    op.create_table(
        "service_related_services",
        sa.Column("service_id", sa.Uuid(), nullable=False),
        sa.Column("related_service_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["related_service_id"], ["services.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["services.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("service_id", "related_service_id"),
    )


def downgrade() -> None:
    op.drop_table("service_related_services")
    op.drop_column("services", "environment")
    op.drop_column("services", "subcategory")
