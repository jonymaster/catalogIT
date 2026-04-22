"""Add tags and service_tags join table.

Revision ID: 043
Revises: 042
Create Date: 2026-04-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "043"
down_revision: Union[str, None] = "042"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("color", sa.String(length=32), nullable=False, server_default="gray"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_tags_name"),
    )
    op.create_index("ix_tags_name", "tags", ["name"])

    op.create_table(
        "service_tags",
        sa.Column(
            "service_id",
            sa.Uuid(),
            sa.ForeignKey("services.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tag_id",
            sa.Uuid(),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("service_id", "tag_id"),
    )
    op.create_index("ix_service_tags_tag_id", "service_tags", ["tag_id"])


def downgrade() -> None:
    op.drop_index("ix_service_tags_tag_id", table_name="service_tags")
    op.drop_table("service_tags")
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_table("tags")
