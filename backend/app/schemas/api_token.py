from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ApiTokenCreate(BaseModel):
    name: str
    expires_at: datetime | None = None


class ApiTokenRead(BaseModel):
    id: uuid.UUID
    name: str
    token_prefix: str
    created_by_id: uuid.UUID
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None
    is_revoked: bool

    model_config = {"from_attributes": True}


class ApiTokenCreated(ApiTokenRead):
    """Returned only once at creation time -- includes the raw token."""
    raw_token: str
