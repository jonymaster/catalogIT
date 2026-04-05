from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies.auth import require_role
from app.dependencies.db import get_audited_db
from app.dependencies.storage import get_s3_client
from app.models.attachment import Attachment
from app.models.laptop import Laptop
from app.models.service import Service
from app.models.user import User
from app.schemas.attachment import AttachmentRead, PaginatedAttachmentResponse

router = APIRouter(prefix="/api/attachments", tags=["attachments"])

ALLOWED_ENTITY_TYPES = {"laptop": Laptop, "service": Service}
ALLOWED_CONTENT_TYPES = {"application/pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

_writer = require_role("admin", "editor")


async def _validate_entity(
    entity_type: str, entity_id: uuid.UUID, db: AsyncSession
) -> None:
    model = ALLOWED_ENTITY_TYPES.get(entity_type)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid entity type: {entity_type}",
        )
    entity = await db.get(model, entity_id)
    if entity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity_type} {entity_id} not found",
        )


@router.get("/download/{attachment_id}")
async def download_attachment(
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_audited_db),
):
    attachment = await db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found"
        )

    cfg = get_settings()

    async with get_s3_client() as s3:
        resp = await s3.get_object(
            Bucket=cfg.MINIO_BUCKET_NAME, Key=attachment.storage_key
        )
        body = await resp["Body"].read()

    return Response(
        content=body,
        media_type=attachment.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{attachment.original_filename}"',
        },
    )


@router.delete("/remove/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: uuid.UUID,
    _user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    attachment = await db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found"
        )

    cfg = get_settings()
    async with get_s3_client() as s3:
        await s3.delete_object(
            Bucket=cfg.MINIO_BUCKET_NAME, Key=attachment.storage_key
        )

    await db.delete(attachment)


@router.get("/{entity_type}/{entity_id}", response_model=PaginatedAttachmentResponse)
async def list_attachments(
    entity_type: str,
    entity_id: uuid.UUID,
    db: AsyncSession = Depends(get_audited_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(5, ge=1, le=50),
):
    await _validate_entity(entity_type, entity_id, db)
    filters = [
        Attachment.entity_type == entity_type,
        Attachment.entity_id == entity_id,
    ]
    count_stmt = select(func.count()).select_from(Attachment).where(*filters)
    total_count = int((await db.execute(count_stmt)).scalar_one())

    if total_count == 0:
        return PaginatedAttachmentResponse(
            items=[],
            page=page,
            per_page=per_page,
            total_count=0,
            total_pages=0,
        )

    total_pages = (total_count + per_page - 1) // per_page
    if page > total_pages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Page out of range (max {total_pages})",
        )

    offset = (page - 1) * per_page
    result = await db.execute(
        select(Attachment)
        .where(*filters)
        .order_by(Attachment.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    items = list(result.scalars().all())
    return PaginatedAttachmentResponse(
        items=items,
        page=page,
        per_page=per_page,
        total_count=total_count,
        total_pages=total_pages,
    )


@router.post(
    "/{entity_type}/{entity_id}",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_attachment(
    entity_type: str,
    entity_id: uuid.UUID,
    file: UploadFile,
    user: User = Depends(_writer),
    db: AsyncSession = Depends(get_audited_db),
):
    await _validate_entity(entity_type, entity_id, db)

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Accepted types: {', '.join(ALLOWED_CONTENT_TYPES)}",
        )

    contents = await file.read()
    file_size = len(contents)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {MAX_FILE_SIZE // (1024 * 1024)} MB",
        )

    file_id = uuid.uuid4()
    original = file.filename or "attachment.pdf"
    storage_key = f"{entity_type}/{entity_id}/{file_id}_{original}"

    cfg = get_settings()
    async with get_s3_client() as s3:
        await s3.put_object(
            Bucket=cfg.MINIO_BUCKET_NAME,
            Key=storage_key,
            Body=contents,
            ContentType=file.content_type,
        )

    attachment = Attachment(
        id=file_id,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=f"{file_id}_{original}",
        original_filename=original,
        content_type=file.content_type,
        file_size=file_size,
        storage_key=storage_key,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)
    return attachment


async def delete_entity_attachments(
    entity_type: str, entity_id: uuid.UUID, db: AsyncSession
) -> None:
    """Remove all attachments (DB rows + S3 objects) for a given entity."""
    result = await db.execute(
        select(Attachment).where(
            Attachment.entity_type == entity_type, Attachment.entity_id == entity_id
        )
    )
    attachments = result.scalars().all()
    if not attachments:
        return

    cfg = get_settings()
    async with get_s3_client() as s3:
        for att in attachments:
            await s3.delete_object(Bucket=cfg.MINIO_BUCKET_NAME, Key=att.storage_key)
            await db.delete(att)
