from __future__ import annotations

import uuid

from pydantic import BaseModel


class CostCenterCreate(BaseModel):
    name: str
    description: str | None = None


class CostCenterUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CostCenterRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}
