from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AdminExportJobCreate(BaseModel):
    include_attachments: bool = False


class AdminExportJobRead(BaseModel):
    id: uuid.UUID
    status: str
    include_attachments: bool
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}
