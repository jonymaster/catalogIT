"""MCP tools backed by CatalogIT's authenticated HTTP API."""

from __future__ import annotations

import os
import uuid
from datetime import date
from typing import Any
from urllib.parse import quote, urlsplit

import httpx
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations

_MAX_RESULTS = 100
_MCP_HOST = os.environ.get("MCP_HOST", "0.0.0.0")
_MCP_PORT = int(os.environ.get("MCP_PORT", "8000"))
_MCP_ALLOWED_HOSTS = [
    item.strip() for item in os.environ.get("MCP_ALLOWED_HOSTS", "").split(",") if item.strip()
]
_MCP_ALLOWED_ORIGINS = [
    item.strip() for item in os.environ.get("MCP_ALLOWED_ORIGINS", "").split(",") if item.strip()
]
# Header set by an authenticating proxy (e.g. "Cf-Access-Jwt-Assertion" with Cloudflare
# Access Managed OAuth). When present it is forwarded instead of the Authorization header;
# CatalogIT validates it against Settings -> Token issuer.
_MCP_IDENTITY_HEADER = os.environ.get("MCP_IDENTITY_HEADER", "").strip().casefold()

mcp = FastMCP(
    "CatalogIT",
    instructions=(
        "Access to a CatalogIT instance. Use the read tools to look up services, vendors, "
        "hardware, service cost records, record change history, and the audit log. "
        "preview_close_fiscal_year only previews closing a financial year and changes nothing; "
        "closing or reverting a year is done in the CatalogIT UI. The create_* "
        "and update_* tools change CatalogIT data: confirm the intended change with the user "
        "first, and look up record ids with the read tools instead of guessing them. The server "
        "cannot delete or archive catalog records; the delete_*_cost tools permanently remove "
        "cost records, so run them only after the user confirms. "
        "Hardware and financial tools require the connected CatalogIT user's existing permissions."
    ),
    host=_MCP_HOST,
    port=_MCP_PORT,
    transport_security=(
        TransportSecuritySettings(
            allowed_hosts=_MCP_ALLOWED_HOSTS,
            allowed_origins=_MCP_ALLOWED_ORIGINS,
        )
        if _MCP_ALLOWED_HOSTS
        else None
    ),
)


def _configuration() -> str:
    base_url = os.environ.get("CATALOGIT_URL", "").strip().rstrip("/")
    if not base_url:
        raise RuntimeError("Set CATALOGIT_URL in the MCP server environment")
    parsed = urlsplit(base_url)
    loopback = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (
        parsed.scheme != "https"
        and not loopback
        and os.environ.get("CATALOGIT_ALLOW_HTTP", "false").casefold() != "true"
    ):
        raise RuntimeError("Use HTTPS for CATALOGIT_URL except for loopback or a trusted private Docker network")
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise RuntimeError("CATALOGIT_URL must be an HTTP(S) URL without embedded credentials")
    return base_url


def _api_token(ctx: Context) -> str:
    """Use the caller's bearer token for HTTP; retain env tokens for local stdio only."""
    # In MCP Python SDK 1.26, HTTP request headers live on the underlying
    # Starlette Request attached to the request context (there is no ctx.headers).
    request = ctx.request_context.request
    headers = request.headers if request is not None else {}
    if _MCP_IDENTITY_HEADER:
        identity_token = headers.get(_MCP_IDENTITY_HEADER, "").strip()
        if identity_token:
            return identity_token
    authorization = headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.casefold() == "bearer" and token.strip():
        return token.strip()
    if os.environ.get("CATALOGIT_TRANSPORT", "stdio").casefold() != "stdio":
        raise RuntimeError(
            "Sign in through the MCP connection's OAuth flow or provide a CatalogIT API token as a Bearer token"
        )

    token = os.environ.get("CATALOGIT_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("No CatalogIT bearer token was provided")
    return token


async def _api_request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json: dict[str, Any] | None = None,
    read_only: bool = False,
    ctx: Context,
) -> Any:
    """Call the API; read_only marks a POST that changes nothing, for accurate error messages."""
    base_url = _configuration()
    api_token = _api_token(ctx)
    is_write = method != "GET" and not read_only
    try:
        async with httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_token}", "Accept": "application/json"},
            timeout=httpx.Timeout(15.0, connect=5.0),
            follow_redirects=False,
        ) as client:
            response = await client.request(method, path, params=params, json=json)
    except httpx.TimeoutException as exc:
        message = "CatalogIT API request timed out"
        if is_write:
            message += "; the change may have been saved, so check the record before retrying"
        raise RuntimeError(message) from exc
    except httpx.HTTPError as exc:
        raise RuntimeError("Could not connect to the CatalogIT API") from exc

    if response.is_error:
        detail = ""
        try:
            payload = response.json()
            detail_value = payload.get("detail") if isinstance(payload, dict) else None
            if isinstance(detail_value, str):
                detail = detail_value[:240]
            elif isinstance(detail_value, list):
                # FastAPI validation errors: [{"loc": [...], "msg": "..."}]
                detail = "; ".join(
                    f"{'.'.join(str(part) for part in item.get('loc', [])[1:])}: {item.get('msg')}"
                    for item in detail_value
                    if isinstance(item, dict)
                )[:240]
        except ValueError:
            pass
        message = f"CatalogIT API returned HTTP {response.status_code}"
        if detail:
            message += f": {detail}"
        if response.status_code == 401:
            message += ". Check whether the API token is valid, active, and unexpired."
        elif response.status_code == 403:
            action = "change" if is_write else "read"
            message += f". The token owner's role or feature permissions do not allow this {action}."
        raise RuntimeError(message)

    if response.status_code == 204:
        return None
    try:
        return response.json()
    except ValueError as exc:
        raise RuntimeError("CatalogIT API returned an invalid JSON response") from exc


