from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.schemas.badge_preset_field import OptionalBadgePreset


class ServiceClassificationCreate(BaseModel):
    slug: str | None = None
    name: str
    description: str | None = None
    color: OptionalBadgePreset = None


class ServiceClassificationUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None
    color: OptionalBadgePreset = None


class ServiceClassificationRead(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None
    color: str

    model_config = {"from_attributes": True}
