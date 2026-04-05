"""Request-scoped context (e.g. request id and client IP for audit correlation)."""

from __future__ import annotations

import contextvars

request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)

client_ip_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "client_ip", default=None
)

user_agent_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "user_agent", default=None
)
