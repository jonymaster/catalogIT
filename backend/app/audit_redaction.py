"""Redact sensitive values from audit payloads (column names and nested dict keys)."""

from __future__ import annotations

import re
from typing import Any

_REDACT_KEYS = re.compile(
    r"(^|.*_)(password|secret|token|hash|encrypted|credentials)(_|$)",
    re.IGNORECASE,
)
_DENYLIST = frozenset(
    {
        "password_hash",
        "client_secret",
        "secrets_encrypted",
        "token_hash",
        "signing_secret",
        "bot_token",
        "access_token",
        "refresh_token",
        "id_token",
        "metadata_",  # integration_config JSON may hold tokens
    }
)


def _should_redact_key(key: str) -> bool:
    if key in _DENYLIST:
        return True
    if _REDACT_KEYS.search(key):
        return True
    return False


def redact_mapping(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if data is None:
        return None
    out: dict[str, Any] = {}
    for k, v in data.items():
        if _should_redact_key(k):
            out[k] = "[REDACTED]"
        elif isinstance(v, dict):
            nested = redact_mapping(v)
            out[k] = nested if nested is not None else {}
        elif isinstance(v, list) and v and isinstance(v[0], dict):
            out[k] = [redact_mapping(x) if isinstance(x, dict) else x for x in v]
        else:
            out[k] = v
    return out


def redact_serialized_row(row: dict[str, Any]) -> dict[str, Any]:
    """Redact a flat column->value map (ORM serialization)."""
    return redact_mapping(row) or {}
