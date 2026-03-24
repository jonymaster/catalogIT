from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.user import UserRead


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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
