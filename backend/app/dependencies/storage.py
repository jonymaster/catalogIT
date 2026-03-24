"""MinIO / S3 storage client dependency."""
from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from aiobotocore.session import get_session

from app.config import get_settings

logger = logging.getLogger(__name__)

_session = get_session()


@asynccontextmanager
async def get_s3_client() -> AsyncGenerator:
    cfg = get_settings()
    async with _session.create_client(
        "s3",
        endpoint_url=cfg.MINIO_ENDPOINT,
        aws_access_key_id=cfg.MINIO_ACCESS_KEY,
        aws_secret_access_key=cfg.MINIO_SECRET_KEY,
        region_name="us-east-1",
        use_ssl=cfg.MINIO_USE_SSL,
    ) as s3:
        yield s3


async def ensure_bucket() -> None:
    """Create the attachments bucket if it does not already exist."""
    cfg = get_settings()
    async with get_s3_client() as s3:
        try:
            await s3.head_bucket(Bucket=cfg.MINIO_BUCKET_NAME)
            logger.info("Bucket '%s' already exists", cfg.MINIO_BUCKET_NAME)
        except Exception:
            await s3.create_bucket(Bucket=cfg.MINIO_BUCKET_NAME)
            logger.info("Created bucket '%s'", cfg.MINIO_BUCKET_NAME)
