"""Notification email HTML storage key and inline asset keys (MinIO).

Revision ID: 022
Revises: 021
Create Date: 2026-04-06
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "022"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notification_global_settings",
        sa.Column("renewal_email_html_storage_key", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "notification_global_settings",
        sa.Column("renewal_email_template_asset_keys", JSONB(), nullable=True),
    )

    # Copy Gmail integration templates into notification settings when empty (single source of truth).
    op.execute(
        """
        UPDATE notification_global_settings AS ngs
        SET
          renewal_email_subject_template = CASE
            WHEN ngs.renewal_email_subject_template IS NOT NULL
                 AND btrim(ngs.renewal_email_subject_template) <> ''
            THEN ngs.renewal_email_subject_template
            ELSE (SELECT ic.metadata->>'email_subject_template' FROM integration_config ic WHERE ic.channel = 'google_mail')
          END,
          renewal_email_html_template = CASE
            WHEN ngs.renewal_email_html_template IS NOT NULL
                 AND btrim(ngs.renewal_email_html_template) <> ''
            THEN ngs.renewal_email_html_template
            ELSE (SELECT ic.metadata->>'email_html_template' FROM integration_config ic WHERE ic.channel = 'google_mail')
          END,
          renewal_email_text_template = CASE
            WHEN ngs.renewal_email_text_template IS NOT NULL
                 AND btrim(ngs.renewal_email_text_template) <> ''
            THEN ngs.renewal_email_text_template
            ELSE (SELECT ic.metadata->>'email_text_template' FROM integration_config ic WHERE ic.channel = 'google_mail')
          END
        WHERE ngs.id = 1
        """
    )


def downgrade() -> None:
    op.drop_column("notification_global_settings", "renewal_email_template_asset_keys")
    op.drop_column("notification_global_settings", "renewal_email_html_storage_key")
