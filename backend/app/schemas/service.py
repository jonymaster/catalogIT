from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, field_validator

from app.schemas.category import CategoryRead
from app.schemas.cost_center import CostCenterRead
from app.schemas.payment_method import PaymentMethodRead
from app.schemas.service_classification import ServiceClassificationRead
from app.schemas.service_status import ServiceStatusRead
from app.schemas.user import UserRead
from app.schemas.vendor import VendorRead


class ServiceCreate(BaseModel):
    name: str
    status: str = "Contract"
    billing_schedule: str = ""
    renewal_date: date | None = None
    yearly_cost: float | None = None
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


class ServiceUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    billing_schedule: str | None = None
    renewal_date: date | None = None
    yearly_cost: float | None = None
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


class ServiceRead(BaseModel):
    id: uuid.UUID
    name: str
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
