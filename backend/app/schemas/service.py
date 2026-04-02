from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.category import CategoryRead
from app.schemas.login_method import LoginMethodRead
from app.schemas.service_status import ServiceStatusRead
from app.schemas.user import UserRead
from app.schemas.vendor import VendorRead


class ServiceLoginRead(BaseModel):
    id: uuid.UUID
    login_method_id: uuid.UUID
    is_primary: bool
    login_method: LoginMethodRead | None = None

    model_config = {"from_attributes": True}


class ServiceCreate(BaseModel):
    name: str
    status: str = "Contract"
    license_type: str = ""
    category: str = ""
    billing_schedule: str = ""
    yearly_cost: float | None = None
    sso_integrated: bool = False
    automated_provisioning: bool = False
    notes: str | None = None
    owner_ids: list[uuid.UUID] = []
    # New fields
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    service_status_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    classification: str | None = None
    service_type: str | None = None
    scim_enabled: bool | None = None
    scim_notes: str | None = None
    criticality: str | None = None
    nonprofit_pricing: bool = False


class ServiceUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    license_type: str | None = None
    category: str | None = None
    billing_schedule: str | None = None
    yearly_cost: float | None = None
    sso_integrated: bool | None = None
    automated_provisioning: bool | None = None
    notes: str | None = None
    owner_ids: list[uuid.UUID] | None = None
    # New fields
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    service_status_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    classification: str | None = None
    service_type: str | None = None
    scim_enabled: bool | None = None
    scim_notes: str | None = None
    criticality: str | None = None
    nonprofit_pricing: bool | None = None
    is_active: bool | None = None


class ServiceRead(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    license_type: str
    category: str
    billing_schedule: str
    yearly_cost: float | None
    sso_integrated: bool
    automated_provisioning: bool
    notes: str | None
    owners: list[UserRead]
    # New fields
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    payment_method_id: uuid.UUID | None = None
    service_status_id: uuid.UUID | None = None
    contract_id: uuid.UUID | None = None
    classification: str | None = None
    service_type: str | None = None
    scim_enabled: bool | None = None
    scim_notes: str | None = None
    criticality: str | None = None
    nonprofit_pricing: bool = False
    is_active: bool = True
    deprecated_at: datetime | None = None
    vendor: VendorRead | None = None
    category_rel: CategoryRead | None = None
    service_status: ServiceStatusRead | None = None
    logins: list[ServiceLoginRead] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
