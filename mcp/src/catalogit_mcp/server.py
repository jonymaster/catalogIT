"""Read-only MCP tools backed by CatalogIT's authenticated HTTP API."""

from __future__ import annotations

import os
import uuid
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
# Header set by an authenticating proxy (e.g. "Cf-Access-Jwt-Assertion" with Cloudflare
# Access Managed OAuth). When present it is forwarded instead of the Authorization header;
# CatalogIT validates it against Settings -> Token issuer.
_MCP_IDENTITY_HEADER = os.environ.get("MCP_IDENTITY_HEADER", "").strip().casefold()

mcp = FastMCP(
    "CatalogIT",
    instructions=(
        "Read-only access to a CatalogIT instance. Use these tools to look up services, "
        "vendors, hardware, service cost records, record change history, and the audit log. "
        "The server cannot modify CatalogIT. "
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


_HISTORY_TABLES = {
    "service": "services",
    "hardware": "hardware_assets",
    "vendor": "vendors",
    "tag": "tags",
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


@mcp.tool()
async def get_record_history(
    ctx: Context,
    record_type: str,
    record_id: str,
    page: int = 1,
    per_page: int = 50,
) -> dict[str, Any]:
    """Get the change history of one service, hardware asset, vendor, or tag, newest first.

    record_type is one of: service, hardware, vendor, tag. Service and hardware history include
    their attachment changes. Hardware history requires hardware visibility. Notes, contact
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


@mcp.tool()
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
