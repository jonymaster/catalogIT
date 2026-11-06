# Close Financial Year Design

## Goal

Give admins one guided action that closes a financial year for service costs:

1. Convert the year's `estimated` service cost records to `actual`.
2. Create next year's `estimated` record for each service, set to the sum of the closed year's actuals.

Archived services are skipped. The user reviews every change in a wizard and can edit amounts before confirming.

## Current state

- `cost_records` (`backend/app/models/cost_record.py`) stores service and hardware costs in one table. Service records have `hardware_id IS NULL`.
- `record_type` is `actual | estimated | budget` (`backend/app/schemas/cost_record.py`).
- `fiscal_year` is a plain integer. The app has no fiscal-year start month. **Fiscal year equals calendar year across the whole app** (decision, see below).
- No unique constraint on `(service_id, fiscal_year, record_type)`. A service can have many records per year (for example monthly invoices or add-ons).
- Service cost endpoints (`backend/app/routers/cost_records.py`): writes need editor or admin plus financial visibility. Writes on an archived service return `409 Archived services are read-only for cost records`.
- Archive (`POST /api/services/{id}/archive`) sets `is_active = False` and `deprecated_at = now()` together. In the data model, "deprecated" and "archived" are the same state.
- `services.status` and `service_status_id` hold user-defined status names. They do not drive archive behavior.
- Hardware cost records are one per asset (partial unique index `uq_cost_records_hardware_id`) and describe one-off purchases (`purchase_year`).
- `Service.yearly_cost` (`backend/app/models/service.py`) uses the latest `fiscal_year` that has a service cost record. It adds the most recent `actual` record and the most recent `estimated` record of that year (one record each, not sums).
- `get_audited_db` runs one transaction per request. The `after_flush` audit listener writes a history row for every changed record, attributed to the current user.

## Decisions

| Topic | Decision |
| --- | --- |
| Conversion | In place: `record_type` changes from `estimated` to `actual` on the existing row. No separate actual row. |
| Next-year estimate | One summed `estimated` record per service. |
| Budget records | Ignored. Not converted, not copied, not counted in sums. |
| Closed year | Records stay editable after closing. No period lock. |
| Fiscal year | Calendar year for the whole app. No start-month setting. |
| Year selection | Explicit year picked in the wizard. Any year up to and including the current calendar year. Future years are rejected. |
| Scope | Service cost records only (`hardware_id IS NULL`). Hardware is out of scope. |
| Archived services | Skipped completely: no conversion and no copy. This matches the existing read-only rule for cost records on archived services. |
| UI | Wizard: pick year, review and edit, confirm. |
| Permission | Admin plus financial visibility. |

## Behavior

Let **X** be the year being closed and **X+1** the next year.

### Service selection

A service takes part when all of these are true:

- `is_active = True`.
- It has at least one `actual` or `estimated` service cost record in year X.

Archived services that have `estimated` records in year X appear in the preview under "Skipped" with the reason `archived`. To include one, the user unarchives it and restarts the wizard.

### Step 1: conversion

For each participating service, every `estimated` record in year X becomes a conversion row.

- Default: converted with its current amount. The user can edit the amount in the wizard.
- **Conflict: the service already has an `actual` record in year X.** The service's `estimated` records are flagged `estimate_with_actual` and excluded by default, because converting them would usually double-count. The user can tick a row to include it. Rows left excluded stay `estimated` and unchanged.

### Step 2: next-year estimate

For each participating service, compute:

```
next_amount = round(sum(actual amounts in year X after step 1) * (1 + uplift_pct / 100), 2)
```

