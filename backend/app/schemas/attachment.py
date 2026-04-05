from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class AttachmentRead(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    original_filename: str
    content_type: str
    file_size: int
    uploaded_by_id: uuid.UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedAttachmentResponse(BaseModel):
    items: list[AttachmentRead]
    page: int
    per_page: int
    total_count: int
    total_pages: int
