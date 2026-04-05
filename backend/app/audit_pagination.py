"""Cursor encoding for keyset pagination (occurred_at DESC, id DESC)."""

from __future__ import annotations

import base64
import binascii
import json
import uuid
from datetime import datetime, timezone


def encode_cursor(occurred_at: datetime, row_id: uuid.UUID) -> str:
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
    payload = {"t": occurred_at.isoformat(), "i": str(row_id)}
    raw = json.dumps(payload, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    pad = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(cursor + pad)
        data = json.loads(raw.decode())
        t = datetime.fromisoformat(data["t"])
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t, uuid.UUID(data["i"])
    except (json.JSONDecodeError, KeyError, ValueError, binascii.Error) as exc:
        raise ValueError("Invalid cursor") from exc
