"""Request and response models for /api/cost-records/close-year.

Amounts and uplift are parsed as Decimal and range-checked by the service module (400, not 422).
Responses carry Decimal internally and serialize them as JSON numbers.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, PlainSerializer

# Decimal on the server, JSON number on the wire.
JsonNumber = Annotated[Decimal, PlainSerializer(lambda v: float(v), return_type=float)]


def _utc_isoformat(value: datetime) -> str:
    # Naive values come from TIMESTAMP WITHOUT TIME ZONE columns, which hold UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


# ISO 8601 with an explicit +00:00 offset, so clients do not read the time as local.
UtcDateTime = Annotated[datetime, PlainSerializer(_utc_isoformat, return_type=str)]


class ClosePreviewRequest(BaseModel):
    fiscal_year: int
    uplift_pct: Decimal | None = None


class ConversionOverrideIn(BaseModel):
    record_id: uuid.UUID
    include: bool | None = None
    amount: Decimal | None = None


class NextYearOverrideIn(BaseModel):
    service_id: uuid.UUID
    include: bool | None = None
    amount: Decimal | None = None


class CloseExecuteRequest(BaseModel):
    fiscal_year: int
    plan_hash: str
    uplift_pct: Decimal | None = None
    conversions: list[ConversionOverrideIn] | None = None
    next_year: list[NextYearOverrideIn] | None = None


class CloseRevertRequest(BaseModel):
    batch_id: uuid.UUID


class ConversionRowRead(BaseModel):
    record_id: uuid.UUID
    amount: JsonNumber
    include: bool
    flags: list[str]
    notes: str | None
    payment_method_id: uuid.UUID | None


class NextYearRowRead(BaseModel):
    action: Literal["create", "skip"]
    amount: JsonNumber
    payment_method_id: uuid.UUID | None
    skip_reason: Literal["next_year_exists", "zero_amount"] | None
    flags: list[str]


class ServiceClosePlanRead(BaseModel):
    service_id: uuid.UUID
    service_name: str
    conversions: list[ConversionRowRead]
    existing_actual_total: JsonNumber
    # Distinct payment methods of the year's existing actuals (null: no payment method), null last.
    existing_actual_payment_method_ids: list[uuid.UUID | None]
    next_year: NextYearRowRead


class SkippedServiceRead(BaseModel):
    service_id: uuid.UUID
    service_name: str
    reason: Literal["archived"]


class CloseTotalsRead(BaseModel):
    converted: JsonNumber
    next_year: JsonNumber


class ClosePreviewResponse(BaseModel):
    fiscal_year: int
    next_fiscal_year: int
    uplift_pct: JsonNumber
    year_not_ended: bool
    plan_hash: str
    services: list[ServiceClosePlanRead]
    skipped: list[SkippedServiceRead]
    totals: CloseTotalsRead


class CloseExecuteResponse(BaseModel):
    batch_id: uuid.UUID
    converted_count: int
    created_count: int
    totals: CloseTotalsRead


class CloseRevertResponse(BaseModel):
    batch_id: uuid.UUID
    restored_count: int
    deleted_count: int


class CloseBatchRead(BaseModel):
    id: uuid.UUID
    fiscal_year: int
    uplift_pct: JsonNumber
    converted_count: int
    created_count: int
    converted_total: JsonNumber
    next_year_total: JsonNumber
    created_at: UtcDateTime
    created_by_id: uuid.UUID | None
    created_by_name: str | None
    reverted_at: UtcDateTime | None
    reverted_by_id: uuid.UUID | None
    reverted_by_name: str | None
    changed_since_close: int
