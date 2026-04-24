"""Global user permission slugs (non-role)."""

from __future__ import annotations

# Financial aggregates: GET /api/dashboard/, /costs UI, cost records, yearly_cost
PERMISSION_FINANCIAL_VIEW = "financial_view"

# Hardware inventory: /api/laptops/*, hardware reference data, dashboard hardware widget
PERMISSION_HARDWARE_VIEW = "hardware_view"

ALLOWED_USER_PERMISSION_SLUGS: frozenset[str] = frozenset({
    PERMISSION_FINANCIAL_VIEW,
    PERMISSION_HARDWARE_VIEW,
})
