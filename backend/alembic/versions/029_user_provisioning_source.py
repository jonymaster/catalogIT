"""Add users.provisioning_source (local / scim / oidc).

Revision ID: 029
Revises: 028
Create Date: 2026-04-11
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "provisioning_source",
            sa.String(20),
            nullable=False,
            server_default="local",
        ),
    )
    op.create_check_constraint(
        "ck_users_provisioning_source",
        "users",
        sa.text("provisioning_source IN ('local', 'scim', 'oidc')"),
    )
    op.create_index(
        "ix_users_provisioning_source", "users", ["provisioning_source"]
    )

    op.alter_column("users", "provisioning_source", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_users_provisioning_source", table_name="users")
    op.drop_constraint("ck_users_provisioning_source", "users", type_="check")
    op.drop_column("users", "provisioning_source")
