from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


ReferenceFieldType = Literal["text", "textarea", "url", "badge_preset"]


class ReferenceDataFieldRead(BaseModel):
    key: str
    label: str
    input_type: ReferenceFieldType
    required: bool = False
    show_in_list: bool = True
    placeholder: str | None = None
    help_text: str | None = None


class ReferenceDataResourceRead(BaseModel):
    key: str
    label: str
    plural_label: str
    description: str
    api_path: str
    settings_path: str
    search_fields: list[str]
    fields: list[ReferenceDataFieldRead]
