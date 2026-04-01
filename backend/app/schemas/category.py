from __future__ import annotations

import uuid

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CategoryRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}
