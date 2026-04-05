from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.global_audit_event import GlobalAuditEvent
from app.schemas.user import UserRead


class AuditLogRead(BaseModel):
    """Per-record history row (compatible with existing service/laptop timeline UI)."""

    id: uuid.UUID
    table_name: str
    record_id: uuid.UUID
    action: str
    changed_by: UserRead | None
    timestamp: datetime
    old_values: dict[str, Any] | None
    new_values: dict[str, Any] | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_global_event(cls, e: GlobalAuditEvent, record_id: uuid.UUID) -> AuditLogRead:
        d = e.details or {}
        return cls(
            id=e.id,
            table_name=e.entity_table or "",
            record_id=record_id,
            action=str(d.get("action", e.event_type)),
            changed_by=UserRead.model_validate(e.actor) if e.actor else None,
            timestamp=e.occurred_at,
            old_values=d.get("old_values"),
            new_values=d.get("new_values"),
        )


class GlobalAuditEventRead(BaseModel):
    id: uuid.UUID
    category: str
    event_type: str
    entity_table: str | None
    entity_key: str | None
    actor: UserRead | None
    occurred_at: datetime
    summary: str | None
    details: dict[str, Any] | None
    request_id: str | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_event(cls, e: GlobalAuditEvent) -> GlobalAuditEventRead:
        return cls(
            id=e.id,
            category=e.category,
            event_type=e.event_type,
            entity_table=e.entity_table,
            entity_key=e.entity_key,
            actor=UserRead.model_validate(e.actor) if e.actor else None,
            occurred_at=e.occurred_at,
            summary=e.summary,
            details=e.details,
            request_id=e.request_id,
        )


class PaginatedGlobalAuditResponse(BaseModel):
    items: list[GlobalAuditEventRead]
    page: int
    per_page: int
    total_count: int
    total_pages: int


class PaginatedHistoryResponse(BaseModel):
    items: list[AuditLogRead]
    page: int
    per_page: int
    total_count: int
    total_pages: int
