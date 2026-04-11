"""Cost records: hardware ownership and purchase year.

Revision ID: 026
Revises: 025
Create Date: 2026-04-11
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cost_records",
        sa.Column("laptop_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "cost_records",
        sa.Column("purchase_year", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_cost_records_laptop_id_laptops",
        "cost_records",
        "laptops",
        ["laptop_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_cost_records_laptop_id", "cost_records", ["laptop_id"])
    op.create_index("ix_cost_records_purchase_year", "cost_records", ["purchase_year"])
    op.alter_column(
        "cost_records",
        "service_id",
        existing_type=sa.Uuid(),
        nullable=True,
    )
    op.create_check_constraint(
        "ck_cost_records_service_or_laptop",
        "cost_records",
        sa.text(
            "(service_id IS NOT NULL AND laptop_id IS NULL) OR "
            "(service_id IS NULL AND laptop_id IS NOT NULL)"
        ),
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM cost_records WHERE laptop_id IS NOT NULL"))
    op.drop_constraint("ck_cost_records_service_or_laptop", "cost_records", type_="check")
    op.drop_index("ix_cost_records_purchase_year", table_name="cost_records")
    op.drop_index("ix_cost_records_laptop_id", table_name="cost_records")
    op.drop_constraint("fk_cost_records_laptop_id_laptops", "cost_records", type_="foreignkey")
    op.drop_column("cost_records", "purchase_year")
    op.drop_column("cost_records", "laptop_id")
    op.alter_column(
        "cost_records",
        "service_id",
        existing_type=sa.Uuid(),
        nullable=False,
    )
