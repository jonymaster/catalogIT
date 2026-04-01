"""CMDB schema evolution: vendors, categories, login_methods, payment_methods,
contracts, service_logins, cost_records, service_history; alter services,
service_owners, users.

Revision ID: 007
Revises: 006
Create Date: 2026-04-02
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Lookup tables ────────────────────────────────────────────────

    op.create_table(
        "vendors",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("website", sa.String(512), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "login_methods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "payment_methods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("method_type", sa.String(50), nullable=False, server_default=""),
        sa.Column("last_four", sa.String(4), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # ── 2. Contracts (FK to vendors) ────────────────────────────────────

    op.create_table(
        "contracts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("vendor_id", sa.Uuid(), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contract_ref", sa.String(255), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("total_value", sa.Numeric(12, 2), nullable=True),
        sa.Column("terms_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contracts_vendor_id", "contracts", ["vendor_id"])

    # ── 3. Alter services ───────────────────────────────────────────────

    op.add_column("services", sa.Column("vendor_id", sa.Uuid(), sa.ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True))
    op.add_column("services", sa.Column("category_id", sa.Uuid(), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True))
    op.add_column("services", sa.Column("payment_method_id", sa.Uuid(), sa.ForeignKey("payment_methods.id", ondelete="SET NULL"), nullable=True))
    op.add_column("services", sa.Column("contract_id", sa.Uuid(), sa.ForeignKey("contracts.id", ondelete="SET NULL"), nullable=True))
    op.add_column("services", sa.Column("classification", sa.String(20), nullable=True))
    op.add_column("services", sa.Column("service_type", sa.String(20), nullable=True))
    op.add_column("services", sa.Column("scim_enabled", sa.Boolean(), nullable=True))
    op.add_column("services", sa.Column("scim_notes", sa.Text(), nullable=True))
    op.add_column("services", sa.Column("criticality", sa.String(20), nullable=True))
    op.add_column("services", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("services", sa.Column("deprecated_at", sa.DateTime(), nullable=True))

    op.create_index("ix_services_vendor_id", "services", ["vendor_id"])
    op.create_index("ix_services_category_id", "services", ["category_id"])

    # ── 4. Alter service_owners ─────────────────────────────────────────

    op.add_column("service_owners", sa.Column("id", sa.String(36), nullable=True))
    op.add_column("service_owners", sa.Column("role", sa.String(20), nullable=False, server_default="owner"))

    # ── 5. Alter users ──────────────────────────────────────────────────

    op.add_column("users", sa.Column("display_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("department", sa.String(100), nullable=True))

    # ── 6. Junction / detail tables ─────────────────────────────────────

    op.create_table(
        "service_logins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), sa.ForeignKey("services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("login_method_id", sa.Uuid(), sa.ForeignKey("login_methods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_service_logins_service_id", "service_logins", ["service_id"])
    op.create_index("ix_service_logins_login_method_id", "service_logins", ["login_method_id"])

    op.create_table(
        "cost_records",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), sa.ForeignKey("services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payment_method_id", sa.Uuid(), sa.ForeignKey("payment_methods.id", ondelete="SET NULL"), nullable=True),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("record_type", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("recorded_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cost_records_service_id", "cost_records", ["service_id"])
    op.create_index("ix_cost_records_fiscal_year", "cost_records", ["fiscal_year"])

    op.create_table(
        "service_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("service_id", sa.Uuid(), sa.ForeignKey("services.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action_date", sa.String(20), nullable=False),
        sa.Column("action_type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("changed_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_service_history_service_id", "service_history", ["service_id"])


def downgrade() -> None:
    op.drop_table("service_history")
    op.drop_table("cost_records")
    op.drop_table("service_logins")

    op.drop_column("users", "department")
    op.drop_column("users", "display_name")

    op.drop_column("service_owners", "role")
    op.drop_column("service_owners", "id")

    op.drop_index("ix_services_category_id", table_name="services")
    op.drop_index("ix_services_vendor_id", table_name="services")
    op.drop_column("services", "deprecated_at")
    op.drop_column("services", "is_active")
    op.drop_column("services", "criticality")
    op.drop_column("services", "scim_notes")
    op.drop_column("services", "scim_enabled")
    op.drop_column("services", "service_type")
    op.drop_column("services", "classification")
    op.drop_column("services", "contract_id")
    op.drop_column("services", "payment_method_id")
    op.drop_column("services", "category_id")
    op.drop_column("services", "vendor_id")

    op.drop_table("contracts")
    op.drop_table("payment_methods")
    op.drop_table("login_methods")
    op.drop_table("categories")
    op.drop_table("vendors")
