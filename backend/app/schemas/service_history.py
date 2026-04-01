from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ServiceHistoryCreate(BaseModel):
    service_id: uuid.UUID
    action_date: str
    action_type: str
    description: str | None = None


class ServiceHistoryRead(BaseModel):
    id: uuid.UUID
    service_id: uuid.UUID
    action_date: str
    action_type: str
    description: str | None
    changed_by_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}
