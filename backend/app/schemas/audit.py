from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.user import UserRead


class AuditLogRead(BaseModel):
    id: uuid.UUID
    table_name: str
    record_id: uuid.UUID
    action: str
    changed_by: UserRead | None
    timestamp: datetime
    old_values: dict[str, Any] | None
    new_values: dict[str, Any] | None

    model_config = {"from_attributes": True}
