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

MAX_TAGS_PER_SERVICE = 5


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


def _dedupe_uuids(v: list[uuid.UUID]) -> list[uuid.UUID]:
    seen: set[uuid.UUID] = set()
    out: list[uuid.UUID] = []
    for x in v:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


class ServiceCreate(BaseModel):
    name: str
    description: str | None = Field(default=None, max_length=255)
    status: str = "Contract"
    renewal_config: RenewalConfig | None = None
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
    tag_ids: list[uuid.UUID] = []

    @field_validator("total_seats")
    @classmethod
    def total_seats_positive(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("total_seats must be at least 1 when set")
        return v

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
    tag_ids: list[uuid.UUID] | None = None

    @field_validator("total_seats")
    @classmethod
    def total_seats_positive(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("total_seats must be at least 1 when set")
        return v

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
    yearly_cost: float | None
    sso_integrated: bool
    point_of_contact: str | None
    notes: str | None
    owners: list[UserRead]
    assignees: list[UserRead]
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
