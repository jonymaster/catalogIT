"""Small helpers for HTTP client responses."""

from __future__ import annotations

import httpx


def status_is_success(status_code: int | None) -> bool:
    """True for 2xx. httpx normally sets status_code, but guard None for robustness."""
    return status_code is not None and 200 <= status_code < 300
