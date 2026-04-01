from __future__ import annotations

import uuid

from pydantic import BaseModel


class PaymentMethodCreate(BaseModel):
    name: str
    method_type: str = ""
    last_four: str | None = None
    notes: str | None = None


class PaymentMethodUpdate(BaseModel):
    name: str | None = None
    method_type: str | None = None
    last_four: str | None = None
    notes: str | None = None


class PaymentMethodRead(BaseModel):
    id: uuid.UUID
    name: str
    method_type: str
    last_four: str | None
    notes: str | None

    model_config = {"from_attributes": True}