async def _api_get(path: str, params: dict[str, Any] | None = None, *, ctx: Context) -> Any:
    return await _api_request("GET", path, params=params, ctx=ctx)


async def _api_write(method: str, path: str, body: dict[str, Any], *, ctx: Context) -> Any:
    return await _api_request(method, path, json=body, ctx=ctx)


_READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False)
_CREATES = ToolAnnotations(
    readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
)
_UPDATES = ToolAnnotations(
    readOnlyHint=False, destructiveHint=True, idempotentHint=True, openWorldHint=False
)
_DELETES = ToolAnnotations(
    readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False
)
_CRITICALITY_VALUES = {"Critical", "High", "Medium", "Low"}


def _uuid_arg(name: str, value: str) -> str:
    try:
        return str(uuid.UUID(value))
    except ValueError as exc:
        raise ValueError(f"{name} must be a CatalogIT UUID") from exc


def _changes(**fields: Any) -> dict[str, Any]:
    """Keep only the arguments the caller set; None means "leave unchanged"."""
    return {key: value for key, value in fields.items() if value is not None}


def _service_fields(
    *,
    description: str | None,
    status: str | None,
    vendor_id: str | None,
    category_id: str | None,
    classification_id: str | None,
    environment: str | None,
    criticality: str | None,
    renewal_date: str | None,
    total_seats: int | None,
    sso_integrated: bool | None,
    scim_enabled: bool | None,
) -> dict[str, Any]:
    if criticality is not None and criticality not in _CRITICALITY_VALUES:
        raise ValueError(f"criticality must be one of: {', '.join(sorted(_CRITICALITY_VALUES))}")
    if renewal_date is not None:
        try:
            renewal_date = date.fromisoformat(renewal_date).isoformat()
        except ValueError as exc:
            raise ValueError("renewal_date must be a date in YYYY-MM-DD format") from exc
    if total_seats is not None and total_seats < 1:
        raise ValueError("total_seats must be at least 1")
    return _changes(
        description=description,
        status=status,
        vendor_id=_uuid_arg("vendor_id", vendor_id) if vendor_id else None,
        category_id=_uuid_arg("category_id", category_id) if category_id else None,
        classification_id=(
            _uuid_arg("classification_id", classification_id) if classification_id else None
        ),
        environment=environment,
        criticality=criticality,
        renewal_date=renewal_date,
        total_seats=total_seats,
        sso_integrated=sso_integrated,
        scim_enabled=scim_enabled,
    )


def _bounded_limit(limit: int) -> int:
    if limit < 1 or limit > _MAX_RESULTS:
        raise ValueError(f"limit must be between 1 and {_MAX_RESULTS}")
    return limit


