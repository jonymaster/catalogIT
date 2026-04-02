"""Add service statuses reference data and service FK.

Revision ID: 008
Revises: 007
Create Date: 2026-04-03
"""

from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


STATUS_NAME_MAP = {
    "contract": "Contract",
    "self_managed": "Self-Managed",
    "self-managed": "Self-Managed",
    "active": "Active",
    "under_review": "Under Review",
    "under-review": "Under Review",
    "under review": "Under Review",
    "deprecated": "Deprecated",
    "trial": "Trial",
}


def _normalize_status_name(raw: str) -> str:
    normalized = raw.strip()
    if not normalized:
        return ""
    lookup_key = normalized.lower().replace(" ", "_")
    return STATUS_NAME_MAP.get(lookup_key, normalized)


def upgrade() -> None:
    op.create_table(
        "service_statuses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    service_statuses_table = sa.table(
        "service_statuses",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("description", sa.Text()),
    )

    default_statuses = [
        ("Contract", "Service is in contract onboarding or procurement."),
        ("Self-Managed", "Service is operated internally or outside a vendor contract."),
        ("Active", "Service is active and in normal use."),
        ("Under Review", "Service is being reviewed for fit, cost, or compliance."),
        ("Deprecated", "Service is being phased out or replaced."),
        ("Trial", "Service is being evaluated before broader adoption."),
    ]

    rows = [
        {"id": uuid.uuid4(), "name": name, "description": description}
        for name, description in default_statuses
    ]

    conn = op.get_bind()
    existing_names = {name.lower() for name, _description in default_statuses}
    distinct_statuses = conn.execute(
        sa.text(
            """
            SELECT DISTINCT status
            FROM services
            WHERE status IS NOT NULL AND btrim(status) <> ''
            """
        )
    ).scalars()

    for status_name in distinct_statuses:
        normalized = _normalize_status_name(status_name)
        if not normalized:
            continue
        if normalized.lower() in existing_names:
            continue
        rows.append(
            {
                "id": uuid.uuid4(),
                "name": normalized,
                "description": "Imported from existing service status values during migration.",
            }
        )
        existing_names.add(normalized.lower())

    op.bulk_insert(service_statuses_table, rows)

    op.add_column(
        "services",
        sa.Column(
            "service_status_id",
            sa.Uuid(),
            sa.ForeignKey("service_statuses.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_services_service_status_id", "services", ["service_status_id"])

    status_id_by_name = {row["name"].lower(): row["id"] for row in rows}
    service_rows = conn.execute(
        sa.text(
            """
            SELECT id, status
            FROM services
            WHERE status IS NOT NULL AND btrim(status) <> ''
            """
        )
    ).mappings()

    for service_row in service_rows:
        normalized = _normalize_status_name(service_row["status"])
        if not normalized:
            continue
        status_id = status_id_by_name.get(normalized.lower())
        if status_id is None:
            continue
        conn.execute(
            sa.text(
                """
                UPDATE services
                SET status = :status_name,
                    service_status_id = :service_status_id
                WHERE id = :service_id
                """
            ),
            {
                "service_id": service_row["id"],
                "status_name": normalized,
                "service_status_id": status_id,
            },
        )


def downgrade() -> None:
    op.drop_index("ix_services_service_status_id", table_name="services")
    op.drop_column("services", "service_status_id")
    op.drop_table("service_statuses")
