"""Add trusted_token_issuer singleton for externally issued access tokens (MCP OAuth)."""
from alembic import op
import sqlalchemy as sa

revision = "049"
down_revision = "048"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "trusted_token_issuer",
        sa.Column("id", sa.Integer(), nullable=False, default=1),
        sa.Column("provider_name", sa.String(100), nullable=False, server_default=""),
        sa.Column("issuer_url", sa.String(500), nullable=False, server_default=""),
        sa.Column("jwks_url", sa.String(500), nullable=False, server_default=""),
        sa.Column("audience", sa.String(500), nullable=False, server_default=""),
        sa.Column("email_claim", sa.String(100), nullable=False, server_default="email"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("id = 1", name="ck_trusted_token_issuer_singleton"),
    )


def downgrade():
    op.drop_table("trusted_token_issuer")
