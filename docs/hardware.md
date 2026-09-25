# Hardware inventory

Hardware uses one shared asset model with five types: `laptop`, `phone`, `tablet`,
`accessory`, and `peripheral`. iPhones are phones running iOS; iPads are tablets
running iPadOS. Android is available for both phones and tablets.

## Fields and behavior

Every asset has a model/name, status, optional location and assignee, notes,
attachments, history, and an optional purchase cost. Locations use the existing
Settings reference data, including for peripherals.

- Laptops: serial number, macOS/Windows/Linux, optional CPU, RAM, storage, OS version and MDM.
- Phones: serial number, Android/iOS, optional specs, OS version, MDM, IMEI,
  second IMEI and phone number.
- Tablets: serial number, Android/iPadOS/Windows/Linux, optional specs, OS version,
  MDM and cellular identifiers. Wi-Fi-only tablets need no IMEI.
- Accessories: model/name and a positive whole-number quantity (default 1).
  Serial number is optional. No device specs, OS, cellular identifiers or MDM.
- Peripherals: model/name, optional serial number and location. No device specs,
  OS, cellular identifiers or MDM. Each record represents one peripheral.

Accessory quantities represent a batch sharing one location, status and assignee.
Use separate records for batches at different locations or assigned to different
people. Purchase cost is the **total batch cost**, not a unit price; reporting
never multiplies this cost by quantity. Dashboard inventory counts use quantities,
while list and user-page record counts count records.

Supplied serial numbers remain case-insensitively unique across hardware types.
IMEIs are optional, stored as text and must contain exactly 15 ASCII digits.
Changing type in the UI clears fields that do not apply to the new type. API
updates validate the resulting record and reject incompatible combinations.
Archived assets retain the existing metadata-only edit policy; quantity changes
require unarchiving.

## API and compatibility

Canonical routes are `/api/hardware/`, `/api/hardware/search`,
`/api/hardware/{hardware_id}`, and the existing archive/unarchive, `hardware-cost`
and `cost-records` subroutes under that prefix. List requests can filter by
`hardware_type` and `archived`. Search also includes type, OS, IMEI and phone number.

Costs and financial reporting use `hardware_id`. User profiles expose
`assigned_hardware_assets`. Attachments use entity type `hardware`; history uses
entity table `hardware_assets`.

For transition, `/api/laptops/...` routes remain available and deprecated in
OpenAPI. They share the same handlers, data and permissions. Cost/report responses
retain a deprecated `laptop_id` read alias; user profiles retain
`assigned_laptops`. Attachment requests with `laptop` are normalized to `hardware`.
New integrations should use generic names. These aliases do not filter to laptops.

## Migration and deployment

Alembic revision `048` renames `laptops` to `hardware_assets` and
`cost_records.laptop_id` to `hardware_id`. Existing records become laptops with
quantity 1. UUIDs, assignments, costs and locations remain unchanged. Attachment
metadata is updated while object-storage keys stay untouched. Historical audit
rows are not rewritten; asset timelines read both old and new entity names.

Deploy the API and UI together. The API startup applies migrations as before.
Older API binaries cannot run against the renamed database schema. A database
backup should precede deployment. Downgrade refuses to discard assets or fields
that the old laptop model cannot represent.

Admin exports now include `hardware_assets.json` and `hardware_assets.csv` with
type, quantity and mobile fields. Bundled seed loading prefers
`hardware_assets.json`, falling back to legacy `laptops.json`; legacy sample laptop
identities and cost associations remain stable.

## Verification

From `backend`, run `.venv/bin/python -m unittest discover -s tests`.
From `frontend`, run `npm test`, `npm run build`, and `npm run lint`.

The opt-in database check runs only against a disposable PostgreSQL database
whose name ends in `_test`:

```sh
DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:PORT/catalogit_test \
  python -m tests.hardware_integration_check
```

Start with an empty database. The check builds revision 047, inserts representative
legacy data, upgrades, verifies a safe downgrade/re-upgrade, and exercises all
hardware types, legacy API aliases, costs, locations, assignments, permissions,
history and exports. It finally verifies that downgrade is refused once new
asset types exist. This check inserts test data and does not clean up its database.
