from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_state_store: dict[str, bool] = {}


def _okta_base_url() -> str:
    settings = get_settings()
    return settings.OKTA_ISSUER.rstrip("/")


@router.get("/login")
async def login(request: Request):
    """Redirect the user to Okta's authorization endpoint."""
    settings = get_settings()
    state = secrets.token_urlsafe(32)
    _state_store[state] = True

    callback_url = str(request.url_for("callback"))
    params = {
        "client_id": settings.OKTA_CLIENT_ID,
        "response_type": "code",
        "scope": "openid profile email",
        "redirect_uri": callback_url,
        "state": state,
    }
    authorize_url = f"{_okta_base_url()}/v1/authorize"
    qs = "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(url=f"{authorize_url}?{qs}")


@router.get("/callback")
async def callback(
    code: str,
    state: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle the OIDC callback: exchange code for tokens, upsert user, return JWT."""
    if state not in _state_store:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    _state_store.pop(state, None)

    settings = get_settings()
    callback_url = str(request.url_for("callback"))
    token_url = f"{_okta_base_url()}/v1/token"

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            token_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": callback_url,
                "client_id": settings.OKTA_CLIENT_ID,
                "client_secret": settings.OKTA_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if token_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Token exchange failed")

    token_data = token_resp.json()
    id_token = token_data.get("id_token", "")

    # Decode the id_token without verification here -- in production you would
    # verify the signature against Okta's JWKS endpoint.
    claims = jwt.get_unverified_claims(id_token)

    okta_id = claims["sub"]
    email = claims.get("email", "")
    first_name = claims.get("given_name", "")
    last_name = claims.get("family_name", "")

    # Upsert user
    result = await db.execute(select(User).where(User.okta_id == okta_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            okta_id=okta_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )
        db.add(user)
        await db.flush()
    else:
        user.email = email
        user.first_name = first_name
        user.last_name = last_name
        await db.flush()

    # Mint local JWT
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(hours=settings.JWT_EXPIRY_HOURS),
    }
    access_token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    # Redirect to frontend with token as query param so the SPA can capture it
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    return RedirectResponse(url=f"{frontend_url}/auth/callback?token={access_token}")
