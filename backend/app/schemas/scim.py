from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# RFC 7643 Enterprise User Extension
ENTERPRISE_USER_SCHEMA = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
ENTERPRISE_DEPARTMENT_PATH = f"{ENTERPRISE_USER_SCHEMA}:department"


class ScimName(BaseModel):
    givenName: str = ""
    familyName: str = ""


class ScimEmail(BaseModel):
    value: str
    primary: bool = True


class ScimEnterpriseUser(BaseModel):
    department: str | None = None


class ScimUserResource(BaseModel):
    schemas: list[str] = ["urn:ietf:params:scim:schemas:core:2.0:User"]
    id: str
    userName: str
    name: ScimName
    displayName: str = ""
    emails: list[ScimEmail] = []
    active: bool = True
    externalId: str = ""
    enterprise_user: ScimEnterpriseUser | None = Field(
        default=None,
        validation_alias=ENTERPRISE_USER_SCHEMA,
        serialization_alias=ENTERPRISE_USER_SCHEMA,
    )

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        # Ensures list/GET JSON uses the SCIM URI key for nested dumps (e.g. inside ListResponse).
        serialize_by_alias=True,
    )

    def model_dump(self, **kwargs: Any) -> dict[str, Any]:  # type: ignore[override]
        kwargs.setdefault("by_alias", True)
        kwargs.setdefault("exclude_none", True)
        return super().model_dump(**kwargs)


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
    displayName: str = ""
    emails: list[ScimEmail] = []
    externalId: str = ""
    active: bool = True
    enterprise_user: ScimEnterpriseUser | None = Field(
        default=None,
        validation_alias=ENTERPRISE_USER_SCHEMA,
        serialization_alias=ENTERPRISE_USER_SCHEMA,
    )

    model_config = ConfigDict(populate_by_name=True)


class ScimPatchOp(BaseModel):
    op: str
    path: str | None = None
    value: Any = None


class ScimPatchRequest(BaseModel):
    schemas: list[str] = []
    Operations: list[ScimPatchOp] = []


# -- Discovery resources Okta expects during "Test API Credentials" ----------

class _Supported(BaseModel):
    supported: bool


class _BulkSupported(BaseModel):
    supported: bool
    maxOperations: int = 0
    maxPayloadSize: int = 0


class _FilterSupported(BaseModel):
    supported: bool
    maxResults: int = 200


class _AuthScheme(BaseModel):
    type: str
    name: str
    description: str


class ScimServiceProviderConfig(BaseModel):
    schemas: list[str] = [
        "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"
    ]
    patch: _Supported = _Supported(supported=True)
    bulk: _BulkSupported = _BulkSupported(supported=False)
    filter: _FilterSupported = _FilterSupported(supported=True)
    changePassword: _Supported = _Supported(supported=False)
    sort: _Supported = _Supported(supported=False)
    etag: _Supported = _Supported(supported=False)
    authenticationSchemes: list[_AuthScheme] = [
        _AuthScheme(
            type="oauthbearertoken",
            name="OAuth Bearer Token",
            description="Authentication using the OAuth Bearer Token standard",
        )
    ]


class ScimResourceType(BaseModel):
    schemas: list[str] = [
        "urn:ietf:params:scim:schemas:core:2.0:ResourceType"
    ]
    id: str
    name: str
    endpoint: str
    schema_: str

    model_config = {"populate_by_name": True}

    def model_dump(self, **kw: Any) -> dict[str, Any]:  # type: ignore[override]
        d = super().model_dump(**kw)
        d["schema"] = d.pop("schema_")
        return d
