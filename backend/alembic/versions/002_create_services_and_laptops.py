"""Create services, laptops, and service_owners tables

Revision ID: 002
Revises: 001
Create Date: 2026-03-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "services",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("license_type", sa.String(100), nullable=False, server_default=""),
        sa.Column("category", sa.String(100), nullable=False, server_default=""),
        sa.Column("billing_schedule", sa.String(100), nullable=False, server_default=""),
        sa.Column("yearly_cost", sa.Numeric(12, 2), nullable=True),
        sa.Column("sso_integrated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("automated_provisioning", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "laptops",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("serial_number", sa.String(255), nullable=False),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("cpu", sa.String(100), nullable=False, server_default=""),
        sa.Column("ram", sa.String(50), nullable=False, server_default=""),
        sa.Column("storage_size", sa.String(50), nullable=False, server_default=""),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("assigned_to_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("serial_number"),
    )

    op.create_table(
        "service_owners",
        sa.Column("service_id", sa.Uuid(), sa.ForeignKey("services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("service_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("service_owners")
    op.drop_table("laptops")
    op.drop_table("services")
