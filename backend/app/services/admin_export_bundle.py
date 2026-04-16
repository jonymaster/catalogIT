"""Build admin \"Download All\" zip: metadata JSON, CSV exports, optional attachments."""
from __future__ import annotations

import csv
import io
import json
import logging
import os
import re
import zipfile
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.dependencies.storage import get_s3_client
from app.models.attachment import Attachment
from app.models.category import Category
from app.models.cost_record import CostRecord
from app.models.laptop import Laptop
from app.models.service import Service
from app.reference_data_registry import REFERENCE_DATA_RESOURCES
from app.database import async_session
from app.services.admin_export_seed_json import build_seed_json_files

logger = logging.getLogger(__name__)

UTF8_BOM = "\ufeff"


def _openapi_dict() -> dict[str, Any]:
    from app.main import app

    return app.openapi()


def _reference_registry_json() -> str:
    rows = [res.to_read().model_dump(mode="json") for res in REFERENCE_DATA_RESOURCES.values()]
    return json.dumps(rows, indent=2)


def _sanitize_zip_filename(name: str) -> str:
    name = os.path.basename(name)
    name = re.sub(r'[\x00-\x1f"\\]', "", name)
    return name or "file"


def _csv_text(rows: list[list[Any]], headers: list[str]) -> str:
    buf = io.StringIO()
    buf.write(UTF8_BOM)
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(headers)
    for row in rows:
        w.writerow(row)
    return buf.getvalue()


def _fmt_dt(v: datetime | None) -> str:
    if v is None:
        return ""
    return v.isoformat()


def _fmt_date(v: date | None) -> str:
    if v is None:
        return ""
    return v.isoformat()


def _fmt_users(users: list) -> str:
    return "; ".join(sorted({u.email for u in users if u.email}))


def _fmt_offsets(v: list[int] | None) -> str:
    if not v:
        return ""
    return ";".join(str(x) for x in v)


async def _load_cost_record_rows(db) -> tuple[list[str], list[list[Any]]]:
    cr_result = await db.execute(select(CostRecord).order_by(CostRecord.fiscal_year))
    records = cr_result.scalars().all()

    svc_result = await db.execute(
        select(Service).options(
            selectinload(Service.cost_center),
            selectinload(Service.service_classification),
        )
    )
    services = {str(s.id): s for s in svc_result.scalars().all()}

    lap_result = await db.execute(select(Laptop))
    laptops = {str(l.id): l for l in lap_result.scalars().all()}

    cat_result = await db.execute(select(Category))
    categories = {str(c.id): c.name for c in cat_result.scalars().all()}

    headers = [
        "id",
        "source",
        "service_id",
        "laptop_id",
        "service_name",
        "classification",
        "category_name",
        "cost_center_name",
        "fiscal_year",
        "purchase_year",
        "amount",
        "record_type",
        "notes",
        "recorded_at",
        "payment_method_id",
    ]
    rows_out: list[list[Any]] = []

    for r in records:
        rid = str(r.id)
        pm = str(r.payment_method_id) if r.payment_method_id else ""
        rec_at = _fmt_dt(r.recorded_at)
        pur = r.purchase_year if r.purchase_year is not None else ""

        if r.service_id is not None:
            svc = services.get(str(r.service_id))
            if not svc:
                continue
            cat_name = None
            if svc.category_id:
                cat_name = categories.get(str(svc.category_id))
            cc_name = svc.cost_center.name if svc.cost_center else None
            rows_out.append(
                [
                    rid,
                    "service",
                    str(r.service_id),
                    "",
                    svc.name,
                    svc.service_classification.slug if svc.service_classification else "",
                    cat_name or "",
                    cc_name or "",
                    r.fiscal_year,
                    pur,
                    float(r.amount),
                    r.record_type,
                    r.notes or "",
                    rec_at,
                    pm,
                ]
            )
        elif r.laptop_id is not None:
            lap = laptops.get(str(r.laptop_id))
            if not lap:
                continue
            label = f"{lap.model_name} ({lap.serial_number})"
            rows_out.append(
                [
                    rid,
                    "hardware",
                    "",
                    str(r.laptop_id),
                    label,
                    "hardware",
                    "Hardware",
                    "",
                    r.fiscal_year,
                    pur,
                    float(r.amount),
                    r.record_type,
                    r.notes or "",
                    rec_at,
                    pm,
                ]
            )

    return headers, rows_out


