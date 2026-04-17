from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.category import CategoryRead
from app.schemas.cost_center import CostCenterRead
from app.schemas.payment_method import PaymentMethodRead
from app.schemas.service_classification import ServiceClassificationRead
from app.schemas.service_status import ServiceStatusRead
from app.schemas.user import UserRead
from app.schemas.vendor import VendorRead

ALLOWED_BILLING_SCHEDULES = {"", "monthly", "annually", "na", "on_demand"}
ALLOWED_CRITICALITY_VALUES = {"Critical", "High", "Medium", "Low"}


def _normalize_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("name cannot be blank")
    return cleaned


def _normalize_optional_choice(
    value: str | None,
    *,
    label: str,
    allowed: set[str],
) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if cleaned not in allowed:
        raise ValueError(f"{label} must be one of: {', '.join(sorted(v or '(blank)' for v in allowed))}")
    return cleaned


class ServiceCreate(BaseModel):
    name: str
    description: str | None = Field(default=None, max_length=255)
    status: str = "Contract"
    billing_schedule: str = ""
    renewal_date: date | None = None
    sso_integrated: bool = False
    point_of_contact: str | None = None
    notes: str | None = None
    owner_ids: list[uuid.UUID] = []
    # New fields
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    cost_center_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    service_status_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    classification_id: uuid.UUID | None = None
    scim_enabled: bool | None = None
    criticality: str | None = None
    nonprofit_pricing: bool = False
    renewal_reminders_enabled: bool = True
    renewal_offsets_days: list[int] | None = None
    total_seats: int | None = None
    assignee_ids: list[uuid.UUID] = []

    @field_validator("total_seats")
    @classmethod
    def total_seats_positive(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("total_seats must be at least 1 when set")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        return _normalize_name(value)

    @field_validator("billing_schedule")
    @classmethod
    def validate_billing_schedule(cls, value: str) -> str:
        return _normalize_optional_choice(
            value,
            label="billing_schedule",
            allowed=ALLOWED_BILLING_SCHEDULES,
        ) or ""

    @field_validator("criticality")
    @classmethod
    def validate_criticality(cls, value: str | None) -> str | None:
        return _normalize_optional_choice(
            value,
            label="criticality",
            allowed=ALLOWED_CRITICALITY_VALUES,
        )

    @field_validator("renewal_offsets_days")
    @classmethod
    def validate_offsets(cls, value: list[int] | None) -> list[int] | None:
        if value is None:
            return value
        if any(offset <= 0 for offset in value):
            raise ValueError("renewal_offsets_days must contain only positive integers")
        if len(set(value)) != len(value):
            raise ValueError("renewal_offsets_days must not contain duplicates")
        return value


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = Field(default=None, max_length=255)
    status: str | None = None
    billing_schedule: str | None = None
    renewal_date: date | None = None
    sso_integrated: bool | None = None
    point_of_contact: str | None = None
    notes: str | None = None
    owner_ids: list[uuid.UUID] | None = None
    # New fields
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    cost_center_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    service_status_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    classification_id: uuid.UUID | None = None
    scim_enabled: bool | None = None
    criticality: str | None = None
    nonprofit_pricing: bool | None = None
    is_active: bool | None = None
    renewal_reminders_enabled: bool | None = None
    renewal_offsets_days: list[int] | None = None
    total_seats: int | None = None
    assignee_ids: list[uuid.UUID] | None = None

    @field_validator("total_seats")
    @classmethod
    def total_seats_positive(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("total_seats must be at least 1 when set")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _normalize_name(value)

    @field_validator("billing_schedule")
    @classmethod
    def validate_billing_schedule(cls, value: str | None) -> str | None:
        return _normalize_optional_choice(
            value,
            label="billing_schedule",
            allowed=ALLOWED_BILLING_SCHEDULES,
        )

    @field_validator("criticality")
    @classmethod
    def validate_criticality(cls, value: str | None) -> str | None:
        return _normalize_optional_choice(
            value,
            label="criticality",
            allowed=ALLOWED_CRITICALITY_VALUES,
        )

    @field_validator("renewal_offsets_days")
    @classmethod
    def validate_offsets(cls, value: list[int] | None) -> list[int] | None:
        return ServiceCreate.validate_offsets(value)


class ServiceRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    status: str
    billing_schedule: str
    renewal_date: date | None
    yearly_cost: float | None
    sso_integrated: bool
    point_of_contact: str | None
    notes: str | None
    owners: list[UserRead]
    assignees: list[UserRead]
    total_seats: int | None = None
    # New fields
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    cost_center_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    service_status_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    classification_id: uuid.UUID | None = None
    scim_enabled: bool | None = None
    criticality: str | None = None
    nonprofit_pricing: bool = False
    is_active: bool = True
    renewal_reminders_enabled: bool = True
    renewal_offsets_days: list[int] | None = None
    deprecated_at: datetime | None = None
    vendor: VendorRead | None = None
    category_rel: CategoryRead | None = None
    cost_center: CostCenterRead | None = None
    payment_method: PaymentMethodRead | None = None
    service_status: ServiceStatusRead | None = None
    service_classification: ServiceClassificationRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
