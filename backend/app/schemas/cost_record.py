from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class CostRecordCreate(BaseModel):
    service_id: uuid.UUID
    payment_method_id: uuid.UUID | None = None
    fiscal_year: int
    amount: float
    record_type: str
    notes: str | None = None


class CostRecordUpdate(BaseModel):
    payment_method_id: uuid.UUID | None = None
    fiscal_year: int | None = None
    amount: float | None = None
    record_type: str | None = None
    notes: str | None = None


class CostRecordRead(BaseModel):
    id: uuid.UUID
    service_id: uuid.UUID
    payment_method_id: uuid.UUID | None
    fiscal_year: int
    amount: float
    record_type: str
    notes: str | None
    recorded_at: datetime
    recorded_by_id: uuid.UUID | None

    model_config = {"from_attributes": True}
