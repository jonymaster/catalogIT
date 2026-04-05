"""Request id / client IP propagation and persistence of unhandled errors to global audit."""

from __future__ import annotations

import hashlib
import logging
import uuid

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.global_audit import record_global_audit_event_committed
from app.request_context import client_ip_ctx, request_id_ctx, user_agent_ctx

logger = logging.getLogger(__name__)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    if request.client:
        return request.client.host
    return None


class RequestAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = rid
        cip = _client_ip(request)
        ua = (request.headers.get("user-agent") or "").strip() or None
        token_rid = request_id_ctx.set(rid)
        token_ip = client_ip_ctx.set(cip)
        token_ua = user_agent_ctx.set(ua)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = rid
            return response
        except Exception as exc:
            if isinstance(exc, RequestValidationError):
                raise
            if isinstance(exc, HTTPException):
                raise
            logger.exception("Unhandled exception", extra={"request_id": rid})
            fp = hashlib.sha256(f"{type(exc).__name__}:{exc!s}".encode()).hexdigest()[:16]
            try:
                await record_global_audit_event_committed(
                    category="error",
                    event_type="unhandled_exception",
                    summary=type(exc).__name__,
                    details={
                        "fingerprint": fp,
                        "message": str(exc)[:500],
                        "exception_type": type(exc).__name__,
                    },
                    request_id=rid,
                )
            except Exception:
                logger.warning("Failed to persist error audit event")
            raise
        finally:
            request_id_ctx.reset(token_rid)
            client_ip_ctx.reset(token_ip)
            user_agent_ctx.reset(token_ua)
