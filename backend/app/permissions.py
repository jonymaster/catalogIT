"""Global user permission slugs (non-role)."""

from __future__ import annotations

# Financial aggregates: GET /api/dashboard/, /costs UI
PERMISSION_FINANCIAL_VIEW = "financial_view"

ALLOWED_USER_PERMISSION_SLUGS: frozenset[str] = frozenset({PERMISSION_FINANCIAL_VIEW})
