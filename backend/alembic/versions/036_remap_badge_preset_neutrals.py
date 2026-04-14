"""Remap removed badge presets (slate/zinc/neutral/stone/ruby) to new ids.

Revision ID: 036
Revises: 035
Create Date: 2026-04-14
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "036"
down_revision: Union[str, None] = "035"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_TABLES = (
    "categories",
    "payment_methods",
    "service_statuses",
    "service_classifications",
)


def upgrade() -> None:
    case = """
 CASE lower(btrim(color))
        WHEN 'slate' THEN 'dark_gray'
        WHEN 'zinc' THEN 'gray'
        WHEN 'neutral' THEN 'navy'
        WHEN 'stone' THEN 'brown'
        WHEN 'ruby' THEN 'magenta'
        ELSE color
    END
    """
    for table in _TABLES:
        op.execute(sa.text(f"UPDATE {table} SET color = {case}"))


def downgrade() -> None:
    rev = """
 CASE lower(btrim(color))
        WHEN 'dark_gray' THEN 'slate'
        WHEN 'navy' THEN 'neutral'
        WHEN 'brown' THEN 'stone'
        WHEN 'magenta' THEN 'ruby'
        ELSE color
    END
    """
    for table in _TABLES:
        op.execute(sa.text(f"UPDATE {table} SET color = {rev}"))
