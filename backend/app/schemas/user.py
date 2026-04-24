from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.user import User as UserOrm
from app.permissions import ALLOWED_USER_PERMISSION_SLUGS


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
    permissions: list[str] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class UserDirectoryPage(BaseModel):
    """Paginated user list for directory pickers (e.g. service assignments)."""

    items: list[UserRead]
    total: int
    page: int
    per_page: int
    total_pages: int


class UserCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    display_name: str | None = Field(None, max_length=255)
    department: str | None = Field(None, max_length=100)
    role: Literal["admin", "editor", "viewer"] = "viewer"
    password: str = Field(..., min_length=8, max_length=256)
    must_reset_password: bool = False
    permissions: list[str] | None = None

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        unknown = [p for p in v if p not in ALLOWED_USER_PERMISSION_SLUGS]
        if unknown:
            raise ValueError(f"Unknown permission slugs: {unknown}")
        return list(dict.fromkeys(v))


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
    permissions: list[str] | None = None

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        unknown = [p for p in v if p not in ALLOWED_USER_PERMISSION_SLUGS]
        if unknown:
            raise ValueError(f"Unknown permission slugs: {unknown}")
        return list(dict.fromkeys(v))


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
    ui_preferences: dict[str, Any] = Field(default_factory=dict)
    receive_renewal_notifications: bool = True

    model_config = {"from_attributes": True}

    @field_validator("ui_preferences", mode="before")
    @classmethod
    def default_ui_preferences(cls, value: Any) -> dict[str, Any]:
        return value if isinstance(value, dict) else {}


class UserPreferencesUpdate(BaseModel):
    locale: str | None = None
    timezone: str | None = None
    theme: Literal["light", "dark"] | None = None
    ui_preferences: dict[str, Any] | None = None
    receive_renewal_notifications: bool | None = None


def user_read_from_orm(user: UserOrm) -> UserRead:
    """Build UserRead including permission slugs from loaded ``permission_rows``."""
    perms = [r.permission for r in user.permission_rows]
    return UserRead.model_validate(user).model_copy(update={"permissions": perms})
