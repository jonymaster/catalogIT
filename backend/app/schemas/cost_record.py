from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

ALLOWED_COST_RECORD_TYPES = {"actual", "estimated", "budget"}


class CostRecordCreate(BaseModel):
    payment_method_id: uuid.UUID | None = None
    fiscal_year: int = Field(ge=1900, le=2100)
    amount: float = Field(ge=0)
    record_type: str
    notes: str | None = None
    purchase_year: int | None = None

    @field_validator("purchase_year")
    @classmethod
    def validate_purchase_year(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 1900 or v > 2100:
            raise ValueError("purchase_year must be between 1900 and 2100")
        return v

    @field_validator("record_type")
    @classmethod
    def validate_record_type(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in ALLOWED_COST_RECORD_TYPES:
            raise ValueError("record_type must be actual, estimated, or budget")
        return cleaned


class CostRecordUpdate(BaseModel):
    payment_method_id: uuid.UUID | None = None
    fiscal_year: int | None = Field(default=None, ge=1900, le=2100)
    amount: float | None = Field(default=None, ge=0)
    record_type: str | None = None
    notes: str | None = None
    purchase_year: int | None = None

    @field_validator("purchase_year")
    @classmethod
    def validate_purchase_year(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 1900 or v > 2100:
            raise ValueError("purchase_year must be between 1900 and 2100")
        return v

    @field_validator("record_type")
    @classmethod
    def validate_record_type(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return CostRecordCreate.validate_record_type(value)


class CostRecordRead(BaseModel):
    id: uuid.UUID
    service_id: uuid.UUID | None = None
    laptop_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None
    payment_method_name: str | None = None
    fiscal_year: int
    purchase_year: int | None = None
    amount: float
    record_type: str
    notes: str | None
    recorded_at: datetime
    recorded_by_id: uuid.UUID | None
    recorded_by_name: str | None = None

    model_config = {"from_attributes": True}
