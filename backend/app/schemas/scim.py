from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field


class ScimName(BaseModel):
    givenName: str = ""
    familyName: str = ""


class ScimEmail(BaseModel):
    value: str
    primary: bool = True


class ScimUserResource(BaseModel):
    schemas: list[str] = ["urn:ietf:params:scim:schemas:core:2.0:User"]
    id: str
    userName: str
    name: ScimName
    emails: list[ScimEmail] = []
    active: bool = True
    externalId: str = ""

    model_config = {"from_attributes": True}


class ScimListResponse(BaseModel):
    schemas: list[str] = ["urn:ietf:params:scim:api:messages:2.0:ListResponse"]
    totalResults: int
    startIndex: int = 1
    itemsPerPage: int = 100
    Resources: list[ScimUserResource] = []


class ScimCreateUser(BaseModel):
    schemas: list[str] = []
    userName: str
    name: ScimName = ScimName()
    emails: list[ScimEmail] = []
    externalId: str = ""
    active: bool = True


class ScimPatchOp(BaseModel):
    op: str
    path: str | None = None
    value: Any = None


class ScimPatchRequest(BaseModel):
    schemas: list[str] = []
    Operations: list[ScimPatchOp] = []
