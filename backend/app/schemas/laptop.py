from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.hardware_location import HardwareLocationRead
from app.schemas.hardware_status import HardwareStatusRead
from app.schemas.user import UserRead


class LaptopCreate(BaseModel):
    serial_number: str
    model_name: str
    cpu: str = ""
    ram: str = ""
    storage_size: str = ""
    status: str = "In Stock"
    hardware_status_id: uuid.UUID | None = None
    hardware_location_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID | None = None
    notes: str | None = None

    @field_validator("serial_number", "model_name")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field cannot be blank")
        return cleaned


class LaptopUpdate(BaseModel):
    serial_number: str | None = None
    model_name: str | None = None
    cpu: str | None = None
    ram: str | None = None
    storage_size: str | None = None
    status: str | None = None
    hardware_status_id: uuid.UUID | None = None
    hardware_location_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID | None = None
    notes: str | None = None

    @field_validator("serial_number", "model_name")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field cannot be blank")
        return cleaned


class LaptopRead(BaseModel):
    id: uuid.UUID
    serial_number: str
    model_name: str
    cpu: str
    ram: str
    storage_size: str
    status: str
    hardware_status_id: uuid.UUID | None = None
    hardware_location_id: uuid.UUID | None = None
    hardware_status: HardwareStatusRead | None = None
    hardware_location: HardwareLocationRead | None = None
    assigned_to_id: uuid.UUID | None
    assigned_to: UserRead | None
    notes: str | None
    is_active: bool = True
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
