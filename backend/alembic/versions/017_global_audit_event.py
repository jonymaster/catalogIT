"""Global audit event table; migrate from audit_log.

Revision ID: 017
Revises: 016
Create Date: 2026-04-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "global_audit_event",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("entity_table", sa.String(100), nullable=True),
        sa.Column("entity_key", sa.Text(), nullable=True),
        sa.Column("actor_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("details", JSONB, nullable=True),
        sa.Column("request_id", sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_global_audit_event_category", "global_audit_event", ["category"]
    )
    op.create_index(
        "ix_global_audit_event_event_type", "global_audit_event", ["event_type"]
    )
    op.create_index(
        "ix_global_audit_event_entity_table", "global_audit_event", ["entity_table"]
    )
    op.create_index(
        "ix_global_audit_event_entity_key", "global_audit_event", ["entity_key"]
    )
    op.create_index(
        "ix_global_audit_event_actor_user_id", "global_audit_event", ["actor_user_id"]
    )
    op.create_index(
        "ix_global_audit_event_occurred_at", "global_audit_event", ["occurred_at"]
    )
    op.create_index(
        "ix_global_audit_event_request_id", "global_audit_event", ["request_id"]
    )
    op.create_index(
        "ix_global_audit_event_table_key_time",
        "global_audit_event",
        ["entity_table", "entity_key", "occurred_at"],
    )

    op.execute(
        sa.text(
            """
            INSERT INTO global_audit_event (
                id, category, event_type, entity_table, entity_key,
                actor_user_id, occurred_at, summary, details, request_id
            )
            SELECT
                id,
                'data_change',
                action,
                table_name,
                record_id::text,
                changed_by_id,
                ("timestamp" AT TIME ZONE 'UTC')::timestamptz,
                table_name || ' ' || action,
                jsonb_build_object(
                    'action', action,
                    'old_values', old_values,
                    'new_values', new_values
                ),
                NULL
            FROM audit_log
            """
        )
    )

    op.drop_index("ix_audit_log_timestamp", table_name="audit_log")
    op.drop_index("ix_audit_log_record_id", table_name="audit_log")
    op.drop_index("ix_audit_log_table_name", table_name="audit_log")
    op.drop_table("audit_log")


def downgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("table_name", sa.String(100), nullable=False),
        sa.Column("record_id", UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column("changed_by_id", UUID(as_uuid=True), nullable=True),
        sa.Column("timestamp", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("old_values", JSONB, nullable=True),
        sa.Column("new_values", JSONB, nullable=True),
        sa.ForeignKeyConstraint(
            ["changed_by_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_log_table_name", "audit_log", ["table_name"])
    op.create_index("ix_audit_log_record_id", "audit_log", ["record_id"])
    op.create_index("ix_audit_log_timestamp", "audit_log", ["timestamp"])

    op.execute(
        sa.text(
            """
            INSERT INTO audit_log (
                id, table_name, record_id, action, changed_by_id, timestamp, old_values, new_values
            )
            SELECT
                g.id,
                g.entity_table,
                (g.entity_key)::uuid,
                COALESCE(g.details->>'action', g.event_type),
                g.actor_user_id,
                g.occurred_at AT TIME ZONE 'UTC',
                g.details->'old_values',
                g.details->'new_values'
            FROM global_audit_event g
            WHERE g.category = 'data_change'
              AND g.entity_table IS NOT NULL
              AND g.entity_key ~ '^[0-9a-f-]{36}$'
            """
        )
    )

    op.drop_index("ix_global_audit_event_table_key_time", table_name="global_audit_event")
    op.drop_index("ix_global_audit_event_request_id", table_name="global_audit_event")
    op.drop_index("ix_global_audit_event_occurred_at", table_name="global_audit_event")
    op.drop_index("ix_global_audit_event_actor_user_id", table_name="global_audit_event")
    op.drop_index("ix_global_audit_event_entity_key", table_name="global_audit_event")
    op.drop_index("ix_global_audit_event_entity_table", table_name="global_audit_event")
    op.drop_index("ix_global_audit_event_event_type", table_name="global_audit_event")
    op.drop_index("ix_global_audit_event_category", table_name="global_audit_event")
    op.drop_table("global_audit_event")
