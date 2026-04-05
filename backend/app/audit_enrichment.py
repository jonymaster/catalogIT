"""Enrich audit `details` JSON with context (time, actor email, IP, entity label)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.user import User
from app.request_context import client_ip_ctx, request_id_ctx, user_agent_ctx


def _apply_request_context(out: dict[str, Any]) -> None:
    out.setdefault("recorded_at", datetime.now(timezone.utc).isoformat())
    rid = request_id_ctx.get()
    if rid:
        out.setdefault("request_id", rid)
    ip = client_ip_ctx.get()
    if ip:
        out.setdefault("client_ip", ip)
    ua = user_agent_ctx.get()
    if ua:
        out.setdefault("user_agent", ua[:500])


def entity_display_label(instance: Any) -> str | None:
    """Best-effort human label for an ORM instance (service name, user email, file name, etc.)."""
    if instance is None:
        return None
    for attr in (
        "name",
        "title",
        "email",
        "original_filename",
        "provider_name",
        "serial_number",
        "model_name",
        "contract_ref",
        "channel",
    ):
        v = getattr(instance, attr, None)
        if v is not None and str(v).strip():
            return str(v).strip()
    fn = getattr(instance, "first_name", None)
    ln = getattr(instance, "last_name", None)
    if fn or ln:
        parts = f"{fn or ''} {ln or ''}".strip()
        if parts:
            return parts
    return None


def finalize_details_sync(
    session: Session,
    details: dict[str, Any] | None,
    actor_user_id: uuid.UUID | None,
    instance: Any | None = None,
) -> dict[str, Any]:
    out = dict(details) if details else {}
    _apply_request_context(out)
    if actor_user_id:
        user = session.get(User, actor_user_id)
        if user and user.email:
            out["actor_email"] = user.email
    if instance is not None:
        label = entity_display_label(instance)
        if label:
            out.setdefault("entity_label", label)
    return out


async def finalize_details_async(
    db: AsyncSession,
    details: dict[str, Any] | None,
    actor_user_id: uuid.UUID | None,
    *,
    entity_label: str | None = None,
) -> dict[str, Any]:
    out = dict(details) if details else {}
    _apply_request_context(out)
    if actor_user_id:
        user = await db.get(User, actor_user_id)
        if user and user.email:
            out["actor_email"] = user.email
    if entity_label:
        out.setdefault("entity_label", entity_label)
    return out
