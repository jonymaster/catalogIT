"""Drop legacy service columns (license_type, service_type, scim_notes, automated_provisioning).

Revision ID: 018
Revises: 017
Create Date: 2026-04-06
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("services", "automated_provisioning")
    op.drop_column("services", "scim_notes")
    op.drop_column("services", "service_type")
    op.drop_column("services", "license_type")


def downgrade() -> None:
    op.add_column(
        "services",
        sa.Column("license_type", sa.String(length=100), nullable=False, server_default=""),
    )
    op.add_column(
        "services",
        sa.Column("service_type", sa.String(length=20), nullable=True),
    )
    op.add_column("services", sa.Column("scim_notes", sa.Text(), nullable=True))
    op.add_column(
        "services",
        sa.Column(
            "automated_provisioning",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("services", "license_type", server_default=None)
