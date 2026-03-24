from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class OidcConfigRead(BaseModel):
    provider_name: str
    issuer_url: str
    client_id: str
    scopes: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OidcConfigWrite(BaseModel):
    provider_name: str
    issuer_url: str
    client_id: str
    client_secret: str
    scopes: str = "openid profile email"
    enabled: bool = True


class OidcTestResult(BaseModel):
    success: bool
    issuer: str = ""
    authorization_endpoint: str = ""
    token_endpoint: str = ""
    error: str = ""
