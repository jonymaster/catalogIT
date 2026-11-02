# Bulk Edit and Bulk Actions Design

## Goal

Let users select many Services, Hardware assets, or Users in a list and change them in one operation:

- **Bulk edit**: set shared fields such as status, category, location, tags, or role.
- **Bulk actions**: archive (deactivate for users), unarchive (activate for users), and delete.

Every bulk operation applies the same rules as the single-record endpoints. A bulk operation is all-or-nothing: if one record fails a rule, the operation stops, no record changes, and the UI shows which record failed and why.

## Current rules to preserve

### Services (`backend/app/routers/services.py`)

- Update, archive, unarchive: editor or admin.
- Delete: admin only. The service must be archived first (`409 Service must be archived before it can be deleted`). Delete also removes attachments (database rows and S3 objects).
- Archived services accept only `description`, `point_of_contact`, `notes`, and `status` changes (`400`).
- At most `MAX_TAGS_PER_SERVICE` (5) tags per service. Unknown tag, status, vendor, category, or classification ids return `400`.
- Assignee count cannot exceed `total_seats`.
- Financial fields are scrubbed from responses without financial visibility.

### Hardware (`backend/app/routers/hardware_assets.py`)

- Every endpoint requires hardware visibility.
- Update, archive, unarchive: editor or admin. Delete: admin only, archived first.
- Archived hardware accepts only `notes`, `status`, `hardware_status_id`, `hardware_location_id`, and `mdm_connected`.
- The merged record is validated with `HardwareAssetCreate`. For example, `operating_system` must be valid for the `hardware_type`.

### Users (`backend/app/routers/users.py`)

- Every endpoint: admin only. Users have no archive; `is_active` is the equivalent.
- An admin cannot demote, deactivate, or delete their own account.
- The last admin cannot be deleted.
- Identity fields (`email`, `first_name`, `last_name`, `display_name`, `department`) can change only for `provisioning_source = local`.
- Delete fails when the user owns services, is assigned to services, or holds hardware.
- Role `admin` removes explicit permission rows. Other roles keep `permissions` (`financial_view`, `hardware_view`).
- SCIM can set `is_active` again on its next sync.

### Transactions and audit

- `get_audited_db` opens one session per request and commits after the handler. One request is one transaction.
- The `after_flush` audit listener writes a history row for each changed record, attributed to the current user. Bulk operations get per-record history with no extra work.

## Design

### Principle: one rule set, two entry points

Move the body of each single-record handler into a plain async function. The single endpoint and the bulk endpoint both call it. This keeps bulk logic identical to single-record logic.

| Entity | New functions | Location |
| --- | --- | --- |
| Service | `apply_service_update(db, service, update_data)`, `archive_service_record(service)`, `unarchive_service_record(service)`, `prepare_service_delete(db, service) -> list[str]` | `backend/app/routers/services.py` (or `backend/app/domain/services.py` if the file gets too long) |
| Hardware | `apply_hardware_update(db, hardware, update_data)`, `archive_hardware_record(hardware)`, `unarchive_hardware_record(hardware)`, `prepare_hardware_delete(db, hardware) -> list[str]` | `backend/app/routers/hardware_assets.py` |
| User | `apply_user_update(db, user, data, current_user)`, `check_user_deletable(db, user, current_user)`, `delete_user_record(db, user, current_user)` | `backend/app/routers/users.py` |

The functions raise the same `HTTPException`s as today. The single-record endpoints must keep their current responses. Run the existing tests before and after the extraction.

`prepare_*_delete` returns the S3 storage keys and deletes only the database rows. See "Attachments on bulk delete".

### API

One endpoint per entity. The body uses an `action` discriminator:

```
POST /api/services/bulk
POST /api/hardware/bulk
POST /api/users/bulk
```

These paths do not collide with existing routes: `POST /api/services/` and `POST /api/services/{id}/archive` are the only other `POST` routes. Register the bulk route before the `/{id}` routes anyway, to keep matching order obvious.

Request:

```json
{
  "action": "update",
  "ids": ["<uuid>", "<uuid>"],
  "changes": { "service_status_id": "<uuid>", "add_tag_ids": ["<uuid>"] }
}
```

`action` values:

| Entity | `update` | `archive` | `unarchive` | `delete` |
| --- | --- | --- | --- | --- |
| Services | editor, admin | editor, admin | editor, admin | admin |
| Hardware | editor, admin + hardware visibility | same | same | admin + hardware visibility |
| Users | admin (`archive` = deactivate, `unarchive` = activate) | admin | admin | admin |

`unarchive` is included so a bulk archive can be undone in one step.

Batch rules, checked before any record changes:

- `ids`: 1 to 500 unique UUIDs. Remove duplicates. More than 500 returns `422`.
- `changes`: required for `update`, forbidden for other actions. An empty `changes` returns `422`.
- Every id must exist. Otherwise return `404` and list the missing ids.
- Role and permission dependencies apply per action, as in the table.

