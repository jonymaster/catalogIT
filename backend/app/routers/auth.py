from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import bcrypt
import httpx

logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.oidc_config import OidcConfig
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, ResetPasswordRequest

router = APIRouter(prefix="/auth", tags=["auth"])

_state_store: dict[str, bool] = {}


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _mint_jwt(user: User) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(hours=settings.JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


async def _get_oidc_config(db: AsyncSession) -> OidcConfig | None:
    return await db.get(OidcConfig, 1)


async def _discover_oidc(issuer_url: str) -> dict:
    """Fetch the OIDC provider's .well-known/openid-configuration."""
    url = issuer_url.rstrip("/") + "/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch OIDC discovery document")
    return resp.json()


# ── Provider discovery ────────────────────────────────────────────

@router.get("/providers")
async def providers(db: AsyncSession = Depends(get_db)):
    """Return which login methods are available so the SPA can adapt its UI."""
    oidc = await _get_oidc_config(db)
    oidc_info = None
    if oidc and oidc.enabled and oidc.client_id:
        oidc_info = {"enabled": True, "provider_name": oidc.provider_name}
    return {
        "local": True,
        "oidc": oidc_info,
    }


# ── Local password login ─────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disabled")

    return LoginResponse(
        access_token=_mint_jwt(user),
        must_reset_password=user.must_reset_password,
    )


# ── Password reset ───────────────────────────────────────────────

@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    body: ResetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.password_hash:
        raise HTTPException(status_code=400, detail="Account uses OIDC login only")

    if not _verify_password(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = await db.get(User, current_user.id)
    user.password_hash = _hash_password(body.new_password)
    user.must_reset_password = False
    await db.flush()


# ── Generic OIDC ─────────────────────────────────────────────────

def _oidc_callback_url() -> str:
    settings = get_settings()
    return settings.FRONTEND_URL.rstrip("/") + "/auth/oidc/callback"


@router.get("/oidc/login")
async def oidc_login(db: AsyncSession = Depends(get_db)):
    """Redirect the user to the configured OIDC provider's authorization endpoint."""
    oidc = await _get_oidc_config(db)
    if not oidc or not oidc.enabled:
        raise HTTPException(status_code=404, detail="OIDC not configured")

    discovery = await _discover_oidc(oidc.issuer_url)
    authorize_url = discovery["authorization_endpoint"]

    state = secrets.token_urlsafe(32)
    _state_store[state] = True

    params = {
        "client_id": oidc.client_id,
        "response_type": "code",
        "scope": oidc.scopes,
        "redirect_uri": _oidc_callback_url(),
        "state": state,
    }
    return RedirectResponse(url=f"{authorize_url}?{urlencode(params)}")


@router.get("/oidc/callback")
async def oidc_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
):
    """Handle the OIDC callback: exchange code for tokens, upsert user, return JWT."""
    if state not in _state_store:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    _state_store.pop(state, None)

    oidc = await _get_oidc_config(db)
    if not oidc or not oidc.enabled:
        raise HTTPException(status_code=400, detail="OIDC not configured")

    discovery = await _discover_oidc(oidc.issuer_url)
    token_url = discovery["token_endpoint"]

    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            token_url,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": _oidc_callback_url(),
            },
            auth=(oidc.client_id, oidc.client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if token_resp.status_code != 200:
        logger.error("OIDC token exchange failed: %s %s", token_resp.status_code, token_resp.text)
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {token_resp.text}")

    token_data = token_resp.json()
    id_token = token_data.get("id_token", "")
    access_token = token_data.get("access_token", "")

    claims = jwt.get_unverified_claims(id_token)

    userinfo_endpoint = discovery.get("userinfo_endpoint")
    if userinfo_endpoint and access_token:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                ui_resp = await client.get(
                    userinfo_endpoint,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            if ui_resp.status_code == 200:
                claims = {**claims, **ui_resp.json()}
        except httpx.HTTPError:
            logger.warning("Failed to fetch userinfo, falling back to id_token claims")

    external_id = claims["sub"]
    email = claims.get("email", "")
    first_name = claims.get("given_name", "")
    last_name = claims.get("family_name", "")

    if not first_name and not last_name and claims.get("name"):
        parts = claims["name"].split(None, 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ""

    result = await db.execute(select(User).where(User.external_id == external_id))
    user = result.scalar_one_or_none()

    if user is None and email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    if user is None:
        user = User(
            external_id=external_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
        )
        db.add(user)
    else:
        user.external_id = external_id
        if email:
            user.email = email
        if first_name:
            user.first_name = first_name
        if last_name:
            user.last_name = last_name

    await db.flush()

    settings = get_settings()
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    return RedirectResponse(url=f"{frontend_url}/sso/callback?token={_mint_jwt(user)}")
