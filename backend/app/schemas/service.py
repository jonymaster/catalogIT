from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.category import CategoryRead
from app.schemas.cost_center import CostCenterRead
from app.schemas.payment_method import PaymentMethodRead
from app.schemas.service_classification import ServiceClassificationRead
from app.schemas.service_status import ServiceStatusRead
from app.schemas.tag import TagRead
from app.schemas.user import UserRead
from app.schemas.vendor import VendorRead

ALLOWED_CRITICALITY_VALUES = {"Critical", "High", "Medium", "Low"}
MAX_TAGS_PER_SERVICE = 5


def _format_allowed_choices(allowed: set[str]) -> str:
    return ", ".join(sorted(value for value in allowed if value))


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
        raise ValueError(f"{label} must be one of: {_format_allowed_choices(allowed)}")
    return cleaned


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _dedupe_uuids(v: list[uuid.UUID]) -> list[uuid.UUID]:
    seen: set[uuid.UUID] = set()
    out: list[uuid.UUID] = []
    for x in v:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


class RelatedServiceRead(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    is_active: bool


class RenewalConfig(BaseModel):
    type: Literal["annual", "monthly"]
    day: int = Field(ge=1, le=31)
    month: int | None = Field(default=None, ge=1, le=12)

    @model_validator(mode="after")
    def _month_required_for_annual(self) -> "RenewalConfig":
        if self.type == "annual" and self.month is None:
            raise ValueError("month is required when type is 'annual'")
        if self.type == "monthly" and self.month is not None:
            # Coerce away: monthly configs don't carry a month.
            self.month = None
        return self


class ServiceCreate(BaseModel):
    name: str
    description: str | None = Field(default=None, max_length=255)
    status: str = "Contract"
    renewal_config: RenewalConfig | None = None
    renewal_date: date | None = None
    environment: str | None = Field(default=None, max_length=100)
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
    notification_recipient_ids: list[uuid.UUID] = []
    total_seats: int | None = None
    assignee_ids: list[uuid.UUID] = []
    related_service_ids: list[uuid.UUID] = []
    tag_ids: list[uuid.UUID] = []

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

    @field_validator("environment")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

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

    @field_validator("tag_ids")
    @classmethod
    def tag_ids_within_limit(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(v) > MAX_TAGS_PER_SERVICE:
            raise ValueError(
                f"A service can have at most {MAX_TAGS_PER_SERVICE} tags"
            )
        return _dedupe_uuids(v)

    @field_validator("notification_recipient_ids")
    @classmethod
    def dedupe_recipient_ids(cls, v: list[uuid.UUID]) -> list[uuid.UUID]:
        return _dedupe_uuids(v)


class ServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = Field(default=None, max_length=255)
    status: str | None = None
    renewal_config: RenewalConfig | None = None
    renewal_date: date | None = None
    environment: str | None = Field(default=None, max_length=100)
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
    notification_recipient_ids: list[uuid.UUID] | None = None
    total_seats: int | None = None
    assignee_ids: list[uuid.UUID] | None = None
    related_service_ids: list[uuid.UUID] | None = None
    tag_ids: list[uuid.UUID] | None = None

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

    @field_validator("environment")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

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

    @field_validator("tag_ids")
    @classmethod
    def tag_ids_within_limit(
        cls, v: list[uuid.UUID] | None
    ) -> list[uuid.UUID] | None:
        if v is None:
            return None
        if len(v) > MAX_TAGS_PER_SERVICE:
            raise ValueError(
                f"A service can have at most {MAX_TAGS_PER_SERVICE} tags"
            )
        return _dedupe_uuids(v)

    @field_validator("notification_recipient_ids")
    @classmethod
    def dedupe_recipient_ids(
        cls, v: list[uuid.UUID] | None
    ) -> list[uuid.UUID] | None:
        return None if v is None else _dedupe_uuids(v)


class ServiceRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    status: str
    renewal_config: RenewalConfig | None = None
    renewal_date: date | None
    environment: str | None = None
    yearly_cost: float | None
    sso_integrated: bool
    point_of_contact: str | None
    notes: str | None
    owners: list[UserRead]
    assignees: list[UserRead]
    related_services: list[RelatedServiceRead] = Field(default_factory=list)
    notification_recipients: list[UserRead] = []
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
    tags: list[TagRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
