from __future__ import annotations

import uuid

from pydantic import BaseModel


class ServiceStatusCreate(BaseModel):
    name: str
    description: str | None = None


class ServiceStatusUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ServiceStatusRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}
