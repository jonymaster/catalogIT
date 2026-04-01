from __future__ import annotations

import uuid

from pydantic import BaseModel


class LoginMethodCreate(BaseModel):
    name: str
    description: str | None = None


class LoginMethodUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class LoginMethodRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None

    model_config = {"from_attributes": True}