Processing:

1. Load all records with `SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE`. The fixed order prevents deadlocks between two concurrent bulk requests.
2. Process records in the order of `ids` in the request, so the failing record is the same on every retry.
3. Call the shared function for each record. On the first `HTTPException`, stop, roll back the transaction, and return the error in the shape below.
4. Flush once after the loop to surface constraint errors such as `IntegrityError`, then commit.

Success response, `200`:

```json
{ "action": "update", "count": 12, "ids": ["..."] }
```

The UI reloads the list after success, so the response does not include the records.

Failure response. Keep the HTTP status of the underlying rule (`400`, `403`, `404`, `409`, `422`):

```json
{
  "detail": {
    "message": "Archived services only allow updates to description, point of contact, notes, and status",
    "record_id": "<uuid>",
    "record_label": "Slack",
    "position": 4,
    "applied": 0
  }
}
```

- `record_label`: service name, hardware serial number or model name, or user email.
- `applied` is always 0 and tells API clients that the operation rolled back.
- Batch-level errors (size, missing ids, role) have no `record_id`.

### `changes` schemas

Each schema is a new Pydantic model with `extra="forbid"`. Every field is optional. A field that is not sent stays unchanged. A field sent as `null` clears the value, but only where the single-record endpoint allows `null`. Bulk edit excludes free-text and unique fields (name, serial number, email, notes).

`ServiceBulkChanges`:

| Field | Notes |
| --- | --- |
| `service_status_id` | Sets `status` too, as the single update does. Allowed on archived services. |
| `category_id` | Nullable |
| `classification_id` | Nullable |
| `vendor_id` | Nullable |
| `environment` | Nullable |
| `criticality` | `Critical`, `High`, `Medium`, `Low`, or `null` |
| `add_tag_ids`, `remove_tag_ids` | Computed per service: current tags minus removes, plus adds. Then passed as `tag_ids`, so the 5-tag limit applies. The same id in both lists returns `422`. |
| `renewal_reminders_enabled` | Boolean |
| `sso_integrated`, `scim_enabled` | Boolean |

`HardwareBulkChanges`:

| Field | Notes |
| --- | --- |
| `hardware_status_id` | Allowed on archived hardware |
| `hardware_location_id` | Nullable. Allowed on archived hardware. |
| `mdm_connected` | Boolean. Allowed on archived hardware. |
| `operating_system` | Nullable. The merged record is validated per `hardware_type`, so a mixed selection can fail. |

Hardware has no tags or category. `hardware_type` is excluded because a type change affects quantity, serial number, and cellular identifiers per record.

`UserBulkChanges`:

| Field | Notes |
| --- | --- |
| `role` | `admin`, `editor`, `viewer`. Self-demotion fails. |
| `department` | Nullable. Fails for SCIM or OIDC users. |
| `receive_renewal_notifications` | Boolean |
| `add_permissions`, `remove_permissions` | Slugs from `ALLOWED_USER_PERMISSION_SLUGS`. Merged per user, then passed as `permissions`. Ignored for admins, as today. |

User activation uses the `archive` and `unarchive` actions, not `changes.is_active`. Activation then follows the same rules as archive in the UI and in permissions.

### Attachments on bulk delete

`delete_entity_attachments` deletes S3 objects before the transaction commits. In a bulk delete, a failure on record 30 would roll back the database but leave records 1 to 29 without their files. Bulk delete must avoid this:

1. Collect storage keys and delete the database rows for every record.
2. Commit. Bulk routes use `Depends(get_audited_db, scope="function")` and commit explicitly before step 3.
3. Delete the S3 objects. A failure here only logs a warning with the orphan keys; the records are already deleted.

Change the single-record delete to use the same order. It has the same problem on a smaller scale.

### Frontend

#### `DataTable` selection

`frontend/src/components/DataTable.tsx` gets opt-in selection props:

```ts
selectable?: boolean;
getRowId?: (row: T) => string;
selectedIds?: ReadonlySet<string>;
onSelectionChange?: (ids: Set<string>) => void;
```

- A checkbox column at the start. The header checkbox selects or clears all rows that match the current filters, and shows the indeterminate state for a partial selection.
- Shift-click selects a range.
- A checkbox click does not trigger row navigation. The existing interactive-element guard already covers `input`.
- When filters change, remove ids that are no longer visible. A hidden record must never be in a bulk operation.
- Clear the selection when the Active/Archived view changes and after a successful bulk operation.
- Do not show the selection column to users with no bulk action: viewers on Services and Hardware, and non-admins on Users.

#### Bulk action bar

New `frontend/src/components/BulkActionBar.tsx`. It is a sticky bar above the table, visible when one or more rows are selected:

`12 selected · Edit fields · Archive · Delete · Clear selection`

