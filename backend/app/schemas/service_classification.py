from __future__ import annotations

import uuid

from pydantic import BaseModel


class ServiceClassificationCreate(BaseModel):
    slug: str
    name: str
    description: str | None = None


class ServiceClassificationUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None


class ServiceClassificationRead(BaseModel):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None

    model_config = {"from_attributes": True}
