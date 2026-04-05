"""Request-scoped context (e.g. request id for audit correlation)."""

from __future__ import annotations

import contextvars

request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)
