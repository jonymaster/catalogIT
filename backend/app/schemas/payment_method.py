from __future__ import annotations

import uuid

from pydantic import BaseModel

from app.schemas.badge_preset_field import OptionalBadgePreset


class PaymentMethodCreate(BaseModel):
    name: str
    method_type: str = ""
    last_four: str | None = None
    notes: str | None = None
    color: OptionalBadgePreset = None


class PaymentMethodUpdate(BaseModel):
    name: str | None = None
    method_type: str | None = None
    last_four: str | None = None
    notes: str | None = None
    color: OptionalBadgePreset = None


class PaymentMethodRead(BaseModel):
    id: uuid.UUID
    name: str
    method_type: str
    last_four: str | None
    notes: str | None
    color: str

    model_config = {"from_attributes": True}
