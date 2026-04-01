from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.vendor import VendorRead


class ContractCreate(BaseModel):
    vendor_id: uuid.UUID
    contract_ref: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    auto_renew: bool = False
    total_value: float | None = None
    terms_notes: str | None = None


class ContractUpdate(BaseModel):
    vendor_id: uuid.UUID | None = None
    contract_ref: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    auto_renew: bool | None = None
    total_value: float | None = None
    terms_notes: str | None = None


class ContractRead(BaseModel):
    id: uuid.UUID
    vendor_id: uuid.UUID
    contract_ref: str | None
    start_date: date | None
    end_date: date | None
    auto_renew: bool
    total_value: float | None
    terms_notes: str | None
    vendor: VendorRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