- Use `Decimal` throughout and round with `ROUND_HALF_UP`. Never use floats for amounts on the server.
- The sum uses the amounts after the user's edits and after conversion. Excluded estimates are not counted.
- `uplift_pct` is one optional global value in the wizard (default `0`, range `-100` to `1000`). The user can override `next_amount` per service.
- The new record has `fiscal_year = X+1`, `record_type = "estimated"`, `purchase_year = null`, and `recorded_by_id` = the current user. Notes say `Rolled over from FY{X}`.
- `payment_method_id`: if every actual record in year X for the service shares the same payment method, use it. Otherwise use `null` and flag the row `mixed_payment_methods`.
- **No copy when the service already has any service cost record in year X+1** (any type, including budget). The row is shown with the reason `next_year_exists`. This makes re-running the close for the same year safe.
- No copy when `next_amount` would be `0`. The row is shown with the reason `zero_amount`.

### Warning flags (informational)

Flags do not block. They help the user decide which amounts to edit.

| Flag | Condition | Meaning |
| --- | --- | --- |
| `estimate_with_actual` | Service has both actual and estimated records in year X | Converting may double-count. Excluded by default. |
| `added_during_year` | `services.created_at` is in year X | Year X may be a partial year, so the copied amount may be low. Not annualized. Note: imported services carry the import date. |
| `mixed_payment_methods` | Actual records in year X use different payment methods | Next-year record gets no payment method. |
| `year_not_ended` | X is the current calendar year | Costs may still change. Shown once at the top of the wizard, not per row. |

## API

New router `backend/app/routers/fiscal_year_close.py`, prefix `/api/cost-records/close-year`. Every endpoint requires `require_role("admin")` and `require_financial_view`.

### `POST /preview`

Request:

```json
{ "fiscal_year": 2026, "uplift_pct": 0 }
```

Response:

```json
{
  "fiscal_year": 2026,
  "next_fiscal_year": 2027,
  "year_not_ended": true,
  "plan_hash": "sha256:...",
  "services": [
    {
      "service_id": "...",
      "service_name": "...",
      "conversions": [
        { "record_id": "...", "amount": 1200.00, "include": true, "flags": [] }
      ],
      "existing_actual_total": 0.00,
      "next_year": {
        "action": "create",
        "amount": 1200.00,
        "payment_method_id": "...",
        "skip_reason": null,
        "flags": []
      }
    }
  ],
  "skipped": [
    { "service_id": "...", "service_name": "...", "reason": "archived" }
  ],
  "totals": { "converted": 0.00, "next_year": 0.00 }
}
```

- `next_year.action` is `create` or `skip`. `skip_reason` is `next_year_exists` or `zero_amount`.
- `plan_hash` is a SHA-256 over the sorted `(id, service_id, fiscal_year, record_type, amount)` of every service cost record in years X and X+1, plus the `is_active` value of each service involved. It does not depend on user edits.
- Errors: `400` when `fiscal_year` is greater than the current calendar year or outside 1900-2100.

### `POST /execute`

Request:

```json
{
  "fiscal_year": 2026,
  "plan_hash": "sha256:...",
  "uplift_pct": 0,
  "conversions": [
    { "record_id": "...", "include": true, "amount": 1250.00 }
  ],
  "next_year": [
    { "service_id": "...", "include": true, "amount": 1300.00 }
  ]
}
```

- Overrides are optional. Rows that are not listed use the preview defaults.
- Order of operations, all in one transaction (all or nothing):
  1. Lock the rows of every active service that has a service cost record in year X (`SELECT ... FROM services ... FOR UPDATE`, ordered by id).
  2. Lock the service cost records of years X and X+1 (`SELECT ... FOR UPDATE`, ordered by id).
  3. Recompute the plan and its hash. Take the locks before hashing, so that a second close running at the same time waits, then fails the hash check.
  4. On a hash mismatch, return `409` with `detail = "Cost records changed since preview; reload the preview"` and change nothing.
  5. Apply the overrides, convert, create, and insert the batch row.
- The server rebuilds the plan from the database and applies the overrides on top. It never trusts client-side totals. An override for a record or service that is not in the plan returns `400`. A negative amount returns `400`.
- `next_amount` is recomputed on the server from the final conversion amounts, unless the request overrides it explicitly.
- When the final plan converts nothing and creates nothing, return `400` with `detail = "Nothing to close for this year"` and create no batch.
- Known race, accepted: a single cost record created by another user between steps 2 and 5 for year X+1 is not seen. The worst outcome is one extra next-year record, which the user can delete.
- Response: `{ "batch_id": "...", "converted_count": n, "created_count": m, "totals": {...} }`.

