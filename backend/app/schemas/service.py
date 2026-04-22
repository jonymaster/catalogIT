from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.category import CategoryRead
from app.schemas.cost_center import CostCenterRead
from app.schemas.payment_method import PaymentMethodRead
from app.schemas.service_classification import ServiceClassificationRead
from app.schemas.service_status import ServiceStatusRead
from app.schemas.tag import TagRead
from app.schemas.user import UserRead
from app.schemas.vendor import VendorRead

MAX_TAGS_PER_SERVICE = 5


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
        # Deduplicate while preserving order.
        seen: set[uuid.UUID] = set()
        deduped: list[uuid.UUID] = []
        for tid in v:
            if tid not in seen:
                seen.add(tid)
                deduped.append(tid)
        return deduped


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
        seen: set[uuid.UUID] = set()
        deduped: list[uuid.UUID] = []
        for tid in v:
            if tid not in seen:
                seen.add(tid)
                deduped.append(tid)
        return deduped


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
    tags: list[TagRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
