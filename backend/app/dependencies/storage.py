"""MinIO / S3 storage client dependency."""
from __future__ import annotations

import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from aiobotocore.session import get_session

from app.config import get_settings

logger = logging.getLogger(__name__)

_session = get_session()


@asynccontextmanager
async def get_s3_client() -> AsyncGenerator:
    cfg = get_settings()
    kwargs: dict = {
        "region_name": os.environ.get("AWS_REGION", "eu-west-1"),
        "use_ssl": cfg.MINIO_USE_SSL,
    }
    # When explicit credentials are provided (local dev / self-hosted MinIO),
    # pass them along with the custom endpoint.  When they are empty the SDK
    # falls back to the default credential chain (EC2 instance role via IMDSv2).
    if cfg.MINIO_ACCESS_KEY and cfg.MINIO_SECRET_KEY:
        kwargs["endpoint_url"] = cfg.MINIO_ENDPOINT
        kwargs["aws_access_key_id"] = cfg.MINIO_ACCESS_KEY
        kwargs["aws_secret_access_key"] = cfg.MINIO_SECRET_KEY
    async with _session.create_client("s3", **kwargs) as s3:
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
