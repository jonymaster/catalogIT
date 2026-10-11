"""Read-only MCP tools backed by CatalogIT's authenticated HTTP API."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import quote, urlsplit

import httpx
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings

_MAX_RESULTS = 100
_MCP_HOST = os.environ.get("MCP_HOST", "0.0.0.0")
_MCP_PORT = int(os.environ.get("MCP_PORT", "8000"))
_MCP_ALLOWED_HOSTS = [
    item.strip() for item in os.environ.get("MCP_ALLOWED_HOSTS", "").split(",") if item.strip()
]
_MCP_ALLOWED_ORIGINS = [
    item.strip() for item in os.environ.get("MCP_ALLOWED_ORIGINS", "").split(",") if item.strip()
]

mcp = FastMCP(
    "CatalogIT",
    instructions=(
        "Read-only access to a CatalogIT instance. Use these tools to look up services, "
        "vendors, hardware, and service cost records. The server cannot modify CatalogIT. "
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
    authorization = headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.casefold() == "bearer" and token.strip():
        return token.strip()
    if os.environ.get("CATALOGIT_TRANSPORT", "stdio").casefold() != "stdio":
        raise RuntimeError("Provide a CatalogIT API token as a Bearer token in the MCP connection")

    token = os.environ.get("CATALOGIT_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("No CatalogIT bearer token was provided")
    return token


async def _api_get(path: str, params: dict[str, Any] | None = None, *, ctx: Context) -> Any:
    base_url = _configuration()
    api_token = _api_token(ctx)
    try:
        async with httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_token}", "Accept": "application/json"},
            timeout=httpx.Timeout(15.0, connect=5.0),
            follow_redirects=False,
        ) as client:
            response = await client.get(path, params=params)
    except httpx.TimeoutException as exc:
        raise RuntimeError("CatalogIT API request timed out") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError("Could not connect to the CatalogIT API") from exc

    if response.is_error:
        detail = ""
        try:
            payload = response.json()
            detail_value = payload.get("detail") if isinstance(payload, dict) else None
            if isinstance(detail_value, str):
                detail = detail_value[:240]
        except ValueError:
            pass
        message = f"CatalogIT API returned HTTP {response.status_code}"
        if detail:
            message += f": {detail}"
        if response.status_code == 401:
            message += ". Check whether the API token is valid, active, and unexpired."
        elif response.status_code == 403:
            message += ". The token owner's role or feature permissions do not allow this read."
        raise RuntimeError(message)

    try:
        return response.json()
    except ValueError as exc:
        raise RuntimeError("CatalogIT API returned an invalid JSON response") from exc


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


@mcp.tool()
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


@mcp.tool()
async def get_service(ctx: Context, service_id: str) -> dict[str, Any]:
    """Get one service by its CatalogIT UUID. Cost fields require financial visibility."""
    row = await _api_get(f"/api/services/{quote(service_id, safe='')}", ctx=ctx)
    return _service_summary(row)


@mcp.tool()
async def list_vendors(ctx: Context, query: str | None = None, limit: int = 50) -> dict[str, Any]:
    """List or search vendors by name. Results are capped at 100."""
    limit = _bounded_limit(limit)
    rows = await _api_get("/api/vendors/", ctx=ctx)
    needle = query.casefold().strip() if query else ""
    if needle:
        rows = [row for row in rows if needle in str(row.get("name") or "").casefold()]
    return {"count": min(len(rows), limit), "truncated": len(rows) > limit, "vendors": [_vendor_summary(row) for row in rows[:limit]]}


@mcp.tool()
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


@mcp.tool()
async def get_service_cost_records(
    ctx: Context,
    service_id: str,
    limit: int = 50,
) -> dict[str, Any]:
    """List a service's financial cost records. Requires financial visibility."""
    limit = _bounded_limit(limit)
    rows = await _api_get(f"/api/services/{quote(service_id, safe='')}/cost-records/", ctx=ctx)
    summaries = [
        {
            "id": row.get("id"),
            "service_id": row.get("service_id"),
            "fiscal_year": row.get("fiscal_year"),
            "purchase_year": row.get("purchase_year"),
            "amount": row.get("amount"),
            "record_type": row.get("record_type"),
            "payment_method_name": row.get("payment_method_name"),
            "recorded_at": row.get("recorded_at"),
        }
        for row in rows[:limit]
    ]
    return {"count": min(len(rows), limit), "truncated": len(rows) > limit, "cost_records": summaries}


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
