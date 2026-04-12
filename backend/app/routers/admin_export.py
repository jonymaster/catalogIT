from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.dependencies.auth import require_role
from app.models.admin_export_job import AdminExportJob
from app.models.user import User
from app.schemas.admin_export import AdminExportJobCreate, AdminExportJobRead
from app.services.admin_export_bundle import (
    build_export_zip_bytes,
    delete_export_object,
    upload_export_zip,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/export-jobs", tags=["admin-export"])

_admin = require_role("admin")

_export_lock = asyncio.Lock()


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def get_admin_db(
    user: User = Depends(_admin),
) -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        session.info["current_user_id"] = user.id
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def _run_export_job(job_id: uuid.UUID) -> None:
    include_attachments = False
    try:
        async with _export_lock:
            async with async_session() as db:
                job = await db.get(AdminExportJob, job_id)
                if not job:
                    logger.warning("admin export job %s not found", job_id)
                    return
                include_attachments = job.include_attachments
                job.status = "running"
                job.error_message = None
                await db.commit()

            logger.info(
                "admin export job %s running (attachments=%s)",
                job_id,
                include_attachments,
            )
            zip_bytes = await build_export_zip_bytes(
                include_attachments=include_attachments,
            )
            storage_key = await upload_export_zip(job_id, zip_bytes)

            async with async_session() as db:
                job = await db.get(AdminExportJob, job_id)
                if not job:
                    return
                job.status = "ready"
                job.storage_key = storage_key
                job.completed_at = _utc_now_naive()
                await db.commit()
            logger.info(
                "admin export job %s ready (%s bytes)", job_id, len(zip_bytes)
            )
    except Exception as e:
        logger.exception("admin export job %s failed: %s", job_id, e)
        detail = f"{type(e).__name__}: {e}"
        try:
            async with async_session() as db:
                job = await db.get(AdminExportJob, job_id)
                if job:
                    job.status = "failed"
                    job.error_message = detail[:2000]
                    job.completed_at = _utc_now_naive()
                    await db.commit()
        except Exception:
            logger.exception(
                "admin export job %s: failed to persist error state", job_id
            )


def _assert_job_owner(job: AdminExportJob, user: User) -> None:
    if job.created_by_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")


@router.post("/", response_model=AdminExportJobRead, status_code=status.HTTP_201_CREATED)
async def create_export_job(
    body: AdminExportJobCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_admin_db),
):
    job = AdminExportJob(
        created_by_id=user.id,
        status="pending",
        include_attachments=body.include_attachments,
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    job_id = job.id
    response = AdminExportJobRead.model_validate(job)
    # Commit before returning so clients that poll immediately (and BackgroundTasks)
    # always see a persisted row; teardown commit on get_admin_db runs after the
    # response is sent, which is too late and caused "Job not found" races.
    await db.commit()

    background_tasks.add_task(_run_export_job, job_id)

    return response


@router.get("/{job_id}", response_model=AdminExportJobRead)
async def get_export_job(
    job_id: uuid.UUID,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_admin_db),
):
    job = await db.get(AdminExportJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    _assert_job_owner(job, user)
    return AdminExportJobRead.model_validate(job)


@router.get("/{job_id}/download")
async def download_export_job(
    job_id: uuid.UUID,
    user: User = Depends(_admin),
    db: AsyncSession = Depends(get_admin_db),
):
    job = await db.get(AdminExportJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    _assert_job_owner(job, user)

    if job.status != "ready" or not job.storage_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Export is not ready for download",
        )

    from app.config import get_settings

    cfg = get_settings()
    storage_key = job.storage_key

    async def stream_body():
        from app.dependencies.storage import get_s3_client

        try:
            async with get_s3_client() as s3:
                resp = await s3.get_object(
                    Bucket=cfg.MINIO_BUCKET_NAME, Key=storage_key
                )
                body = resp["Body"]
                while True:
                    chunk = await body.read(65536)
                    if not chunk:
                        break
                    yield chunk
        finally:
            try:
                await delete_export_object(storage_key)
            except Exception:
                logger.exception("failed to delete export object %s", storage_key)
            try:
                async with async_session() as sdb:
                    j = await sdb.get(AdminExportJob, job_id)
                    if j:
                        j.storage_key = None
                        await sdb.commit()
            except Exception:
                logger.exception("failed to clear job storage_key")

    d = _utc_now_naive().date().isoformat()
    filename = f"catalogit-export-{d}-{str(job_id)[:8]}.zip"
    return StreamingResponse(
        stream_body(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