| Page | Active view | Archived view |
| --- | --- | --- |
| Services (`Services.tsx`) | Edit fields, Archive | Edit status, Unarchive, Delete (admin) |
| Hardware (`Hardware.tsx`) | Edit fields, Archive | Edit status/location/MDM, Unarchive, Delete (admin) |
| Users (`Users.tsx`) | Edit fields, Deactivate, Activate, Delete | n/a (single list) |

Delete appears in the active view only when the API would accept it: never for services or hardware, which must be archived first.

#### Bulk edit dialog

New `frontend/src/components/BulkEditDialog.tsx`, driven by a per-entity field config:

- One row per field, with three modes: **Leave unchanged** (default), **Set to** (a select from reference data), and **Clear** (only for nullable fields).
- Tags: "Add tags" and "Remove tags" pickers that reuse `TagPicker`.
- Permissions: "Grant" and "Revoke" checkboxes.
- The submit button is disabled while every field is "Leave unchanged".
- The summary line reads: "Change 2 fields on 12 services".

#### Confirmation and results

- Archive, deactivate: a confirmation dialog with the count and the first 10 record labels.
- Delete: a confirmation dialog with the count, the record labels, and an "This cannot be undone" warning. The user must type the count to enable the button.
- Success: a toast ("12 services archived"), a list reload, and a cleared selection.
- Failure: an inline error in the dialog, for example: "Nothing was changed. 'Slack' (4 of 12): A service can have at most 5 tags." The selection is kept so the user can fix it and retry. A "Select only this record" link helps the user inspect the failing record.

## Out of scope

- Bulk changes to owners, assignees, notification recipients, cost centers, payment methods, contracts, renewal settings, and hardware assignment.
- Bulk operations through MCP. The MCP documentation keeps the "no bulk changes" statement.
- Best-effort mode (apply valid records, skip invalid ones) and a dry-run preview. A future `dry_run: true` flag fits this API: run every check, roll back, and return all failures.
- Undo beyond unarchive and activate.
- Bulk operations on vendors, tags, and other reference data.

## Tests

Backend (`uv run --with pytest pytest -q`, as in CI), new `backend/tests/test_bulk_services.py`, `test_bulk_hardware.py`, `test_bulk_users.py`:

- The single-record endpoints return the same results after the extraction. The existing `test_service_patch.py`, `test_archive_policies.py`, `test_user_deletion.py`, and `test_validation_guardrails.py` pass unchanged.
- Success: N records updated, and N history entries attributed to the actor.
- All-or-nothing: a batch of three where record 2 breaks a rule (archived service with a category change, a sixth tag, an OS that does not match the hardware type, self-demotion, a user who owns services). Verify the response `record_id` and `position`, and that records 1 and 3 did not change.
- Delete of an active service or hardware asset in the batch fails with `409`, and nothing is deleted.
- Role checks: an editor cannot bulk delete; an editor without hardware visibility gets `403` on hardware bulk; a non-admin gets `403` on user bulk.
- Batch validation: empty ids, more than 500 ids, duplicate ids (removed), unknown ids (`404`), `changes` with `archive` (`422`), unknown `changes` keys (`422`).
- Attachments: S3 deletion runs only after commit. A failure in the batch deletes no S3 objects.

Frontend (Vitest):

- `DataTable` selection: header checkbox, shift-range, pruning after a filter change, no navigation on checkbox click.
- `BulkEditDialog` builds the expected `changes` payload from each field mode.
- The error state renders the API `detail.message`, `record_label`, and `position`.

## Delivery

Ship in three pull requests, in this order:

1. Backend extraction of shared functions, with no behavior change.
2. Bulk endpoints and tests.
3. Frontend selection, action bar, dialogs, and documentation (`README.md` feature list, `docs/releases/next.md`).

After PR 3 merges, and before the release is tagged, run a whole-project authorization and data-exposure review as a multi-agent workflow. Use one reviewer per dimension across all routers, and an independent verification pass for each finding:

- Role and permission checks on every endpoint, including the new bulk endpoints.
- Financial fields that leak outside `_scrub_financial`: dashboard, admin export, history values, user directory.
- Hardware data visible without hardware visibility: user profile, history.
- Archived-record locks bypassed through side routes: attachments, assignee and owner removal, cost endpoints.
- MCP results that contain fields the documentation says are excluded.
- Audit coverage: tables missing from `AUDITED_TABLES`, and writes that do not use `get_audited_db`.
- OIDC, SCIM, and API token authentication paths.

## Acceptance criteria

1. An editor selects 20 active services, sets status and category, and adds a tag in one operation. History shows 20 entries under the editor's name.
2. If any of the 20 already has 5 tags, nothing changes, and the UI names that service.
3. An admin selects archived services and hardware and deletes them in one operation. A selection that contains an active record is rejected with no change.
4. An admin deactivates 10 users in one operation. A selection that contains the admin's own account is rejected with no change.
5. Viewers see no selection checkboxes. API calls from a viewer token return `403`.
