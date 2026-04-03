from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel


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
    role: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    role: Literal["admin", "editor", "viewer"] | None = None
    is_active: bool | None = None
    display_name: str | None = None
    department: str | None = None
    locale: str | None = None
    timezone: str | None = None


class UserPreferencesRead(BaseModel):
    locale: str | None = None
    timezone: str | None = None

    model_config = {"from_attributes": True}


class UserPreferencesUpdate(BaseModel):
    locale: str | None = None
    timezone: str | None = None
