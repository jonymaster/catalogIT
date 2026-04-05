#!/usr/bin/env python3
"""Bulk-load JSON seed files from this directory into a CatalogIT deployment via HTTP API.

Reads the same shapes as ``backend/scripts/seed_from_json.py`` (vendors, categories,
payment_methods, users, services, cost_records), plus optional ``laptops.json`` for
``POST /api/laptops/``. ``service_history.json`` is not loaded (no public write API).

Environment variables
---------------------
CATALOGIT_BASE_URL   API origin; default ``http://127.0.0.1:8000`` (set to your deployment).
CATALOGIT_API_TOKEN  Bearer token for API calls (admin or editor where required).
CATALOGIT_SCIM_TOKEN Optional. If set, missing users from ``users.json`` are created
                     via ``POST /scim/v2/Users`` (SCIM uses a separate static token).
CATALOGIT_USER_AGENT Optional. Override the ``User-Agent`` header if a CDN filters clients.

Do not commit API tokens or environment files containing secrets.

Usage::

    export CATALOGIT_API_TOKEN='...'
    export CATALOGIT_BASE_URL='https://your-api.example.com'   # if not local
    python3 bulk_load_api.py
    python3 bulk_load_api.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

# Same mapping as backend/scripts/seed_from_json.py for service_type -> ServiceStatus name
STATUS_NAME_MAP = {
    "contract": "Contract",
    "self_managed": "Self-Managed",
    "self-managed": "Self-Managed",
    "active": "Active",
    "under_review": "Under Review",
    "under-review": "Under Review",
    "under review": "Under Review",
    "deprecated": "Deprecated",
    "trial": "Trial",
}

ENTERPRISE_USER_SCHEMA = "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"

_DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

_NS = uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

_DEFAULT_BASE_URL = "http://127.0.0.1:8000"


def _pred_uuid(table: str, seed_id: int) -> str:
    return str(uuid.uuid5(_NS, f"{table}:{seed_id}"))


def _normalize_status_name(raw: str | None) -> str:
    if not raw:
        return "Active"
    normalized = raw.strip()
    if not normalized:
        return "Active"
    lookup_key = normalized.lower().replace(" ", "_")
    return STATUS_NAME_MAP.get(lookup_key, normalized)


def _service_status_raw(row: dict[str, Any]) -> str | None:
    """Seed files may use ``status`` (DB seed) or ``service_type`` (older exports)."""
    v = row.get("status")
    if v is not None and str(v).strip() != "":
        return str(v)
    v = row.get("service_type")
    if v is not None and str(v).strip() != "":
        return str(v)
    return None


def _load_json(seed_dir: Path, name: str) -> list[dict[str, Any]]:
    path = seed_dir / name
    if not path.exists():
        print(f"  [skip] missing file: {path}", file=sys.stderr)
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class ApiClient:
    def __init__(
        self,
        base_url: str,
        *,
        api_token: str,
        scim_token: str | None,
        dry_run: bool,
        user_agent: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.scim_token = scim_token
        self.dry_run = dry_run
        self.user_agent = (user_agent or _DEFAULT_USER_AGENT).strip() or _DEFAULT_USER_AGENT
        self._ctx = ssl.create_default_context()

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        use_scim_token: bool = False,
    ) -> Any:
        url = self.base_url + path
        if self.dry_run and method not in ("GET", "HEAD"):
            print(f"  [dry-run] {method} {path}")
            if body is not None:
                print(f"    {json.dumps(body, indent=2)[:2000]}")
            return None

        payload = json.dumps(body).encode("utf-8") if body is not None else None
        req = Request(url, data=payload if method not in ("GET", "HEAD") else None, method=method)
        req.add_header("Accept", "application/json")
        req.add_header("User-Agent", self.user_agent)
        req.add_header("Accept-Language", "en-US,en;q=0.9")
        if payload is not None:
            req.add_header("Content-Type", "application/json")
        token = self.scim_token if use_scim_token else self.api_token
        if not token:
            raise RuntimeError("Missing token for request")
        req.add_header("Authorization", f"Bearer {token}")

        try:
            with urlopen(req, context=self._ctx, timeout=120) as resp:
                raw = resp.read().decode("utf-8")
                if resp.status == 204 or not raw.strip():
                    return None
                return json.loads(raw)
        except HTTPError as e:
            detail = e.read().decode("utf-8")
            raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {detail}") from e

    def get_json(self, path: str) -> Any:
        return self._request("GET", path)

    def post_json(self, path: str, body: dict[str, Any], *, scim: bool = False) -> Any:
        return self._request("POST", path, body=body, use_scim_token=scim)


def _index_by_lower_name(rows: list[dict[str, Any]], key: str = "name") -> dict[str, str]:
    out: dict[str, str] = {}
    for row in rows:
        name = row.get(key)
        if name is not None:
            out[str(name).strip().lower()] = str(row["id"])
    return out


def _index_classifications(rows: list[dict[str, Any]]) -> dict[str, str]:
    return {str(r["slug"]).lower(): str(r["id"]) for r in rows if r.get("slug")}


def _index_statuses(rows: list[dict[str, Any]]) -> dict[str, str]:
    return {str(r["name"]).strip().lower(): str(r["id"]) for r in rows if r.get("name")}


def _split_name(full: str) -> tuple[str, str]:
    parts = full.strip().split(None, 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def run(seed_dir: Path, client: ApiClient) -> int:
    vendors_rows = _load_json(seed_dir, "vendors.json")
    categories_rows = _load_json(seed_dir, "categories.json")
    payment_rows = _load_json(seed_dir, "payment_methods.json")
    users_rows = _load_json(seed_dir, "users.json")
    services_rows = _load_json(seed_dir, "services.json")
    cost_rows = _load_json(seed_dir, "cost_records.json")
    laptops_rows = _load_json(seed_dir, "laptops.json")

    if client.dry_run:
        print("Dry run: no HTTP writes.")
    print(f"Seed directory: {seed_dir}")

    # --- Reference data already on server
    existing_vendors = client.get_json("/api/vendors/") or []
    existing_categories = client.get_json("/api/categories/") or []
    existing_payment = client.get_json("/api/payment-methods/") or []
    existing_statuses = client.get_json("/api/service-statuses/") or []
    existing_classifications = client.get_json("/api/service-classifications/") or []
    existing_users = client.get_json("/api/settings/users/") or []
    existing_services = client.get_json("/api/services/") or []
    existing_laptops = client.get_json("/api/laptops/") or []

    vendor_by_name = _index_by_lower_name(existing_vendors)
    category_by_name = _index_by_lower_name(existing_categories)
    payment_by_name = _index_by_lower_name(existing_payment)
    status_by_name = _index_statuses(existing_statuses)
    classification_by_slug = _index_classifications(existing_classifications)
    user_by_email = {str(u["email"]).lower(): str(u["id"]) for u in existing_users}
    service_by_name = _index_by_lower_name(existing_services)
    laptop_by_serial = {
        str(r.get("serial_number", "")).strip().lower(): str(r["id"])
        for r in existing_laptops
        if r.get("serial_number")
    }

    # --- Ensure service statuses referenced by seed services
    needed_status_names: set[str] = set()
    for r in services_rows:
        needed_status_names.add(_normalize_status_name(_service_status_raw(r)))
    for name in sorted(needed_status_names):
        key = name.lower()
        if key in status_by_name:
            continue
        print(f"  Creating service status: {name}")
        created = client.post_json(
            "/api/service-statuses/",
            {"name": name, "description": "Imported from seed data."},
        )
        if created and created.get("id"):
            status_by_name[key] = str(created["id"])

    # --- Vendors / categories / payment methods (match by name, else POST)
    vendor_seed_to_id: dict[int, str] = {}

    def ensure_vendor(name: str) -> str | None:
        lk = name.strip().lower()
        if lk in vendor_by_name:
            return vendor_by_name[lk]
        print(f"  Creating vendor: {name}")
        created = client.post_json("/api/vendors/", {"name": name})
        if not created:
            return None
        vid = str(created["id"])
        vendor_by_name[lk] = vid
        return vid

    for r in vendors_rows:
        vid = ensure_vendor(r["name"])
        if not vid and client.dry_run:
            vid = _pred_uuid("vendor", int(r["id"]))
        if vid:
            vendor_seed_to_id[int(r["id"])] = vid

    category_seed_to_id: dict[int, str] = {}

    def ensure_category(name: str, description: str | None) -> str | None:
        lk = name.strip().lower()
        if lk in category_by_name:
            return category_by_name[lk]
        print(f"  Creating category: {name}")
        body: dict[str, Any] = {"name": name}
        if description:
            body["description"] = description
        created = client.post_json("/api/categories/", body)
        if not created:
            return None
        cid = str(created["id"])
        category_by_name[lk] = cid
        return cid

    for r in categories_rows:
        cid = ensure_category(r["name"], r.get("description"))
        if not cid and client.dry_run:
            cid = _pred_uuid("category", int(r["id"]))
        if cid:
            category_seed_to_id[int(r["id"])] = cid

    payment_seed_to_id: dict[int, str] = {}

    def ensure_payment(name: str, method_type: str) -> str | None:
        lk = name.strip().lower()
        if lk in payment_by_name:
            return payment_by_name[lk]
        print(f"  Creating payment method: {name}")
        created = client.post_json(
            "/api/payment-methods/",
            {"name": name, "method_type": method_type or "other"},
        )
        if not created:
            return None
        pid = str(created["id"])
        payment_by_name[lk] = pid
        return pid

    for r in payment_rows:
        pid = ensure_payment(r["name"], r.get("method_type") or "")
        if not pid and client.dry_run:
            pid = _pred_uuid("payment_method", int(r["id"]))
        if pid:
            payment_seed_to_id[int(r["id"])] = pid

    # --- Users: match existing; optional SCIM create
    user_seed_to_id: dict[int, str] = {}
    for r in users_rows:
        email = str(r["email"]).lower()
        if email in user_by_email:
            user_seed_to_id[int(r["id"])] = user_by_email[email]
            continue
        if not client.scim_token:
            if client.dry_run:
                user_seed_to_id[int(r["id"])] = _pred_uuid("user", int(r["id"]))
                continue
            print(
                f"  [warn] No user for {email}; set CATALOGIT_SCIM_TOKEN to create via SCIM, "
                "or provision users first. Owner links for this user will be skipped.",
                file=sys.stderr,
            )
            continue
        first, last = _split_name(r.get("name") or "")
        dept = r.get("department")
        scim_body: dict[str, Any] = {
            "schemas": [
                "urn:ietf:params:scim:schemas:core:2.0:User",
                ENTERPRISE_USER_SCHEMA,
            ],
            "userName": r["email"],
            "name": {"givenName": first, "familyName": last},
            "displayName": r.get("name") or "",
            "emails": [{"value": r["email"], "primary": True}],
            "active": True,
            "externalId": f"seed:{r['email']}",
            ENTERPRISE_USER_SCHEMA: {"department": dept} if dept else {},
        }
        print(f"  SCIM create user: {email}")
        created = client.post_json("/scim/v2/Users", scim_body, scim=True)
        if client.dry_run:
            uid = _pred_uuid("user", int(r["id"]))
            user_by_email[email] = uid
            user_seed_to_id[int(r["id"])] = uid
        elif created and created.get("id"):
            uid = str(created["id"])
            user_by_email[email] = uid
            user_seed_to_id[int(r["id"])] = uid

    # Refresh user map if we created via SCIM in non-dry-run
    if client.scim_token and not client.dry_run:
        existing_users = client.get_json("/api/settings/users/") or []
        user_by_email = {str(u["email"]).lower(): str(u["id"]) for u in existing_users}
        for r in users_rows:
            email = str(r["email"]).lower()
            if email in user_by_email:
                user_seed_to_id[int(r["id"])] = user_by_email[email]

    # --- Services
    service_seed_to_id: dict[int, str] = {}

    for r in services_rows:
        name = r["name"]
        lk = name.strip().lower()
        if lk in service_by_name:
            print(f"  [skip] service already exists: {name}")
            service_seed_to_id[int(r["id"])] = service_by_name[lk]
            continue

        vid = vendor_seed_to_id.get(int(r["vendor_id"]))
        cid = category_seed_to_id.get(int(r["category_id"]))
        pid = payment_seed_to_id.get(int(r["payment_method_id"]))
        if not vid or not cid or not pid:
            print(f"  [error] Missing FK for service {name!r}; check vendors/categories/payment_methods.", file=sys.stderr)
            continue

        slug = r.get("classification")
        classification_id = classification_by_slug.get(str(slug).lower()) if slug else None
        if slug and not classification_id:
            print(
                f"  [error] Unknown classification slug {slug!r} for service {name!r}. "
                "Ensure migrations / reference data exist on the server.",
                file=sys.stderr,
            )
            continue

        status_str = _normalize_status_name(_service_status_raw(r))
        owner_uuids: list[str] = []
        for oid in r.get("owner_ids") or []:
            uid = user_seed_to_id.get(int(oid))
            if uid:
                owner_uuids.append(uid)
            else:
                print(
                    f"  [warn] Owner seed id {oid} has no API user for service {name!r}; skipping owner.",
                    file=sys.stderr,
                )

        body: dict[str, Any] = {
            "name": name,
            "status": status_str,
            "billing_schedule": r.get("billing_schedule") or "",
            "owner_ids": owner_uuids,
            "vendor_id": vid,
            "category_id": cid,
            "payment_method_id": pid,
            "scim_enabled": bool(r.get("scim_enabled", False)),
            "criticality": r.get("criticality"),
            "nonprofit_pricing": bool(r.get("nonprofit_pricing", False)),
        }
        if classification_id:
            body["classification_id"] = classification_id

        print(f"  Creating service: {name}")
        created = client.post_json("/api/services/", body)
        if client.dry_run:
            sid = _pred_uuid("service", int(r["id"]))
            service_seed_to_id[int(r["id"])] = sid
            service_by_name[lk] = sid
        elif created and created.get("id"):
            sid = str(created["id"])
            service_seed_to_id[int(r["id"])] = sid
            service_by_name[lk] = sid

    # --- Cost records (per service GET then POST if missing)
    for r in cost_rows:
        sid_seed = int(r["service_id"])
        svc_uuid = service_seed_to_id.get(sid_seed)
        if not svc_uuid:
            print(
                f"  [warn] No service UUID for seed service_id={sid_seed}; skip cost record.",
                file=sys.stderr,
            )
            continue
        fy = int(r["fiscal_year"])
        rt = str(r["record_type"])
        if not client.dry_run:
            existing_cr = client.get_json(f"/api/services/{svc_uuid}/cost-records/") or []
            if any(
                int(x.get("fiscal_year", -1)) == fy and str(x.get("record_type")) == rt
                for x in existing_cr
            ):
                continue
        payload = {
            "fiscal_year": fy,
            "amount": float(r["amount"]),
            "record_type": rt,
            "notes": r.get("notes"),
        }
        print(f"  Creating cost record: service seed {sid_seed} FY{fy} {rt}")
        client.post_json(f"/api/services/{svc_uuid}/cost-records/", payload)

    # --- Laptops (optional laptops.json)
    if laptops_rows:
        print("Laptops …")
        for i, row in enumerate(laptops_rows):
            serial = str(row.get("serial_number", "")).strip()
            if not serial:
                print("  [warn] laptop row missing serial_number; skip.", file=sys.stderr)
                continue
            lk = serial.lower()
            if lk in laptop_by_serial:
                print(f"  [skip] laptop already exists: {serial}")
                continue
            seed_key = row.get("assigned_to_user_seed_id")
            assigned_to_id: str | None = None
            if seed_key is not None:
                assigned_to_id = user_seed_to_id.get(int(seed_key))
                if not assigned_to_id:
                    print(
                        f"  [warn] assigned_to_user_seed_id {seed_key} has no user; "
                        f"laptop {serial} will be created without assignee.",
                        file=sys.stderr,
                    )
            body: dict[str, Any] = {
                "serial_number": serial,
                "model_name": str(row.get("model_name") or "Laptop"),
                "cpu": str(row.get("cpu") or ""),
                "ram": str(row.get("ram") or ""),
                "storage_size": str(row.get("storage_size") or ""),
                "status": str(row.get("status") or "In Stock"),
                "notes": row.get("notes"),
            }
            if assigned_to_id:
                body["assigned_to_id"] = assigned_to_id
            print(f"  Creating laptop: {serial}")
            created = client.post_json("/api/laptops/", body)
            if client.dry_run:
                laptop_by_serial[lk] = _pred_uuid("laptop", i)
            elif created and created.get("id"):
                laptop_by_serial[lk] = str(created["id"])

    print("Done.")
    print(
        "Note: service_history.json is not loaded (no public API for those rows in this project).",
        file=sys.stderr,
    )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk load CatalogIT JSON seed files via API")
    parser.add_argument(
        "--seed-dir",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Directory containing *.json seed files (default: this script's directory)",
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("CATALOGIT_BASE_URL", _DEFAULT_BASE_URL).strip() or _DEFAULT_BASE_URL,
        help="API base URL (or CATALOGIT_BASE_URL)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned requests without sending them",
    )
    args = parser.parse_args()

    token = os.environ.get("CATALOGIT_API_TOKEN", "").strip()
    if not token:
        print("Set CATALOGIT_API_TOKEN (required for GETs; use with --dry-run to skip writes).", file=sys.stderr)
        sys.exit(1)

    scim = os.environ.get("CATALOGIT_SCIM_TOKEN", "").strip() or None
    ua = os.environ.get("CATALOGIT_USER_AGENT", "").strip() or None

    client = ApiClient(
        args.base_url,
        api_token=token,
        scim_token=scim,
        dry_run=args.dry_run,
        user_agent=ua,
    )
    try:
        raise SystemExit(run(args.seed_dir, client))
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
