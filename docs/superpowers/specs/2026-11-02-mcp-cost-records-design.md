# MCP Cost Record Tools Design

## Goal

Let MCP clients read, create, update, and delete cost records for services and hardware assets, with the same rules as the web UI and REST API.

## Current state

- `mcp/src/catalogit_mcp/server.py` has one read tool for costs: `get_service_cost_records`. It has no hardware cost read and no cost writes.
- The server instructions and `docs/integrations/mcp.md` say: "The server cannot delete or archive records."
- Service costs live at `/api/services/{service_id}/cost-records/` (`backend/app/routers/cost_records.py`):
  - `GET /`, `GET /{record_id}`: financial visibility.
  - `POST /`, `PUT /{record_id}`, `DELETE /{record_id}`: editor or admin, plus financial visibility.
  - Writes on an archived service return `409 Archived services are read-only for cost records`.
  - `CostRecordCreate`: `fiscal_year` 1900-2100 (required), `amount` >= 0 (required), `record_type` in `actual | estimated | budget` (required), optional `purchase_year` 1900-2100, optional `payment_method_id`, optional `notes`.
  - `CostRecordUpdate` uses `exclude_unset`, so unsent fields stay unchanged. `fiscal_year`, `amount`, and `record_type` cannot be null.
- Hardware costs allow one record per asset (partial unique index `uq_cost_records_hardware_id`). The UI uses `GET/PUT /api/hardware/{hardware_id}/hardware-cost` (`backend/app/routers/hardware_assets.py`):
  - Requires financial visibility and hardware visibility. `PUT` also requires editor or admin.
  - `PUT` with `amount: 0` deletes the record.
  - `PUT` replaces `purchase_year` (an omitted value becomes `null`) and forces `record_type` to `actual`.
  - Archived hardware returns `409 Archived hardware is read-only for cost`.
- `GET /api/payment-methods/` is open to every signed-in user.
- Cost record history exists (`cost_records` is audited). `/api/history/cost_records/{id}` requires financial visibility, and hardware visibility for hardware cost records.

## Scope

### New and changed tools

| Tool | Kind | API call | Permission |
| --- | --- | --- | --- |
| `get_service_cost_records` | read (existing) | unchanged | Financial visibility |
| `get_hardware_cost` | read | `GET /api/hardware/{id}/hardware-cost` | Financial + hardware visibility |
| `list_payment_methods` | read | `GET /api/payment-methods/` | Catalog access |
| `create_service_cost_record` | create | `POST /api/services/{id}/cost-records/` | Editor or admin + financial visibility |
| `update_service_cost_record` | update | `PUT /api/services/{id}/cost-records/{record_id}` | Editor or admin + financial visibility |
| `delete_service_cost_record` | delete | `DELETE /api/services/{id}/cost-records/{record_id}` | Editor or admin + financial visibility |
| `set_hardware_cost` | update | `PUT /api/hardware/{id}/hardware-cost` | Editor or admin + financial + hardware visibility |
| `delete_hardware_cost` | delete | `PUT /api/hardware/{id}/hardware-cost` with `amount: 0` | Editor or admin + financial + hardware visibility |
| `get_record_history` | read (existing) | add `record_type="cost_record"` mapped to `cost_records` | Financial visibility (+ hardware visibility for hardware costs) |

No backend change is required. Every tool calls an existing endpoint, so validation, role checks, archive locks, and audit attribution stay identical to the UI.

### Tool contracts

`create_service_cost_record(service_id, fiscal_year, amount, record_type, purchase_year=None, payment_method_id=None)`

- Validate UUIDs with `_uuid_arg`.
- Validate locally before the call, to give clear messages: `fiscal_year` and `purchase_year` in 1900-2100, `amount` >= 0, `record_type` in `actual | estimated | budget` (case-insensitive, sent lowercase).
- Return the cost record summary (see "Result shape").

`update_service_cost_record(service_id, record_id, fiscal_year=None, amount=None, record_type=None, purchase_year=None, payment_method_id=None)`

- Send only the arguments the caller set, with `_changes()`. Same rule as other update tools: fields cannot be cleared.
- Raise `ValueError("Pass at least one field to change")` when the body is empty.
- `notes` is never sent, so `exclude_unset` keeps existing notes.

