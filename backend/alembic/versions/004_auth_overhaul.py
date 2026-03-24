"""Auth overhaul: generic OIDC, local passwords, RBAC

Revision ID: 004
Revises: 003
Create Date: 2026-03-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename okta_id -> external_id
    op.alter_column("users", "okta_id", new_column_name="external_id")

    # Add new user columns
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("role", sa.String(20), nullable=False, server_default="viewer"))
    op.add_column("users", sa.Column("must_reset_password", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    # Create oidc_config singleton table
    op.create_table(
        "oidc_config",
        sa.Column("id", sa.Integer(), nullable=False, default=1),
        sa.Column("provider_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("issuer_url", sa.String(500), nullable=False, server_default=""),
        sa.Column("client_id", sa.String(255), nullable=False, server_default=""),
        sa.Column("client_secret", sa.Text(), nullable=False, server_default=""),
        sa.Column("scopes", sa.String(500), nullable=False, server_default="openid profile email"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 1", name="ck_oidc_config_singleton"),
    )


def downgrade() -> None:
    op.drop_table("oidc_config")
    op.drop_column("users", "must_reset_password")
    op.drop_column("users", "role")
    op.drop_column("users", "password_hash")
    op.alter_column("users", "external_id", new_column_name="okta_id")