### `POST /revert`

Request: `{ "batch_id": "..." }`

- Locks the batch row and its records (`FOR UPDATE`).
- Converted records with this batch id go back to `estimated` and keep their current amount. Their batch fields are cleared.
- Created records with this batch id are deleted. Records already deleted by hand are ignored.
- Amounts edited during the wizard are not restored. Conversion keeps no copy of the original estimate amount; the per-record audit history still has it.
- Records edited by hand after the close are still reverted. The revert confirmation in the UI shows how many of the batch's records have history newer than the batch's `created_at`. `GET /batches` returns this count as `changed_since_close`.
- When a service touched by the batch is now archived, return `409` with `detail = "Unarchive these services before reverting: ..."` (service names) and change nothing. This keeps the read-only rule for archived services.
- Sets `reverted_at` and `reverted_by_id` on the batch row. The row is kept as history.
- `404` when the batch does not exist. `409` when the batch is already reverted.
- Revert is allowed for any batch that is not yet reverted, not only the latest one.

### `GET /batches`

Lists past closes for the wizard's "Previous closes" panel, newest first. It reads the `fiscal_year_close_batches` table and returns every column below plus the closing user's name and `changed_since_close`.

## Data model

Migration `050_fiscal_year_close_batches.py`:

New table `fiscal_year_close_batches`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `UUID` primary key | The batch id. |
| `fiscal_year` | `INTEGER NOT NULL`, indexed | Year closed (X). |
| `uplift_pct` | `NUMERIC(7,2) NOT NULL` | Global uplift used. |
| `converted_count` | `INTEGER NOT NULL` | |
| `created_count` | `INTEGER NOT NULL` | |
| `converted_total` | `NUMERIC(14,2) NOT NULL` | Sum of converted amounts after overrides. |
| `next_year_total` | `NUMERIC(14,2) NOT NULL` | Sum of created amounts. |
| `created_at` | `TIMESTAMP NOT NULL`, server default `now()` | |
| `created_by_id` | `UUID NULL`, FK `users.id` `ON DELETE SET NULL` | |
| `reverted_at` | `TIMESTAMP NULL` | |
| `reverted_by_id` | `UUID NULL`, FK `users.id` `ON DELETE SET NULL` | |

New columns on `cost_records`:

| Column | Type | Notes |
| --- | --- | --- |
| `rollover_batch_id` | `UUID NULL`, FK `fiscal_year_close_batches.id` `ON DELETE SET NULL`, indexed | Set on records converted or created by a close. |
| `rollover_action` | `VARCHAR(20) NULL` | `converted` or `created`. Revert needs it to choose between flipping back and deleting. |

- Register the new model in `backend/app/models/__init__.py`.
- Keep both new `cost_records` columns visible in history. They explain the change.
- Decide during implementation whether the audit listener covers the new table. Default: yes, if registering it is one line; the batch row is low volume.
- Closing the same year twice is allowed. The second run usually finds nothing to do, because of the `next_year_exists` rule and because converted records are no longer `estimated`.
- Check the admin export (`backend/app/services/admin_export_bundle.py`, `admin_export_seed_json.py`) and `backend/scripts/seed_from_json.py`. Either include the new table and columns, or confirm that leaving them out is harmless (the batch link is lost on import).

## Audit

The `after_flush` listener already writes one history row per converted, created, or deleted record, attributed to the admin. No new audit mechanism. The batch row records who closed the year, when, and the totals. The batch id on each record links the history rows to the batch.

## Dashboard and `yearly_cost`

After a close, the latest service cost year becomes X+1. `Service.yearly_cost` then shows next year's estimate in the service list and service detail. The dashboard and costs report pick the year themselves, so they are not affected.

