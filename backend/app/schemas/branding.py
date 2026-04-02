from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BrandingRead(BaseModel):
    logo_url: str | None
    logo_filename: str | None
    updated_at: datetime | None = None
