from __future__ import annotations

from typing import Annotated, Any

from pydantic import BeforeValidator

from app.reference_data_colors import normalize_badge_preset


def _optional_badge_preset(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return normalize_badge_preset(str(v).strip())


OptionalBadgePreset = Annotated[str | None, BeforeValidator(_optional_badge_preset)]
