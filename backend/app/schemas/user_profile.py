from __future__ import annotations

import uuid

from pydantic import BaseModel, computed_field
from app.schemas.hardware import HardwareType

from app.schemas.user import UserRead


class UserServiceLinkRead(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    is_active: bool
    category_name: str | None = None


class UserHardwareAssetLinkRead(BaseModel):
    id: uuid.UUID
    model_name: str
    hardware_type: HardwareType = "laptop"
    quantity: int = 1
    serial_number: str | None
    status: str
    is_active: bool
    hardware_location_name: str | None = None


class UserProfileRead(BaseModel):
    user: UserRead
    owned_services: list[UserServiceLinkRead]
    assigned_services: list[UserServiceLinkRead]
    assigned_hardware_assets: list[UserHardwareAssetLinkRead]

    @computed_field(deprecated="Use assigned_hardware_assets")
    @property
    def assigned_laptops(self) -> list[UserHardwareAssetLinkRead]:
        return self.assigned_hardware_assets
