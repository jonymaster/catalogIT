from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.models.oidc_config import OidcConfig
from app.models.user import User
from app.schemas.oidc import OidcConfigRead, OidcConfigWrite, OidcTestResult

router = APIRouter(prefix="/api/settings", tags=["settings"])

_admin = require_role("admin")


@router.get("/oidc", response_model=OidcConfigRead | None)
async def get_oidc_config(
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    config = await db.get(OidcConfig, 1)
    return config


@router.put("/oidc", response_model=OidcConfigRead)
async def save_oidc_config(
    body: OidcConfigWrite,
    _user: User = Depends(_admin),
    db: AsyncSession = Depends(get_audited_db),
):
    config = await db.get(OidcConfig, 1)
    if config is None:
        config = OidcConfig(id=1)
        db.add(config)

    config.provider_name = body.provider_name
    config.issuer_url = body.issuer_url
    config.client_id = body.client_id
    config.client_secret = body.client_secret
    config.scopes = body.scopes
    config.enabled = body.enabled

    await db.flush()
    await db.refresh(config)
    return config


@router.post("/oidc/test", response_model=OidcTestResult)
async def test_oidc_config(
    body: OidcConfigWrite,
    _user: User = Depends(_admin),
):
    """Fetch the OIDC discovery document to verify the configuration is reachable."""
    url = body.issuer_url.rstrip("/") + "/.well-known/openid-configuration"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return OidcTestResult(success=False, error=f"HTTP {resp.status_code} from discovery endpoint")
        data = resp.json()
        return OidcTestResult(
            success=True,
            issuer=data.get("issuer", ""),
            authorization_endpoint=data.get("authorization_endpoint", ""),
            token_endpoint=data.get("token_endpoint", ""),
        )
    except httpx.HTTPError as exc:
        return OidcTestResult(success=False, error=str(exc))
