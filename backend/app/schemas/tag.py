from __future__ import annotations

import uuid

from pydantic import BaseModel, field_validator

from app.schemas.badge_preset_field import OptionalBadgePreset

MAX_TAG_NAME_LENGTH = 50


def _validate_tag_name(raw: str | None) -> str | None:
    if raw is None:
        return None
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError("Tag name cannot be blank")
    if len(cleaned) > MAX_TAG_NAME_LENGTH:
        raise ValueError(f"Tag name must be {MAX_TAG_NAME_LENGTH} characters or fewer")
    if "," in cleaned:
        raise ValueError("Tag name cannot contain commas")
    return cleaned


class TagCreate(BaseModel):
    name: str
    color: OptionalBadgePreset = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        result = _validate_tag_name(v)
        assert result is not None  # name is required
        return result


class TagUpdate(BaseModel):
    name: str | None = None
    color: OptionalBadgePreset = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str | None) -> str | None:
        return _validate_tag_name(v)


class TagRead(BaseModel):
    id: uuid.UUID
    name: str
    color: str

    model_config = {"from_attributes": True}
