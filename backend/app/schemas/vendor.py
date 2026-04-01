from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class VendorCreate(BaseModel):
    name: str
    website: str | None = None
    notes: str | None = None


class VendorUpdate(BaseModel):
    name: str | None = None
    website: str | None = None
    notes: str | None = None


class VendorRead(BaseModel):
    id: uuid.UUID
    name: str
    website: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
