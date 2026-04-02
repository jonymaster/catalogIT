from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies.auth import require_role
from app.models.user import User
from app.reference_data_registry import REFERENCE_DATA_RESOURCES
from app.schemas.reference_data import ReferenceDataResourceRead

router = APIRouter(prefix="/api/settings/reference-data", tags=["reference-data"])

_admin = require_role("admin")


@router.get("/", response_model=list[ReferenceDataResourceRead])
async def list_reference_data_resources(_user: User = Depends(_admin)):
    return [resource.to_read() for resource in REFERENCE_DATA_RESOURCES.values()]
