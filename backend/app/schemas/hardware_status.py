from __future__ import annotations

import uuid

from pydantic import BaseModel


class HardwareStatusCreate(BaseModel):
    name: str
    description: str | None = None


class HardwareStatusUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class HardwareStatusRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}
