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
from jose.exceptions import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.db import get_audited_db
from app.global_audit import record_global_audit_event, record_global_audit_event_committed
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
        await record_global_audit_event_committed(
            category="security",
            event_type="login_failure",
            summary="Local login failed",
            details={"method": "local", "reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not _verify_password(body.password, user.password_hash):
        await record_global_audit_event_committed(
            category="security",
            event_type="login_failure",
            summary="Local login failed",
            details={"method": "local", "reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user.is_active:
        await record_global_audit_event_committed(
            category="security",
            event_type="login_failure",
            summary="Local login failed",
            details={"method": "local", "reason": "account_disabled"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account disabled")

    await record_global_audit_event(
        db,
        category="security",
        event_type="login_success",
        entity_table="users",
        entity_key=str(user.id),
        actor_user_id=user.id,
        summary="Local login succeeded",
        details={"method": "local"},
        entity_label=user.email,
    )
    return LoginResponse(
        access_token=_mint_jwt(user),
        must_reset_password=user.must_reset_password,
    )


# ── Password reset ───────────────────────────────────────────────

@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    body: ResetPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_audited_db),
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
    await record_global_audit_event(
        db,
        category="security",
        event_type="password_changed",
        entity_table="users",
        entity_key=str(user.id),
        actor_user_id=user.id,
        summary="Password changed by user",
        details={"method": "local_reset"},
        entity_label=user.email,
    )


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
        await record_global_audit_event_committed(
            category="security",
            event_type="oidc_token_exchange_failed",
            summary="OIDC token exchange failed",
            details={"status_code": token_resp.status_code},
        )
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {token_resp.text}")

    token_data = token_resp.json()
    id_token = token_data.get("id_token", "")
    access_token = token_data.get("access_token", "")

    # Verify id_token signature using provider's JWKS keys
    jwks_uri = discovery.get("jwks_uri")
    if jwks_uri:
        async with httpx.AsyncClient(timeout=10) as client:
            jwks_resp = await client.get(jwks_uri)
        if jwks_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch OIDC JWKS")
        jwks = jwks_resp.json()
        try:
            # OIDC id_tokens may include at_hash; python-jose needs the access_token to verify it.
            oidc_decode_options = None if access_token else {"verify_at_hash": False}
            claims = jwt.decode(
                id_token,
                jwks,
                algorithms=["RS256", "ES256"],
                audience=oidc.client_id,
                issuer=oidc.issuer_url.rstrip("/"),
                access_token=access_token,
                options=oidc_decode_options,
            )
        except JWTError as exc:
            logger.error("OIDC id_token verification failed: %s", exc)
            raise HTTPException(status_code=401, detail="Invalid OIDC id_token")
    else:
        # Fallback: no JWKS URI in discovery (non-standard provider)
        logger.warning("OIDC provider has no jwks_uri; using unverified claims")
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

    await record_global_audit_event(
        db,
        category="security",
        event_type="oidc_login_success",
        entity_table="users",
        entity_key=str(user.id),
        actor_user_id=user.id,
        summary="OIDC login succeeded",
        details={"method": "oidc"},
        entity_label=(user.email or "").strip() or None,
    )

    settings = get_settings()
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    return RedirectResponse(url=f"{frontend_url}/sso/callback?token={_mint_jwt(user)}")
