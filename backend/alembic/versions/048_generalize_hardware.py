"""Generalize laptop inventory into typed hardware assets, preserving identities."""
from alembic import op
import sqlalchemy as sa

revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None


def upgrade():
    op.rename_table("laptops", "hardware_assets")
    op.alter_column("cost_records", "laptop_id", new_column_name="hardware_id")
    op.execute("ALTER INDEX uq_laptops_serial_number_lower RENAME TO uq_hardware_assets_serial_number_lower")
    op.execute("ALTER INDEX uq_cost_records_laptop_id RENAME TO uq_cost_records_hardware_id")
    op.execute("ALTER INDEX ix_cost_records_laptop_id RENAME TO ix_cost_records_hardware_id")
    op.alter_column("hardware_assets", "serial_number", existing_type=sa.String(255), nullable=True)
    op.add_column("hardware_assets", sa.Column("hardware_type", sa.String(20), nullable=False, server_default="laptop"))
    op.add_column("hardware_assets", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"))
    for name, length in [("os_version", 100), ("imei", 15), ("imei2", 15), ("phone_number", 50)]:
        op.add_column("hardware_assets", sa.Column(name, sa.String(length), nullable=True))
    op.create_check_constraint("ck_hardware_type", "hardware_assets", "hardware_type IN ('laptop', 'phone', 'tablet', 'accessory', 'peripheral')")
    op.create_check_constraint("ck_hardware_quantity", "hardware_assets", "quantity >= 1 AND (hardware_type = 'accessory' OR quantity = 1)")
    # Object keys remain untouched: only attachment metadata changes.
    op.execute("UPDATE attachments SET entity_type = 'hardware' WHERE entity_type = 'laptop'")


def downgrade():
    # Refuse to discard new device types or quantities when reverting to laptop-only code.
    connection = op.get_bind()
    incompatible = connection.scalar(sa.text("SELECT count(*) FROM hardware_assets WHERE hardware_type <> 'laptop' OR quantity <> 1 OR serial_number IS NULL OR os_version IS NOT NULL OR imei IS NOT NULL OR imei2 IS NOT NULL OR phone_number IS NOT NULL"))
    if incompatible:
        raise RuntimeError("Cannot downgrade: hardware contains records or fields unsupported by the laptop schema")
    op.execute("UPDATE attachments SET entity_type = 'laptop' WHERE entity_type = 'hardware'")
    op.drop_constraint("ck_hardware_quantity", "hardware_assets", type_="check")
    op.drop_constraint("ck_hardware_type", "hardware_assets", type_="check")
    for name in ("hardware_type", "quantity", "os_version", "imei", "imei2", "phone_number"):
        op.drop_column("hardware_assets", name)
    op.alter_column("hardware_assets", "serial_number", existing_type=sa.String(255), nullable=False)
    op.execute("ALTER INDEX ix_cost_records_hardware_id RENAME TO ix_cost_records_laptop_id")
    op.execute("ALTER INDEX uq_cost_records_hardware_id RENAME TO uq_cost_records_laptop_id")
    op.execute("ALTER INDEX uq_hardware_assets_serial_number_lower RENAME TO uq_laptops_serial_number_lower")
    op.alter_column("cost_records", "hardware_id", new_column_name="laptop_id")
    op.rename_table("hardware_assets", "laptops")