def _service_summary(row: dict[str, Any]) -> dict[str, Any]:
    """Keep MCP results useful while excluding private notes and personal contact data."""
    vendor = row.get("vendor") or {}
    category = row.get("category_rel") or {}
    classification = row.get("service_classification") or {}
    status = row.get("service_status") or {}
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "description": row.get("description"),
        "status": row.get("status"),
        "is_active": row.get("is_active"),
        "renewal_date": row.get("renewal_date"),
        "renewal_config": row.get("renewal_config"),
        "environment": row.get("environment"),
        "yearly_cost": row.get("yearly_cost"),
        "total_seats": row.get("total_seats"),
        "vendor": {"id": vendor.get("id"), "name": vendor.get("name")} if vendor else None,
        "category": {"id": category.get("id"), "name": category.get("name")} if category else None,
        "classification": {
            "id": classification.get("id"),
            "name": classification.get("name"),
        } if classification else None,
        "service_status": {"id": status.get("id"), "name": status.get("name")} if status else None,
        "tags": [{"id": tag.get("id"), "name": tag.get("name")} for tag in row.get("tags", [])],
        "related_services": [
            {"id": related.get("id"), "name": related.get("name"), "status": related.get("status")}
            for related in row.get("related_services", [])
        ],
    }


def _vendor_summary(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": row.get("id"), "name": row.get("name"), "website": row.get("website")}


def _tag_summary(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": row.get("id"), "name": row.get("name"), "color": row.get("color")}


def _hardware_summary(row: dict[str, Any]) -> dict[str, Any]:
    """Exclude notes, assignee identity, and cellular identifiers from hardware results."""
    status = row.get("hardware_status") or {}
    location = row.get("hardware_location") or {}
    return {
        "id": row.get("id"),
        "hardware_type": row.get("hardware_type"),
        "serial_number": row.get("serial_number"),
        "model_name": row.get("model_name"),
        "status": row.get("status"),
        "is_active": row.get("is_active"),
        "operating_system": row.get("operating_system"),
        "os_version": row.get("os_version"),
        "cpu": row.get("cpu"),
        "ram": row.get("ram"),
        "storage_size": row.get("storage_size"),
        "quantity": row.get("quantity"),
        "mdm_connected": row.get("mdm_connected"),
        "hardware_status": {"id": status.get("id"), "name": status.get("name")} if status else None,
        "hardware_location": {"id": location.get("id"), "name": location.get("name")} if location else None,
    }


@mcp.tool(annotations=_READ_ONLY)
async def list_services(
    ctx: Context,
    query: str | None = None,
    archived: bool = False,
    limit: int = 50,
) -> dict[str, Any]:
    """Find CatalogIT services by name, description, vendor, category, status, or tag.

    Results are capped at 100. Cost fields are included only if the API token has financial visibility.
    """
    limit = _bounded_limit(limit)
    rows = await _api_get("/api/services/", params={"archived": str(archived).lower()}, ctx=ctx)
    needle = query.casefold().strip() if query else ""
    if needle:
        rows = [
            row for row in rows
            if needle in " ".join((
                str(row.get("name") or ""),
                str(row.get("description") or ""),
                str(row.get("status") or ""),
                str((row.get("vendor") or {}).get("name") or ""),
                str((row.get("category_rel") or {}).get("name") or ""),
                " ".join(str(tag.get("name") or "") for tag in row.get("tags", [])),
            )).casefold()
        ]
    return {"count": min(len(rows), limit), "truncated": len(rows) > limit, "services": [_service_summary(row) for row in rows[:limit]]}


@mcp.tool(annotations=_READ_ONLY)
async def get_service(ctx: Context, service_id: str) -> dict[str, Any]:
    """Get one service by its CatalogIT UUID. Cost fields require financial visibility."""
    row = await _api_get(f"/api/services/{quote(service_id, safe='')}", ctx=ctx)
    return _service_summary(row)


@mcp.tool(annotations=_READ_ONLY)
async def list_vendors(ctx: Context, query: str | None = None, limit: int = 50) -> dict[str, Any]:
    """List or search vendors by name. Results are capped at 100."""
    limit = _bounded_limit(limit)
    rows = await _api_get("/api/vendors/", ctx=ctx)
    needle = query.casefold().strip() if query else ""
    if needle:
        rows = [row for row in rows if needle in str(row.get("name") or "").casefold()]
    return {"count": min(len(rows), limit), "truncated": len(rows) > limit, "vendors": [_vendor_summary(row) for row in rows[:limit]]}


@mcp.tool(annotations=_READ_ONLY)
async def list_hardware_assets(
    ctx: Context,
    query: str | None = None,
    hardware_type: str | None = None,
    archived: bool = False,
    limit: int = 50,
) -> dict[str, Any]:
    """Search hardware by model, serial number, status, or location. Requires hardware visibility."""
    limit = _bounded_limit(limit)
    allowed_types = {"laptop", "phone", "tablet", "accessory", "peripheral"}
    if hardware_type is not None and hardware_type not in allowed_types:
        raise ValueError(f"hardware_type must be one of: {', '.join(sorted(allowed_types))}")
    params: dict[str, str] = {"archived": str(archived).lower()}
    if hardware_type:
        params["hardware_type"] = hardware_type
    rows = await _api_get("/api/hardware/", params=params, ctx=ctx)
    needle = query.casefold().strip() if query else ""
    if needle:
        rows = [
            row for row in rows
            if needle in " ".join((
                str(row.get("model_name") or ""),
                str(row.get("serial_number") or ""),
                str(row.get("status") or ""),
                str((row.get("hardware_location") or {}).get("name") or ""),
            )).casefold()
        ]
    return {"count": min(len(rows), limit), "truncated": len(rows) > limit, "hardware_assets": [_hardware_summary(row) for row in rows[:limit]]}


_COST_RECORD_TYPES = {"actual", "estimated", "budget"}


def _cost_record_summary(row: dict[str, Any]) -> dict[str, Any]:
    """Cost record fields shared by every cost tool; notes and recorder stay out."""
    return {
        "id": row.get("id"),
        "service_id": row.get("service_id"),
        "hardware_id": row.get("hardware_id"),
        "fiscal_year": row.get("fiscal_year"),
        "purchase_year": row.get("purchase_year"),
        "amount": row.get("amount"),
        "record_type": row.get("record_type"),
        "payment_method_id": row.get("payment_method_id"),
        "payment_method_name": row.get("payment_method_name"),
        "recorded_at": row.get("recorded_at"),
    }


def _year_arg(name: str, value: int | None) -> int | None:
    if value is not None and not 1900 <= value <= 2100:
        raise ValueError(f"{name} must be between 1900 and 2100")
    return value


def _amount_arg(value: float | None) -> float | None:
    if value is not None and value < 0:
        raise ValueError("amount cannot be negative")
    return value


def _record_type_arg(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().lower()
    if cleaned not in _COST_RECORD_TYPES:
        raise ValueError(f"record_type must be one of: {', '.join(sorted(_COST_RECORD_TYPES))}")
    return cleaned


def _service_cost_path(service_id: str, record_id: str | None = None) -> str:
    path = f"/api/services/{_uuid_arg('service_id', service_id)}/cost-records/"
    if record_id is not None:
        path += _uuid_arg("record_id", record_id)
    return path


def _hardware_cost_path(hardware_id: str) -> str:
    return f"/api/hardware/{_uuid_arg('hardware_id', hardware_id)}/hardware-cost"


@mcp.tool(annotations=_READ_ONLY)
async def get_service_cost_records(
    ctx: Context,
    service_id: str,
    limit: int = 50,
) -> dict[str, Any]:
    """List a service's financial cost records. Requires financial visibility."""
    limit = _bounded_limit(limit)
    rows = await _api_get(f"/api/services/{quote(service_id, safe='')}/cost-records/", ctx=ctx)
    summaries = [_cost_record_summary(row) for row in rows[:limit]]
    return {"count": min(len(rows), limit), "truncated": len(rows) > limit, "cost_records": summaries}


@mcp.tool(annotations=_READ_ONLY)
async def get_hardware_cost(ctx: Context, hardware_id: str) -> dict[str, Any]:
    """Get a hardware asset's purchase cost. Requires financial and hardware visibility.

    Each hardware asset has at most one cost record. Returns cost_record as null when none is set.
    """
    row = await _api_get(_hardware_cost_path(hardware_id), ctx=ctx)
    return {"cost_record": _cost_record_summary(row) if row else None}


@mcp.tool(annotations=_READ_ONLY)
async def list_payment_methods(ctx: Context, query: str | None = None, limit: int = 50) -> dict[str, Any]:
    """List or search payment methods by name, for use with the cost record tools."""
    limit = _bounded_limit(limit)
    rows = await _api_get("/api/payment-methods/", ctx=ctx)
    needle = query.casefold().strip() if query else ""
    if needle:
        rows = [row for row in rows if needle in str(row.get("name") or "").casefold()]
    return {
        "count": min(len(rows), limit),
        "truncated": len(rows) > limit,
        "payment_methods": [{"id": row.get("id"), "name": row.get("name")} for row in rows[:limit]],
    }


@mcp.tool(annotations=_CREATES)
async def create_service_cost_record(
    ctx: Context,
    service_id: str,
    fiscal_year: int,
    amount: float,
    record_type: str,
    purchase_year: int | None = None,
    payment_method_id: str | None = None,
) -> dict[str, Any]:
    """Add a cost record to a service. This changes CatalogIT data.

    Requires an editor or admin account with financial visibility. record_type is actual,
    estimated, or budget. Years are between 1900 and 2100; amount cannot be negative. Pass a
    payment_method_id from list_payment_methods. Archived services are read-only for costs.
    Cost-record notes can only be set in the CatalogIT UI. Returns the new cost record.
    """
    body = {
        "fiscal_year": _year_arg("fiscal_year", fiscal_year),
        "amount": _amount_arg(amount),
        "record_type": _record_type_arg(record_type),
    } | _changes(
        purchase_year=_year_arg("purchase_year", purchase_year),
        payment_method_id=(
            _uuid_arg("payment_method_id", payment_method_id) if payment_method_id else None
        ),
    )
    row = await _api_write("POST", _service_cost_path(service_id), body, ctx=ctx)
    return _cost_record_summary(row)


@mcp.tool(annotations=_UPDATES)
async def update_service_cost_record(
    ctx: Context,
    service_id: str,
    record_id: str,
    fiscal_year: int | None = None,
    amount: float | None = None,
    record_type: str | None = None,
    purchase_year: int | None = None,
    payment_method_id: str | None = None,
) -> dict[str, Any]:
    """Change fields on one service cost record. This changes CatalogIT data.

    Requires an editor or admin account with financial visibility. Only the fields you pass
    are changed; fields cannot be cleared through this tool, and notes are kept. Archived
    services are read-only for costs. Returns the updated cost record.
    """
    path = _service_cost_path(service_id, record_id)
    body = _changes(
        fiscal_year=_year_arg("fiscal_year", fiscal_year),
        amount=_amount_arg(amount),
        record_type=_record_type_arg(record_type),
        purchase_year=_year_arg("purchase_year", purchase_year),
        payment_method_id=(
            _uuid_arg("payment_method_id", payment_method_id) if payment_method_id else None
        ),
    )
    if not body:
        raise ValueError("Pass at least one field to change")
    row = await _api_write("PUT", path, body, ctx=ctx)
    return _cost_record_summary(row)


@mcp.tool(annotations=_DELETES)
async def delete_service_cost_record(ctx: Context, service_id: str, record_id: str) -> dict[str, Any]:
    """Permanently delete one service cost record. This cannot be undone.

    Confirm with the user before running it. Requires an editor or admin account with
    financial visibility. Archived services are read-only for costs.
    """
    path = _service_cost_path(service_id, record_id)
    await _api_request("DELETE", path, ctx=ctx)
    return {
        "deleted": True,
        "id": _uuid_arg("record_id", record_id),
        "service_id": _uuid_arg("service_id", service_id),
    }


@mcp.tool(annotations=_UPDATES)
async def set_hardware_cost(
    ctx: Context,
    hardware_id: str,
    amount: float,
    purchase_year: int | None = None,
    fiscal_year: int | None = None,
) -> dict[str, Any]:
    """Set the purchase cost of a hardware asset. This changes CatalogIT data.

    Requires an editor or admin account with financial and hardware visibility. Each asset has
    one cost record of type actual; this creates it or replaces its amount. purchase_year and
    fiscal_year keep their current values when omitted; a new record's fiscal year defaults to
    the purchase year, then to the current year. amount must be greater than 0; use
    delete_hardware_cost to remove a cost. Archived hardware is read-only for costs.
    """
    if amount <= 0:
        raise ValueError("amount must be greater than 0; use delete_hardware_cost to remove a cost")
    path = _hardware_cost_path(hardware_id)
    _year_arg("purchase_year", purchase_year)
    _year_arg("fiscal_year", fiscal_year)
    if purchase_year is None or fiscal_year is None:
        current = await _api_get(path, ctx=ctx) or {}
        if purchase_year is None:
            purchase_year = current.get("purchase_year")
        if fiscal_year is None:
            fiscal_year = current.get("fiscal_year")
    body = {"amount": amount} | _changes(purchase_year=purchase_year, fiscal_year=fiscal_year)
    row = await _api_write("PUT", path, body, ctx=ctx)
    return _cost_record_summary(row)


@mcp.tool(annotations=_DELETES)
async def delete_hardware_cost(ctx: Context, hardware_id: str) -> dict[str, Any]:
    """Permanently remove a hardware asset's purchase cost. This cannot be undone.

    Confirm with the user before running it. Requires an editor or admin account with
    financial and hardware visibility. Archived hardware is read-only for costs.
    """
    path = _hardware_cost_path(hardware_id)
    hardware_id = _uuid_arg("hardware_id", hardware_id)
    if not await _api_get(path, ctx=ctx):
        return {"deleted": False, "hardware_id": hardware_id}
    await _api_write("PUT", path, {"amount": 0}, ctx=ctx)
    return {"deleted": True, "hardware_id": hardware_id}


def _close_year_conversion(row: dict[str, Any]) -> dict[str, Any]:
    """Conversion rows carry the record's notes; keep them out like other cost tools."""
    return {
        "record_id": row.get("record_id"),
        "amount": row.get("amount"),
        "include": row.get("include"),
        "flags": row.get("flags", []),
        "payment_method_id": row.get("payment_method_id"),
    }


@mcp.tool(annotations=_READ_ONLY)
async def preview_close_fiscal_year(
    ctx: Context,
    fiscal_year: int,
    uplift_pct: float = 0,
) -> dict[str, Any]:
    """Preview closing a financial year for service costs. This changes nothing.

    Requires an admin account with financial visibility. fiscal_year is a calendar year up to
    the current one. For each active service with costs that year, lists the estimated records
    that would become actual and the one next-year estimate that would be created: the sum of
    the year's actuals after conversion, changed by uplift_pct percent (-100 to 1000, default
    0). Flags and skip reasons explain each row; archived services are listed as skipped.
    Cost-record notes are not returned. Closing or reverting a year can only be done in the
    CatalogIT UI.
    """
    if not -100 <= uplift_pct <= 1000:
        raise ValueError("uplift_pct must be between -100 and 1000")
    body = {"fiscal_year": _year_arg("fiscal_year", fiscal_year), "uplift_pct": uplift_pct}
    payload = await _api_request(
        "POST", "/api/cost-records/close-year/preview", json=body, read_only=True, ctx=ctx
    )
    return payload | {
        "services": [
            service
            | {"conversions": [_close_year_conversion(row) for row in service.get("conversions", [])]}
            for service in payload.get("services", [])
        ]
    }


_HISTORY_TABLES = {
    "service": "services",
    "hardware": "hardware_assets",
    "vendor": "vendors",
    "tag": "tags",
    "cost_record": "cost_records",
}
# History values mirror whole database rows, so drop the same private fields the
# summaries above leave out, plus financial references and storage locations.
_HISTORY_HIDDEN_FIELDS = frozenset({
    "notes",
    "point_of_contact",
    "imei",
    "imei2",
    "phone_number",
    "assigned_to",
    "assigned_to_id",
    "cost_center",
    "cost_center_id",
    "payment_method",
    "payment_method_id",
    "storage_key",
})
_AUDIT_CATEGORIES = {"data_change", "security", "notification", "error"}


def _actor_summary(actor: dict[str, Any] | None) -> dict[str, Any] | None:
    """Attribute events by name only; emails and profile fields stay out of results."""
    if not actor:
        return None
    full_name = " ".join(
        part for part in (actor.get("first_name"), actor.get("last_name")) if part
    )
    return {"id": actor.get("id"), "name": actor.get("display_name") or full_name or None}


def _visible_values(values: dict[str, Any] | None) -> dict[str, Any] | None:
    if values is None:
        return None
    return {key: value for key, value in values.items() if key not in _HISTORY_HIDDEN_FIELDS}


def _page_bounds(page: int, per_page: int) -> tuple[int, int]:
    if page < 1:
        raise ValueError("page must be 1 or greater")
    return page, _bounded_limit(per_page)


@mcp.tool(annotations=_READ_ONLY)
async def get_record_history(
    ctx: Context,
    record_type: str,
    record_id: str,
    page: int = 1,
    per_page: int = 50,
) -> dict[str, Any]:
    """Get the change history of one service, hardware asset, vendor, tag, or cost record, newest first.

    record_type is one of: service, hardware, vendor, tag, cost_record. Service and hardware
    history include their attachment changes. Hardware history requires hardware visibility;
    cost record history requires financial visibility (and hardware visibility for hardware
    costs). Notes, contact
    details, assignees, cellular identifiers, and financial references are removed from values.
    """
    table = _HISTORY_TABLES.get(record_type)
    if table is None:
        raise ValueError(f"record_type must be one of: {', '.join(sorted(_HISTORY_TABLES))}")
    try:
        record_uuid = uuid.UUID(record_id)
    except ValueError as exc:
        raise ValueError("record_id must be a CatalogIT UUID") from exc
    page, per_page = _page_bounds(page, per_page)
    payload = await _api_get(
        f"/api/history/{table}/{record_uuid}",
        params={"page": page, "per_page": per_page},
        ctx=ctx,
    )
    entries = [
        {
            "id": row.get("id"),
            "table": row.get("table_name"),
            "action": row.get("action"),
            "changed_by": _actor_summary(row.get("changed_by")),
            "timestamp": row.get("timestamp"),
            "old_values": _visible_values(row.get("old_values")),
            "new_values": _visible_values(row.get("new_values")),
        }
        for row in payload.get("items", [])
    ]
    return {
        "page": payload.get("page"),
        "total_pages": payload.get("total_pages"),
        "total_count": payload.get("total_count"),
        "entries": entries,
    }


@mcp.tool(annotations=_READ_ONLY)
async def list_audit_events(
    ctx: Context,
    category: str | None = None,
    page: int = 1,
    per_page: int = 50,
) -> dict[str, Any]:
    """List CatalogIT's global audit log, newest first. Requires an admin account.

    category is one of: data_change, security, notification, error. Results include each event's
    summary and, for data changes, the names of changed fields. Changed values, request
    details, and error payloads are not returned; use get_record_history for record values.
    """
    if category is not None and category not in _AUDIT_CATEGORIES:
        raise ValueError(f"category must be one of: {', '.join(sorted(_AUDIT_CATEGORIES))}")
    page, per_page = _page_bounds(page, per_page)
    params: dict[str, Any] = {"page": page, "per_page": per_page}
    if category:
        params["category"] = category
    payload = await _api_get("/api/settings/audit-events", params=params, ctx=ctx)
    events = []
    for row in payload.get("items", []):
        details = row.get("details") if isinstance(row.get("details"), dict) else {}
        event = {
            "id": row.get("id"),
            "category": row.get("category"),
            "event_type": row.get("event_type"),
            "entity_table": row.get("entity_table"),
            "entity_id": row.get("entity_key"),
            "actor": _actor_summary(row.get("actor")),
            "occurred_at": row.get("occurred_at"),
            "summary": row.get("summary"),
        }
        if row.get("category") == "data_change":
            changed = set(details.get("new_values") or {}) | set(details.get("old_values") or {})
            event["changed_fields"] = sorted(changed - _HISTORY_HIDDEN_FIELDS)
        events.append(event)
    return {
        "page": payload.get("page"),
        "total_pages": payload.get("total_pages"),
        "total_count": payload.get("total_count"),
        "events": events,
    }


@mcp.tool(annotations=_CREATES)
async def create_vendor(ctx: Context, name: str, website: str | None = None) -> dict[str, Any]:
    """Create a vendor. This changes CatalogIT data. Requires an admin account.

    Vendor names must be unique. Returns the new vendor and its id.
    """
    if not name.strip():
        raise ValueError("name cannot be blank")
    row = await _api_write("POST", "/api/vendors/", _changes(name=name, website=website), ctx=ctx)
    return _vendor_summary(row)


@mcp.tool(annotations=_UPDATES)
async def update_vendor(
    ctx: Context,
    vendor_id: str,
    name: str | None = None,
    website: str | None = None,
) -> dict[str, Any]:
    """Rename a vendor or change its website. This changes CatalogIT data. Requires an admin account.

    Only the fields you pass are changed. Returns the updated vendor.
    """
    body = _changes(name=name, website=website)
    if not body:
        raise ValueError("Pass name or website to change")
    row = await _api_write(
        "PATCH", f"/api/vendors/{_uuid_arg('vendor_id', vendor_id)}", body, ctx=ctx
    )
    return _vendor_summary(row)


@mcp.tool(annotations=_CREATES)
async def create_tag(ctx: Context, name: str, color: str | None = None) -> dict[str, Any]:
    """Create a service tag. This changes CatalogIT data. Requires an editor or admin account.

    Tag names must be unique, at most 50 characters, and contain no commas. color is a badge
    color preset name; omit it to pick one at random. Returns the new tag and its id.
    """
    row = await _api_write("POST", "/api/tags/", _changes(name=name, color=color), ctx=ctx)
    return _tag_summary(row)


@mcp.tool(annotations=_UPDATES)
async def update_tag(
    ctx: Context,
    tag_id: str,
    name: str | None = None,
    color: str | None = None,
) -> dict[str, Any]:
    """Rename a tag or change its color. This changes CatalogIT data. Requires an admin account.

    Only the fields you pass are changed. Renaming a tag renames it on every service that uses it.
    """
    body = _changes(name=name, color=color)
    if not body:
        raise ValueError("Pass name or color to change")
    row = await _api_write("PATCH", f"/api/tags/{_uuid_arg('tag_id', tag_id)}", body, ctx=ctx)
    return _tag_summary(row)


@mcp.tool(annotations=_CREATES)
async def create_service(
    ctx: Context,
    name: str,
    description: str | None = None,
    status: str | None = None,
    vendor_id: str | None = None,
    category_id: str | None = None,
    classification_id: str | None = None,
    environment: str | None = None,
    criticality: str | None = None,
    renewal_date: str | None = None,
    total_seats: int | None = None,
    sso_integrated: bool | None = None,
    scim_enabled: bool | None = None,
    tag_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Create a service. This changes CatalogIT data. Requires an editor or admin account.

    status is the name of a configured service status. Pass vendor, category, classification,
    and tag UUIDs from the list tools. criticality is Critical, High, Medium, or Low; renewal_date
    is YYYY-MM-DD. Owners, assignees, notes, contacts, and financial fields can only be set in
    the CatalogIT UI. Returns the new service and its id.
    """
    body = {
        "name": name,
        **_service_fields(
            description=description,
            status=status,
            vendor_id=vendor_id,
            category_id=category_id,
            classification_id=classification_id,
            environment=environment,
            criticality=criticality,
            renewal_date=renewal_date,
            total_seats=total_seats,
            sso_integrated=sso_integrated,
            scim_enabled=scim_enabled,
        ),
    }
    if tag_ids:
        body["tag_ids"] = [_uuid_arg("tag_ids", tag_id) for tag_id in tag_ids]
    row = await _api_write("POST", "/api/services/", body, ctx=ctx)
    return _service_summary(row)


@mcp.tool(annotations=_UPDATES)
async def update_service(
    ctx: Context,
    service_id: str,
    name: str | None = None,
    description: str | None = None,
    status: str | None = None,
    vendor_id: str | None = None,
    category_id: str | None = None,
    classification_id: str | None = None,
    environment: str | None = None,
    criticality: str | None = None,
    renewal_date: str | None = None,
    total_seats: int | None = None,
    sso_integrated: bool | None = None,
    scim_enabled: bool | None = None,
    add_tag_ids: list[str] | None = None,
    remove_tag_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Change fields on one service. This changes CatalogIT data. Requires an editor or admin account.

    Only the fields you pass are changed; fields cannot be cleared through this tool. Use
    add_tag_ids and remove_tag_ids to change tags without replacing the others. Archived
    services only accept description and status changes. Returns the updated service.
    """
    service_id = _uuid_arg("service_id", service_id)
    body = _changes(name=name) | _service_fields(
        description=description,
        status=status,
        vendor_id=vendor_id,
        category_id=category_id,
        classification_id=classification_id,
        environment=environment,
        criticality=criticality,
        renewal_date=renewal_date,
        total_seats=total_seats,
        sso_integrated=sso_integrated,
        scim_enabled=scim_enabled,
    )
    if add_tag_ids or remove_tag_ids:
        add = [_uuid_arg("add_tag_ids", tag_id) for tag_id in add_tag_ids or []]
        remove = {_uuid_arg("remove_tag_ids", tag_id) for tag_id in remove_tag_ids or []}
        current = await _api_get(f"/api/services/{service_id}", ctx=ctx)
        tag_ids = [str(tag.get("id")) for tag in current.get("tags", []) if str(tag.get("id")) not in remove]
        tag_ids += [tag_id for tag_id in add if tag_id not in tag_ids and tag_id not in remove]
        body["tag_ids"] = tag_ids
    if not body:
        raise ValueError("Pass at least one field to change")
    row = await _api_write("PATCH", f"/api/services/{service_id}", body, ctx=ctx)
    return _service_summary(row)


def main() -> None:
    """Run stdio locally or Streamable HTTP as a hosted MCP endpoint."""
    _configuration()
    transport = os.environ.get("CATALOGIT_TRANSPORT", "stdio").casefold()
    if transport == "stdio":
        mcp.run(transport="stdio")
    elif transport == "streamable-http":
        if not _MCP_ALLOWED_HOSTS:
            raise RuntimeError("Set MCP_ALLOWED_HOSTS to the public hostname(s) that proxy to this server")
        # This SDK API reads host, port, and transport security from the
        # FastMCP constructor; run() selects only the transport.
        mcp.run(transport="streamable-http")
    else:
        raise RuntimeError("CATALOGIT_TRANSPORT must be 'stdio' or 'streamable-http'")


if __name__ == "__main__":
    main()
