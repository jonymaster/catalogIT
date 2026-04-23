"""Pure helpers for computing next renewal dates from a renewal config.

A renewal config is a dict with one of these shapes:
    {"type": "annual",  "month": 1-12, "day": 1-31}
    {"type": "monthly", "day": 1-31}

The day is clamped to the last day of the target month when it doesn't exist
there (e.g. day=31 in February becomes 28 or 29).
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any

RENEWAL_TYPE_ANNUAL = "annual"
RENEWAL_TYPE_MONTHLY = "monthly"


def clamp_day(year: int, month: int, day: int) -> int:
    last = monthrange(year, month)[1]
    return min(day, last)


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_config(config: Any) -> dict | None:
    """Validate a renewal config dict, returning a canonical copy or None."""
    if not isinstance(config, dict):
        return None
    kind = config.get("type")
    day = _coerce_int(config.get("day"))
    if day is None or not 1 <= day <= 31:
        return None
    if kind == RENEWAL_TYPE_MONTHLY:
        return {"type": RENEWAL_TYPE_MONTHLY, "day": day}
    if kind == RENEWAL_TYPE_ANNUAL:
        month = _coerce_int(config.get("month"))
        if month is None or not 1 <= month <= 12:
            return None
        return {"type": RENEWAL_TYPE_ANNUAL, "month": month, "day": day}
    return None


def _occurrence_in_month(year: int, month: int, day: int) -> date:
    return date(year, month, clamp_day(year, month, day))


def compute_next_renewal(config: Any, today: date) -> date | None:
    """Return the next renewal date on or after ``today`` for the given config.

    Returns None if the config is missing or invalid.
    """
    cfg = normalize_config(config)
    if cfg is None:
        return None

    if cfg["type"] == RENEWAL_TYPE_ANNUAL:
        month = cfg["month"]
        day = cfg["day"]
        candidate = _occurrence_in_month(today.year, month, day)
        if candidate < today:
            candidate = _occurrence_in_month(today.year + 1, month, day)
        return candidate

    # monthly
    day = cfg["day"]
    candidate = _occurrence_in_month(today.year, today.month, day)
    if candidate < today:
        year = today.year + (1 if today.month == 12 else 0)
        month = 1 if today.month == 12 else today.month + 1
        candidate = _occurrence_in_month(year, month, day)
    return candidate


def advance_renewal(config: Any, current_renewal: date) -> date | None:
    """Return the occurrence strictly after ``current_renewal``."""
    cfg = normalize_config(config)
    if cfg is None:
        return None

    if cfg["type"] == RENEWAL_TYPE_ANNUAL:
        return _occurrence_in_month(current_renewal.year + 1, cfg["month"], cfg["day"])

    # monthly: next calendar month after current_renewal
    year = current_renewal.year + (1 if current_renewal.month == 12 else 0)
    month = 1 if current_renewal.month == 12 else current_renewal.month + 1
    return _occurrence_in_month(year, month, cfg["day"])