This is accepted: after a close, "yearly cost" means the forward-looking cost. Document it in the user docs.

Known existing quirk, not changed here: `yearly_cost` adds one actual and one estimated record (the most recent of each), not sums. With one summed estimate per service in X+1, the result is correct for the year after a close.

## Frontend

- Entry point: a "Close financial year" button on the Costs report page (`/costs`). Visible only to admins with financial visibility.
- Route: `/costs/close-year` (new page `frontend/src/pages/CloseFiscalYear.tsx`), wrapped in `RequireFinancialView` like `/costs`, plus an admin check. Non-admins are redirected to `/costs`.
- After execute or revert, invalidate the cached queries for cost records, services, the dashboard, and the costs report.

Steps:

1. **Pick year.** Year picker, default the current calendar year, future years disabled. Optional uplift %. When the year is the current one, show the `year_not_ended` warning. A "Previous closes" panel lists batches with a revert action.
2. **Review.** One row per service, with expandable conversion rows:
   - Columns: service, estimated records to convert (editable amount, include checkbox), existing actual total, next-year amount (editable, include checkbox), flags.
   - A "Skipped" section lists archived services and next-year skips with reasons.
   - Totals update live as the user edits. The server recomputes on execute.
   - Filter: "Only rows with flags".
3. **Confirm.** Summary of counts and totals. The user types the year to enable the confirm button. A `409` hash mismatch returns the user to step 2 with a reloaded preview.
4. **Done.** Counts, batch id, link to the Costs report for year X+1, and a revert button.

## MCP

Add one read-only tool, `preview_close_fiscal_year(fiscal_year, uplift_pct=0)`, that calls `POST /preview` (the endpoint changes nothing). No execute or revert tool in this change. Revisit after the project-wide authorization review planned in the bulk actions work stream.

## Tests

Backend (`backend/tests/test_fiscal_year_close.py`):

- Conversion flips `record_type` and applies amount overrides.
- Next-year record is the sum of actuals, with uplift and rounding.
- Archived service is skipped completely: no conversion, no copy.
- `estimate_with_actual` rows are excluded by default and converted when included.
- `next_year_exists` skips the copy (also when X+1 has only a budget record).
- `zero_amount` skips the copy.
- Budget records are untouched and not counted.
- Hardware cost records are untouched.
- Payment method is copied when shared and set to `null` when mixed.
- Future year returns `400`.
- Hash mismatch returns `409` and changes nothing.
- Override for an unknown record returns `400`.
- Re-running the same year creates nothing new. When the plan is empty, execute returns `400` and no batch row exists.
- Negative override amount returns `400`.
- Batch row holds the correct counts, totals, user, and uplift.
- Revert flips converted rows back, deletes created rows, and sets `reverted_at`.
- Revert of an already reverted batch returns `409`. Revert of an unknown batch returns `404`.
- Revert when a touched service is now archived returns `409` and changes nothing.
- Revert ignores created records already deleted by hand.
- `GET /batches` returns batches newest first, with `changed_since_close`.
- Non-admin and missing financial visibility return `403`.
- History rows exist for every changed record.

Frontend (Vitest): wizard step flow, live totals, typed-year confirm gate, and `409` handling.

MCP: `preview_close_fiscal_year` maps arguments and errors like the existing cost tools.

## Docs

- `README.md`: a short "Closing a financial year" entry in the features section. Cover the rules, flags, revert, and the `yearly_cost` effect. The repo has no separate cost user docs.
- `docs/integrations/mcp.md`: add `preview_close_fiscal_year` to the tool list.
- `docs/releases/next.md` entry.

## Delivery

One PR on a feature branch, in this order:

1. Migration and backend service module (`plan`, `execute`, `revert`) with tests.
2. Router and API tests.
3. Frontend wizard.
4. MCP preview tool and docs.

## Out of scope

- Hardware cost rollover.
- Period lock on closed years.
- Fiscal years that do not start in January.
- Annualizing partial-year costs.
- Rolling over budget records.
- MCP execute and revert tools.
