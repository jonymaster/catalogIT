from __future__ import annotations

import uuid

from pydantic import BaseModel


class HardwareLocationCreate(BaseModel):
    name: str
    description: str | None = None


class HardwareLocationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class HardwareLocationRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}
