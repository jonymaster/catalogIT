from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal

from app.enums.operating_system import OperatingSystem
from app.schemas.hardware_location import HardwareLocationRead
from app.schemas.hardware_status import HardwareStatusRead
from app.schemas.user import UserRead


HardwareType = Literal["laptop", "phone", "tablet", "accessory", "peripheral"]

OS_BY_TYPE = {
    "laptop": {"macos", "linux", "windows"},
    "phone": {"android", "ios"},
    "tablet": {"android", "ipados", "windows", "linux"},
    "accessory": set(),
    "peripheral": set(),
}


class HardwareAssetCreate(BaseModel):
    hardware_type: HardwareType = "laptop"
    quantity: int = Field(default=1, ge=1, le=2147483647, strict=True)
    os_version: str | None = Field(default=None, max_length=100)
    imei: str | None = Field(default=None, pattern=r"^[0-9]{15}$")
    imei2: str | None = Field(default=None, pattern=r"^[0-9]{15}$")
    phone_number: str | None = Field(default=None, max_length=50)
    serial_number: str | None = Field(default=None, max_length=255)
    model_name: str = Field(max_length=255)
    cpu: str = ""
    ram: str = ""
    storage_size: str = ""
    operating_system: OperatingSystem | None = None
    status: str = "In Stock"
    hardware_status_id: uuid.UUID | None = None
    hardware_location_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID | None = None
    notes: str | None = None
    mdm_connected: bool = False

    @field_validator("model_name")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field cannot be blank")
        return cleaned

    @field_validator("serial_number", "os_version", "imei", "imei2", "phone_number", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        return (value.strip() or None) if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_category_fields(self):
        if self.hardware_type not in ("accessory", "peripheral") and not self.serial_number:
            raise ValueError("Serial number is required for laptops, phones, and tablets")
        if self.hardware_type != "accessory" and self.quantity != 1:
            raise ValueError("Only accessories can have a quantity greater than one")
        if self.operating_system and self.operating_system not in OS_BY_TYPE[self.hardware_type]:
            raise ValueError("Operating system is not supported for this hardware type")
        if self.hardware_type not in ("phone", "tablet") and any((self.imei, self.imei2, self.phone_number)):
            raise ValueError("Cellular identifiers are only supported for phones and tablets")
        if self.hardware_type in ("accessory", "peripheral") and any((self.cpu, self.ram, self.storage_size, self.os_version, self.mdm_connected)):
            raise ValueError("Accessories and peripherals do not support device specifications or MDM")
        return self


class HardwareAssetUpdate(BaseModel):
    hardware_type: HardwareType | None = None
    quantity: int | None = Field(default=None, ge=1, le=2147483647, strict=True)
    os_version: str | None = Field(default=None, max_length=100)
    imei: str | None = Field(default=None, pattern=r"^[0-9]{15}$")
    imei2: str | None = Field(default=None, pattern=r"^[0-9]{15}$")
    phone_number: str | None = Field(default=None, max_length=50)

    _normalize_optional = field_validator("serial_number", "os_version", "imei", "imei2", "phone_number", mode="before")(HardwareAssetCreate.normalize_optional_text.__func__)

    @field_validator("hardware_type", "quantity", "cpu", "ram", "storage_size", "mdm_connected", "status")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("field cannot be null")
        return value

    serial_number: str | None = Field(default=None, max_length=255)
    model_name: str | None = Field(default=None, max_length=255)
    cpu: str | None = None
    ram: str | None = None
    storage_size: str | None = None
    operating_system: OperatingSystem | None = None
    status: str | None = None
    hardware_status_id: uuid.UUID | None = None
    hardware_location_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID | None = None
    notes: str | None = None
    mdm_connected: bool | None = None

    @field_validator("model_name")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("field cannot be null")
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field cannot be blank")
        return cleaned


class HardwareAssetRead(BaseModel):
    hardware_type: HardwareType = "laptop"
    quantity: int = 1
    os_version: str | None = None
    imei: str | None = None
    imei2: str | None = None
    phone_number: str | None = None
    id: uuid.UUID
    serial_number: str | None = Field(default=None, max_length=255)
    model_name: str = Field(max_length=255)
    cpu: str
    ram: str
    storage_size: str
    operating_system: OperatingSystem | None = None
    status: str
    hardware_status_id: uuid.UUID | None = None
    hardware_location_id: uuid.UUID | None = None
    hardware_status: HardwareStatusRead | None = None
    hardware_location: HardwareLocationRead | None = None
    assigned_to_id: uuid.UUID | None
    assigned_to: UserRead | None
    notes: str | None
    mdm_connected: bool
    is_active: bool = True
    archived_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
