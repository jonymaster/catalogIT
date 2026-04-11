from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class Role(str, Enum):
    admin = "admin"
    editor = "editor"
    viewer = "viewer"


class UserRead(BaseModel):
    id: uuid.UUID
    external_id: str
    email: str
    first_name: str
    last_name: str
    display_name: str | None = None
    department: str | None = None
    locale: str | None = None
    timezone: str | None = None
    is_active: bool
    receive_renewal_notifications: bool = True
    role: str
    provisioning_source: Literal["local", "scim", "oidc"]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    display_name: str | None = Field(None, max_length=255)
    department: str | None = Field(None, max_length=100)
    role: Literal["admin", "editor", "viewer"] = "viewer"
    password: str = Field(..., min_length=8, max_length=256)
    must_reset_password: bool = False


class UserUpdate(BaseModel):
    role: Literal["admin", "editor", "viewer"] | None = None
    is_active: bool | None = None
    receive_renewal_notifications: bool | None = None
    display_name: str | None = None
    department: str | None = None
    locale: str | None = None
    timezone: str | None = None
    email: str | None = Field(None, max_length=255)
    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, min_length=1, max_length=255)


class MeProfileUpdate(BaseModel):
    email: str | None = Field(None, max_length=255)
    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, min_length=1, max_length=255)
    display_name: str | None = Field(None, max_length=255)
    department: str | None = Field(None, max_length=100)


class AdminSetPasswordBody(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=256)
    must_reset_password: bool = False


class UserPreferencesRead(BaseModel):
    locale: str | None = None
    timezone: str | None = None
    theme: Literal["light", "dark"] = "light"

    model_config = {"from_attributes": True}


class UserPreferencesUpdate(BaseModel):
    locale: str | None = None
    timezone: str | None = None
    theme: Literal["light", "dark"] | None = None
