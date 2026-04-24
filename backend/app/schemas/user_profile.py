from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.schemas.user import UserRead


class UserServiceLinkRead(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    is_active: bool
    category_name: str | None = None


class UserLaptopLinkRead(BaseModel):
    id: uuid.UUID
    model_name: str
    serial_number: str
    status: str
    is_active: bool
    hardware_location_name: str | None = None


class UserProfileRead(BaseModel):
    user: UserRead
    owned_services: list[UserServiceLinkRead]
    assigned_services: list[UserServiceLinkRead]
    assigned_laptops: list[UserLaptopLinkRead]
