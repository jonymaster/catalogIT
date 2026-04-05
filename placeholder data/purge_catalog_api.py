#!/usr/bin/env python3
"""Delete catalog data via the CatalogIT HTTP API (inverse of bulk_load_api.py).

Removes, in order:

1. All **services** (cost records and service history rows cascade with each service).
2. All **cost centers**
3. All **vendors** (fails if **contracts** still reference a vendor; see note below)
4. All **categories**
5. All **payment methods**

Does **not** delete: **users**, **API tokens**, **service classifications**, **integrations**,
**attachments** beyond what service/laptop delete already clears, or **contracts** (no delete
endpoint in the public API). If vendors cannot be removed because of contracts, the script
prints the error and continues.

Optional flags:

* ``--include-laptops`` — also deletes every row from ``GET /api/laptops/``.

Environment (same style as ``bulk_load_api.py``):

* ``CATALOGIT_BASE_URL`` — default ``http://127.0.0.1:8000`` (override for your deployment)
* ``CATALOGIT_API_TOKEN`` — **admin** token required (vendor/category/payment/status/cost-center deletes are admin-only)
* ``CATALOGIT_USER_AGENT`` — optional override if your CDN filters clients

Safety:

* Without ``--execute``, only **GET**s the API and prints what **would** be deleted (counts + names).
* With ``--execute``, you must also pass ``--confirm DELETE_ALL_CATALOG_DATA`` exactly.

Usage::

    export CATALOGIT_API_TOKEN='...'
    python3 purge_catalog_api.py
    python3 purge_catalog_api.py --execute --confirm DELETE_ALL_CATALOG_DATA
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

_DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

CONFIRM_PHRASE = "DELETE_ALL_CATALOG_DATA"

_DEFAULT_BASE_URL = "http://127.0.0.1:8000"


class ApiClient:
    def __init__(
        self,
        base_url: str,
        *,
        api_token: str,
        dry_run: bool,
        user_agent: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_token = api_token
        self.dry_run = dry_run
        self.user_agent = (user_agent or _DEFAULT_USER_AGENT).strip() or _DEFAULT_USER_AGENT
        self._ctx = ssl.create_default_context()

    def _request(self, method: str, path: str) -> Any:
        url = self.base_url + path
        if self.dry_run and method not in ("GET", "HEAD"):
            print(f"  [dry-run] {method} {path}")
            return None

        req = Request(url, data=None, method=method)
        req.add_header("Accept", "application/json")
        req.add_header("User-Agent", self.user_agent)
        req.add_header("Accept-Language", "en-US,en;q=0.9")
        req.add_header("Authorization", f"Bearer {self.api_token}")

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

    def delete_json(self, path: str) -> None:
        self._request("DELETE", path)


def _name(row: dict[str, Any]) -> str:
    return str(row.get("name") or row.get("serial_number") or row.get("id"))


def _delete_rows(
    client: ApiClient,
    label: str,
    path: str,
    *,
    id_key: str = "id",
) -> tuple[int, int]:
    rows = client.get_json(path) or []
    rows = sorted(rows, key=_name)
    ok, failed = 0, 0
    for row in rows:
        rid = row[id_key]
        nm = _name(row)
        if client.dry_run:
            print(f"  [dry-run] DELETE {path}{rid}  ({nm})")
            ok += 1
            continue
        try:
            client.delete_json(f"{path}{rid}")
            print(f"  deleted {label}: {nm}")
            ok += 1
        except RuntimeError as e:
            print(f"  [fail] {label} {nm}: {e}", file=sys.stderr)
            failed += 1
    return ok, failed


def main() -> None:
    parser = argparse.ArgumentParser(description="Purge catalog data via CatalogIT API")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("CATALOGIT_BASE_URL", _DEFAULT_BASE_URL).strip() or _DEFAULT_BASE_URL,
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Perform DELETEs (default: list-only dry run using GET)",
    )
    parser.add_argument(
        "--confirm",
        default="",
        help=f"Required with --execute; must be exactly: {CONFIRM_PHRASE}",
    )
    parser.add_argument(
        "--include-laptops",
        action="store_true",
        help="Also delete all laptops",
    )
    args = parser.parse_args()

    token = os.environ.get("CATALOGIT_API_TOKEN", "").strip()
    if not token:
        print("Set CATALOGIT_API_TOKEN.", file=sys.stderr)
        sys.exit(1)

    dry_run = not args.execute
    if args.execute:
        if args.confirm != CONFIRM_PHRASE:
            print(
                f"Refusing: --execute requires --confirm {CONFIRM_PHRASE}",
                file=sys.stderr,
            )
            sys.exit(1)

    ua = os.environ.get("CATALOGIT_USER_AGENT", "").strip() or None
    client = ApiClient(args.base_url, api_token=token, dry_run=dry_run, user_agent=ua)

    if dry_run:
        print("Dry run: only GET requests; no data will be deleted.\n")
    else:
        print("EXECUTING DELETES.\n")

    total_ok = total_fail = 0

    try:
        print("Services …")
        o, f = _delete_rows(client, "service", "/api/services/")
        total_ok += o
        total_fail += f

        if args.include_laptops:
            print("Laptops …")
            o, f = _delete_rows(client, "laptop", "/api/laptops/")
            total_ok += o
            total_fail += f

        print("Cost centers …")
        o, f = _delete_rows(client, "cost center", "/api/cost-centers/")
        total_ok += o
        total_fail += f

        print("Vendors …")
        o, f = _delete_rows(client, "vendor", "/api/vendors/")
        total_ok += o
        total_fail += f

        print("Categories …")
        o, f = _delete_rows(client, "category", "/api/categories/")
        total_ok += o
        total_fail += f

        print("Payment methods …")
        o, f = _delete_rows(client, "payment method", "/api/payment-methods/")
        total_ok += o
        total_fail += f

        print("Service statuses …")
        o, f = _delete_rows(client, "service status", "/api/service-statuses/")
        total_ok += o
        total_fail += f

    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"\nFinished. ok={total_ok} failed={total_fail}")
    if dry_run:
        print(f"To actually delete, run with --execute --confirm {CONFIRM_PHRASE}")


if __name__ == "__main__":
    main()
