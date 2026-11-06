"""Add fiscal_year_close_batches and the rollover links on cost_records (close financial year)."""
from alembic import op
import sqlalchemy as sa

revision = "050"
down_revision = "049"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "fiscal_year_close_batches",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("fiscal_year", sa.Integer(), nullable=False),
        sa.Column("uplift_pct", sa.Numeric(7, 2), nullable=False),
        sa.Column("converted_count", sa.Integer(), nullable=False),
        sa.Column("created_count", sa.Integer(), nullable=False),
        sa.Column("converted_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("next_year_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("created_by_id", sa.Uuid(), nullable=True),
        sa.Column("reverted_at", sa.DateTime(), nullable=True),
        sa.Column("reverted_by_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reverted_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_fiscal_year_close_batches_fiscal_year", "fiscal_year_close_batches", ["fiscal_year"]
    )
    op.add_column("cost_records", sa.Column("rollover_batch_id", sa.Uuid(), nullable=True))
    op.add_column("cost_records", sa.Column("rollover_action", sa.String(20), nullable=True))
    op.create_foreign_key(
        "fk_cost_records_rollover_batch_id",
        "cost_records",
        "fiscal_year_close_batches",
        ["rollover_batch_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_cost_records_rollover_batch_id", "cost_records", ["rollover_batch_id"])
    # The batch that created the record. Kept when a later close converts it, so reverting that
    # later close can hand the record back to its creating batch.
    op.add_column("cost_records", sa.Column("rollover_created_batch_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_cost_records_rollover_created_batch_id",
        "cost_records",
        "fiscal_year_close_batches",
        ["rollover_created_batch_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_cost_records_rollover_created_batch_id", "cost_records", ["rollover_created_batch_id"])


def downgrade():
    # Records keep their current type and amount; only the links to the batch are dropped.
    op.drop_index("ix_cost_records_rollover_created_batch_id", table_name="cost_records")
    op.drop_constraint("fk_cost_records_rollover_created_batch_id", "cost_records", type_="foreignkey")
    op.drop_column("cost_records", "rollover_created_batch_id")
    op.drop_index("ix_cost_records_rollover_batch_id", table_name="cost_records")
    op.drop_constraint("fk_cost_records_rollover_batch_id", "cost_records", type_="foreignkey")
    op.drop_column("cost_records", "rollover_action")
    op.drop_column("cost_records", "rollover_batch_id")
    op.drop_index("ix_fiscal_year_close_batches_fiscal_year", table_name="fiscal_year_close_batches")
    op.drop_table("fiscal_year_close_batches")
