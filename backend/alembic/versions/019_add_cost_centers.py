"""Add cost_centers reference table and services.cost_center_id FK.

Revision ID: 019
Revises: 018
Create Date: 2026-04-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cost_centers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.add_column(
        "services",
        sa.Column(
            "cost_center_id",
            sa.Uuid(),
            sa.ForeignKey("cost_centers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_services_cost_center_id",
        "services",
        ["cost_center_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_services_cost_center_id", table_name="services")
    op.drop_column("services", "cost_center_id")
    op.drop_table("cost_centers")
