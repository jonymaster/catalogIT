"""Create attachments table

Revision ID: 006
Revises: 005
Create Date: 2026-03-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.BigInteger(), nullable=False),
        sa.Column("storage_key", sa.String(512), nullable=False),
        sa.Column(
            "uploaded_by_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_attachments_entity", "attachments", ["entity_type", "entity_id"])
    op.create_index("ix_attachments_uploaded_by", "attachments", ["uploaded_by_id"])


def downgrade() -> None:
    op.drop_index("ix_attachments_uploaded_by", table_name="attachments")
    op.drop_index("ix_attachments_entity", table_name="attachments")
    op.drop_table("attachments")
