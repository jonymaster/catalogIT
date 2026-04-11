"""Hardware statuses, locations, and laptop FKs.

Revision ID: 028
Revises: 027
Create Date: 2026-04-11
"""

from __future__ import annotations

import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Normalize legacy free-text variants to canonical names where possible.
_STATUS_NAME_MAP = {
    "in_stock": "In Stock",
    "in-stock": "In Stock",
    "in stock": "In Stock",
    "in_repair": "In Repair",
    "in-repair": "In Repair",
    "in repair": "In Repair",
}


def _normalize_status_name(raw: str) -> str:
    normalized = raw.strip()
    if not normalized:
        return ""
    lookup_key = normalized.lower().replace(" ", "_")
    return _STATUS_NAME_MAP.get(lookup_key, normalized)


def upgrade() -> None:
    op.create_table(
        "hardware_statuses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "hardware_locations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    hardware_statuses_table = sa.table(
        "hardware_statuses",
        sa.column("id", sa.Uuid()),
        sa.column("name", sa.String()),
        sa.column("description", sa.Text()),
    )

    default_statuses = [
        ("In Stock", "Device is available in inventory."),
        ("Assigned", "Device is assigned to a user."),
        ("In Repair", "Device is out for repair or maintenance."),
        ("Dismissed", "Device was dismissed from active tracking."),
        ("Retired", "Device is retired but may still exist physically."),
        ("Lost", "Device is reported lost."),
    ]

    rows: list[dict] = [
        {"id": uuid.uuid4(), "name": name, "description": description}
        for name, description in default_statuses
    ]

    conn = op.get_bind()
    existing_names = {name.lower() for name, _description in default_statuses}
    distinct_statuses = conn.execute(
        sa.text(
            """
            SELECT DISTINCT status
            FROM laptops
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
                "description": "Imported from existing laptop status values during migration.",
            }
        )
        existing_names.add(normalized.lower())

    op.bulk_insert(hardware_statuses_table, rows)

    op.add_column(
        "laptops",
        sa.Column(
            "hardware_status_id",
            sa.Uuid(),
            sa.ForeignKey("hardware_statuses.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "laptops",
        sa.Column(
            "hardware_location_id",
            sa.Uuid(),
            sa.ForeignKey("hardware_locations.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_laptops_hardware_status_id", "laptops", ["hardware_status_id"])
    op.create_index("ix_laptops_hardware_location_id", "laptops", ["hardware_location_id"])

    status_id_by_name = {row["name"].lower(): row["id"] for row in rows}

    laptop_rows = conn.execute(
        sa.text(
            """
            SELECT id, status
            FROM laptops
            WHERE status IS NOT NULL AND btrim(status) <> ''
            """
        )
    ).mappings()

    for laptop_row in laptop_rows:
        normalized = _normalize_status_name(laptop_row["status"])
        if not normalized:
            continue
        status_id = status_id_by_name.get(normalized.lower())
        if status_id is None:
            continue
        conn.execute(
            sa.text(
                """
                UPDATE laptops
                SET status = :status_name,
                    hardware_status_id = :hardware_status_id
                WHERE id = :laptop_id
                """
            ),
            {
                "laptop_id": laptop_row["id"],
                "status_name": normalized,
                "hardware_status_id": status_id,
            },
        )


def downgrade() -> None:
    op.drop_index("ix_laptops_hardware_location_id", table_name="laptops")
    op.drop_index("ix_laptops_hardware_status_id", table_name="laptops")
    op.drop_column("laptops", "hardware_location_id")
    op.drop_column("laptops", "hardware_status_id")
    op.drop_table("hardware_locations")
    op.drop_table("hardware_statuses")
