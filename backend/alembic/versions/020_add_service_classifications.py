"""Add service_classifications table and services.classification_id FK.

Revision ID: 020
Revises: 019
Create Date: 2026-04-06
"""

from __future__ import annotations

import re
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(raw: str) -> str:
    s = raw.strip().lower().replace(" ", "_")
    s = re.sub(r"[^a-z0-9_]", "", s)
    return (s[:64] if s else "classification") or "classification"


def upgrade() -> None:
    op.create_table(
        "service_classifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
        sa.UniqueConstraint("name", name="uq_service_classifications_name"),
    )

    tbl = sa.table(
        "service_classifications",
        sa.column("id", sa.Uuid()),
        sa.column("slug", sa.String()),
        sa.column("name", sa.String()),
        sa.column("description", sa.Text()),
    )

    defaults = [
        ("core_saas", "Core SaaS", "Primary SaaS tools and platforms."),
        ("subscription", "Subscription", "Subscription-based vendor services."),
        ("internal", "Internal", "Internal or self-hosted systems."),
    ]
    rows: list[dict] = [
        {"id": uuid.uuid4(), "slug": s, "name": n, "description": d}
        for s, n, d in defaults
    ]
    slug_set = {r["slug"] for r in rows}

    conn = op.get_bind()
    distinct = conn.execute(
        sa.text(
            """
            SELECT DISTINCT classification
            FROM services
            WHERE classification IS NOT NULL AND btrim(classification) <> ''
            """
        )
    ).scalars()

    for raw in distinct:
        slug = _slugify(str(raw))
        if slug in slug_set:
            continue
        rows.append(
            {
                "id": uuid.uuid4(),
                "slug": slug,
                "name": str(raw).strip()[:100] or slug,
                "description": "Imported from legacy service.classification during migration.",
            }
        )
        slug_set.add(slug)

    op.bulk_insert(tbl, rows)

    op.add_column(
        "services",
        sa.Column(
            "classification_id",
            sa.Uuid(),
            sa.ForeignKey("service_classifications.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_services_classification_id",
        "services",
        ["classification_id"],
    )

    conn.execute(
        sa.text(
            """
            UPDATE services AS s
            SET classification_id = sc.id
            FROM service_classifications AS sc
            WHERE s.classification IS NOT NULL
              AND lower(btrim(s.classification)) = sc.slug
            """
        )
    )

    op.drop_column("services", "classification")


def downgrade() -> None:
    op.add_column(
        "services",
        sa.Column("classification", sa.String(length=64), nullable=True),
    )

    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE services AS s
            SET classification = left(sc.slug, 64)
            FROM service_classifications AS sc
            WHERE s.classification_id = sc.id
            """
        )
    )

    op.drop_index("ix_services_classification_id", table_name="services")
    op.drop_column("services", "classification_id")
    op.drop_table("service_classifications")
