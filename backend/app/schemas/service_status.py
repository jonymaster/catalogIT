from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.schemas.badge_preset_field import OptionalBadgePreset


class ServiceStatusCreate(BaseModel):
    name: str
    description: str | None = None
    color: OptionalBadgePreset = None


class ServiceStatusUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: OptionalBadgePreset = None


class ServiceStatusRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    color: str

    model_config = {"from_attributes": True}
