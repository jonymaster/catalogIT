from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserRead


class LaptopCreate(BaseModel):
    serial_number: str
    model_name: str
    cpu: str = ""
    ram: str = ""
    storage_size: str = ""
    status: str = "In Stock"
    assigned_to_id: uuid.UUID | None = None
    notes: str | None = None


class LaptopUpdate(BaseModel):
    serial_number: str | None = None
    model_name: str | None = None
    cpu: str | None = None
    ram: str | None = None
    storage_size: str | None = None
    status: str | None = None
    assigned_to_id: uuid.UUID | None = None
    notes: str | None = None


class LaptopRead(BaseModel):
    id: uuid.UUID
    serial_number: str
    model_name: str
    cpu: str
    ram: str
    storage_size: str
    status: str
    assigned_to_id: uuid.UUID | None
    assigned_to: UserRead | None
    notes: str | None
    is_active: bool = True
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
