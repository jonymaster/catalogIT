from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_scim_token
from app.models.user import User
from app.schemas.scim import (
    ScimCreateUser,
    ScimListResponse,
    ScimPatchRequest,
    ScimResourceType,
    ScimServiceProviderConfig,
    ScimUserResource,
    ScimEmail,
    ScimName,
)

router = APIRouter(prefix="/scim/v2", tags=["scim"], dependencies=[Depends(require_scim_token)])


def _scim_error(status_code: int, detail: str) -> JSONResponse:
    """Return a SCIM-compliant error response."""
    return JSONResponse(
        status_code=status_code,
        content={
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:Error"],
            "detail": detail,
            "status": str(status_code),
        },
    )


def _user_to_scim(user: User) -> ScimUserResource:
    return ScimUserResource(
        id=str(user.id),
        userName=user.email,
        name=ScimName(givenName=user.first_name, familyName=user.last_name),
        displayName=user.display_name or f"{user.first_name} {user.last_name}".strip(),
        emails=[ScimEmail(value=user.email, primary=True)],
        active=user.is_active,
        externalId=user.external_id,
    )


def _parse_filter(filter_str: str | None) -> str | None:
    """Extract the value from a simple SCIM filter like: userName eq \"foo@bar.com\" """
    if not filter_str:
        return None
    match = re.match(r'userName\s+eq\s+"([^"]+)"', filter_str)
    return match.group(1) if match else None


# -- Discovery endpoints (required by Okta) --------------------------------

@router.get("/ServiceProviderConfig")
async def service_provider_config() -> ScimServiceProviderConfig:
    return ScimServiceProviderConfig()


@router.get("/ResourceTypes")
async def resource_types() -> list[dict]:
    rt = ScimResourceType(
        id="User",
        name="User",
        endpoint="/Users",
        schema_="urn:ietf:params:scim:schemas:core:2.0:User",
    )
    return [rt.model_dump()]


# -- User CRUD --------------------------------------------------------------

@router.get("/Users")
async def list_users(
    filter: str | None = Query(None),
    startIndex: int = Query(1, ge=1),
    count: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
) -> ScimListResponse:
    query = select(User)

    email_filter = _parse_filter(filter)
    if email_filter:
        query = query.where(User.email == email_filter)

    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar_one()

    query = query.offset(startIndex - 1).limit(count)
    result = await db.execute(query)
    users = result.scalars().all()

    return ScimListResponse(
        totalResults=total,
        startIndex=startIndex,
        itemsPerPage=count,
        Resources=[_user_to_scim(u) for u in users],
    )


@router.get("/Users/{user_id}")
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        return _scim_error(404, "User not found")
    return _user_to_scim(user)


@router.post("/Users", status_code=status.HTTP_201_CREATED)
async def create_user(body: ScimCreateUser, db: AsyncSession = Depends(get_db)):
    email = body.userName
    if body.emails:
        email = body.emails[0].value

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        return _scim_error(409, "User already exists")

    user = User(
        external_id=body.externalId or str(uuid.uuid4()),
        email=email,
        first_name=body.name.givenName,
        last_name=body.name.familyName,
        display_name=body.displayName or None,
        is_active=body.active,
    )
    db.add(user)
    await db.flush()
    return _user_to_scim(user)


@router.put("/Users/{user_id}")
async def replace_user(
    user_id: uuid.UUID,
    body: ScimCreateUser,
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        return _scim_error(404, "User not found")

    email = body.userName
    if body.emails:
        email = body.emails[0].value

    user.email = email
    user.first_name = body.name.givenName
    user.last_name = body.name.familyName
    user.display_name = body.displayName or None
    user.is_active = body.active
    if body.externalId:
        user.external_id = body.externalId

    await db.flush()
    return _user_to_scim(user)


@router.patch("/Users/{user_id}")
async def patch_user(
    user_id: uuid.UUID,
    body: ScimPatchRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        return _scim_error(404, "User not found")

    for op in body.Operations:
        operation = op.op.lower()
        if operation == "replace":
            if op.path == "active" or (isinstance(op.value, dict) and "active" in op.value):
                value = op.value if isinstance(op.value, bool) else op.value.get("active", user.is_active)
                user.is_active = bool(value)
            if op.path == "name.givenName":
                user.first_name = str(op.value)
            if op.path == "name.familyName":
                user.last_name = str(op.value)
            if op.path == "displayName":
                user.display_name = str(op.value)
            if not op.path and isinstance(op.value, dict):
                if "active" in op.value:
                    user.is_active = bool(op.value["active"])
                if "name" in op.value and isinstance(op.value["name"], dict):
                    if "givenName" in op.value["name"]:
                        user.first_name = op.value["name"]["givenName"]
                    if "familyName" in op.value["name"]:
                        user.last_name = op.value["name"]["familyName"]
                if "displayName" in op.value:
                    user.display_name = op.value["displayName"]

    await db.flush()
    return _user_to_scim(user)
