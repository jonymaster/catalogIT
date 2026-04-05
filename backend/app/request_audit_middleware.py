"""Request id propagation and persistence of unhandled errors to global audit."""

from __future__ import annotations

import hashlib
import logging
import uuid

from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.global_audit import record_global_audit_event_committed
from app.request_context import request_id_ctx

logger = logging.getLogger(__name__)


class RequestAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = rid
        token = request_id_ctx.set(rid)
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
                    },
                    request_id=rid,
                )
            except Exception:
                logger.warning("Failed to persist error audit event")
            raise
        finally:
            request_id_ctx.reset(token)
