from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TrustedTokenIssuerRead(BaseModel):
    provider_name: str
    issuer_url: str
    jwks_url: str
    audience: str
    email_claim: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TrustedTokenIssuerWrite(BaseModel):
    provider_name: str = ""
    issuer_url: str
    jwks_url: str = ""
    audience: str
    email_claim: str = "email"
    enabled: bool = True


class TrustedTokenIssuerTestResult(BaseModel):
    success: bool
    jwks_url: str = ""
    key_count: int = 0
    error: str = ""