`delete_service_cost_record(service_id, record_id)`

- Return `{"deleted": true, "id": record_id, "service_id": service_id}` on `204`.
- The API returns `204` with no body. `_api_request` currently parses JSON on every success. Change it to return `None` for `204` responses.

`get_hardware_cost(hardware_id)`

- Return the summary or `{"cost_record": null}` when the asset has no cost.

`set_hardware_cost(hardware_id, amount, purchase_year=None, fiscal_year=None)`

- Reject `amount == 0` with a message that points to `delete_hardware_cost`. The API treats 0 as delete; the tool name must not hide a delete.
- Keep the "only passed fields change" rule. `PUT` replaces `purchase_year`, so the tool first calls `GET .../hardware-cost` and fills unset `purchase_year` and `fiscal_year` from the current record.
- Docstring states that hardware cost is always `record_type = actual` and one record per asset.

`delete_hardware_cost(hardware_id)`

- Read the current cost first. If there is none, return `{"deleted": false}` and do not write.
- Otherwise send `PUT` with `{"amount": 0}` and return `{"deleted": true, "hardware_id": ...}`.

`list_payment_methods(query=None, limit=50)`

- Same filter and limit pattern as `list_vendors`. Return `id` and `name` only.

### Result shape

Reuse one `_cost_record_summary(row)` for every cost tool, and switch `get_service_cost_records` to it:

`id, service_id, hardware_id, fiscal_year, purchase_year, amount, record_type, payment_method_id, payment_method_name, recorded_at`

`notes` and `recorded_by_*` stay out, as today.

### Annotations

- Reads: `_READ_ONLY`.
- Create: `_CREATES`.
- Update and set: `_UPDATES`.
- Deletes: new `_DELETES = ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=False)`.

### Server instructions and documentation

- Change the `FastMCP(instructions=...)` text: the server cannot delete or archive catalog records; it can delete cost records, and only after the user confirms.
- `docs/integrations/mcp.md`:
  - Add the read tools to "Available read tools".
  - Add the write tools to "Available write tools", with roles.
  - Replace "the MCP server cannot delete or archive records" with the precise rule.
  - Add an example: "Add a 2027 budget of 12,000 for [service name]."
  - State that cost-record notes cannot be read or set through MCP.
- `docs/releases/next.md`: add an entry.

## Rules preserved from the API

- Viewers get `403` on every write.
- A user without financial visibility gets `403` on every cost tool.
- Archived services and archived hardware get `409` on cost writes. The tool error passes the API detail through unchanged.
- An unknown payment method returns `400 Payment method not found`.
- A cost record from another service returns `404 Cost record not found`.
- Each change appears in record history under the token owner's name.

## Out of scope

- Setting or reading cost-record notes.
- Clearing `payment_method_id` or `purchase_year` on an update.
- Bulk cost changes, cost import, and changes to cost centers or payment methods.
- Service financial fields outside cost records (`cost_center_id`, `payment_method_id` on the service).

## Tests

`mcp/tests/test_cost_tools.py`, same mocking pattern as `test_write_tools.py`:

- Create sends only set fields and normalizes `record_type`.
- Create rejects an invalid `record_type`, an out-of-range year, a negative amount, and a malformed UUID before any API call.
- Update sends a partial body; an empty update raises `ValueError`.
- Delete handles a `204` response with no body.
- `set_hardware_cost` merges the current `purchase_year` and `fiscal_year` when the caller omits them, and rejects `amount=0`.
- `delete_hardware_cost` does not write when no cost exists.
- `get_record_history(record_type="cost_record")` calls `/api/history/cost_records/{id}`.
- A `403` and a `409` from the API surface as `RuntimeError` with the API detail.
- `test_auth_header.py` still passes after the `_api_request` `204` change.

## Acceptance criteria

1. An editor with financial visibility can add, change, and delete a service cost record through MCP. The change appears in the service's Costs tab and its history.
2. The same editor can set and remove a hardware cost. The hardware detail page shows the change.
3. An editor without financial visibility, and every viewer, get a `403` message on cost writes.
4. Cost writes on archived records fail with the API's `409` message, and nothing changes.
5. `uv run --with pytest pytest -q` passes in `mcp/`, as in CI.