async def _load_service_rows(db) -> tuple[list[str], list[list[Any]]]:
    result = await db.execute(
        select(Service)
        .options(
            selectinload(Service.owners),
            selectinload(Service.assignees),
            selectinload(Service.vendor),
            selectinload(Service.category_rel),
            selectinload(Service.cost_center),
            selectinload(Service.payment_method),
            selectinload(Service.service_status),
            selectinload(Service.service_classification),
        )
        .order_by(Service.name)
    )
    services = list(result.scalars().all())

    headers = [
        "id",
        "name",
        "description",
        "status",
        "billing_schedule",
        "renewal_date",
        "yearly_cost",
        "sso_integrated",
        "point_of_contact",
        "notes",
        "owners",
        "assignees",
        "total_seats",
        "vendor_name",
        "category_name",
        "cost_center_name",
        "payment_method_name",
        "service_status_name",
        "classification_slug",
        "scim_enabled",
        "criticality",
        "nonprofit_pricing",
        "is_active",
        "renewal_reminders_enabled",
        "renewal_offsets_days",
        "deprecated_at",
        "created_at",
        "updated_at",
    ]
    rows: list[list[Any]] = []
    for s in services:
        rows.append(
            [
                str(s.id),
                s.name,
                s.description or "",
                s.status,
                s.billing_schedule,
                _fmt_date(s.renewal_date),
                float(s.yearly_cost) if s.yearly_cost is not None else "",
                s.sso_integrated,
                s.point_of_contact or "",
                s.notes or "",
                _fmt_users(s.owners),
                _fmt_users(s.assignees),
                s.total_seats if s.total_seats is not None else "",
                s.vendor.name if s.vendor else "",
                s.category_rel.name if s.category_rel else "",
                s.cost_center.name if s.cost_center else "",
                s.payment_method.name if s.payment_method else "",
                s.service_status.name if s.service_status else "",
                s.service_classification.slug if s.service_classification else "",
                s.scim_enabled if s.scim_enabled is not None else "",
                s.criticality or "",
                s.nonprofit_pricing,
                s.is_active,
                s.renewal_reminders_enabled,
                _fmt_offsets(s.renewal_offsets_days),
                _fmt_dt(s.deprecated_at),
                _fmt_dt(s.created_at),
                _fmt_dt(s.updated_at),
            ]
        )
    return headers, rows


async def _load_laptop_rows(db) -> tuple[list[str], list[list[Any]]]:
    result = await db.execute(
        select(Laptop)
        .options(
            selectinload(Laptop.hardware_status),
            selectinload(Laptop.hardware_location),
            selectinload(Laptop.assigned_to),
        )
        .order_by(Laptop.serial_number)
    )
    laptops = list(result.scalars().all())

    headers = [
        "id",
        "serial_number",
        "model_name",
        "cpu",
        "ram",
        "storage_size",
        "status",
        "hardware_status_name",
        "location_name",
        "assigned_to_email",
        "notes",
        "is_active",
        "archived_at",
        "created_at",
        "updated_at",
    ]
    rows: list[list[Any]] = []
    for l in laptops:
        rows.append(
            [
                str(l.id),
                l.serial_number,
                l.model_name,
                l.cpu,
                l.ram,
                l.storage_size,
                l.status,
                l.hardware_status.name if l.hardware_status else "",
                l.hardware_location.name if l.hardware_location else "",
                l.assigned_to.email if l.assigned_to else "",
                l.notes or "",
                l.is_active,
                _fmt_dt(l.archived_at),
                _fmt_dt(l.created_at),
                _fmt_dt(l.updated_at),
            ]
        )
    return headers, rows


async def _attachment_file_tuples(
    db, include_attachments: bool
) -> list[tuple[str, bytes]]:
    if not include_attachments:
        return []
    result = await db.execute(select(Attachment))
    attachments = list(result.scalars().all())
    out: list[tuple[str, bytes]] = []
    cfg = get_settings()
    for att in attachments:
        safe = _sanitize_zip_filename(att.original_filename)
        arc = f"attachments/{att.entity_type}/{att.entity_id}/{safe}"
        async with get_s3_client() as s3:
            resp = await s3.get_object(
                Bucket=cfg.MINIO_BUCKET_NAME, Key=att.storage_key
            )
            body = await resp["Body"].read()
        out.append((arc, body))
    return out


async def build_export_zip_bytes(
    *,
    include_attachments: bool,
) -> bytes:
    """Load DB + MinIO and return zip file bytes."""
    openapi_json = json.dumps(_openapi_dict(), indent=2)
    ref_json = _reference_registry_json()

    async with async_session() as db:
        sh, srows = await _load_service_rows(db)
        lh, lrows = await _load_laptop_rows(db)
        ch, crows = await _load_cost_record_rows(db)
        att_parts = await _attachment_file_tuples(db, include_attachments)
        seed_json_files = await build_seed_json_files(db)

    services_csv = _csv_text(srows, sh)
    laptops_csv = _csv_text(lrows, lh)
    costs_csv = _csv_text(crows, ch)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("metadata/openapi.json", openapi_json)
        zf.writestr("metadata/reference-data-registry.json", ref_json)
        zf.writestr("csv/services.csv", services_csv)
        zf.writestr("csv/laptops.csv", laptops_csv)
        zf.writestr("csv/cost-records.csv", costs_csv)
        for path, content in seed_json_files.items():
            zf.writestr(path, content)
        for arc, data in att_parts:
            zf.writestr(arc, data)
    return buf.getvalue()


async def upload_export_zip(job_id: UUID, data: bytes) -> str:
    cfg = get_settings()
    key = f"exports/{job_id}/bundle.zip"
    async with get_s3_client() as s3:
        await s3.put_object(
            Bucket=cfg.MINIO_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType="application/zip",
        )
    return key


async def delete_export_object(storage_key: str) -> None:
    cfg = get_settings()
    async with get_s3_client() as s3:
        await s3.delete_object(Bucket=cfg.MINIO_BUCKET_NAME, Key=storage_key)

