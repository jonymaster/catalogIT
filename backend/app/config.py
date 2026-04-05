from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    DATABASE_URL: str = "postgresql+asyncpg://catalogit:catalogit_local@db:5432/catalogit"

    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 8

    # Env var FRONTEND_URL: browser origin for CORS and auth redirects (defaults suit local Vite).
    FRONTEND_URL: str = Field(default="http://localhost:5173")

    # Env var PUBLIC_BASE_URL: where this API is reachable publicly (OAuth callbacks, integration metadata).
    PUBLIC_BASE_URL: str = Field(default="http://localhost:8000")

    # Fernet key (urlsafe base64 32 bytes) for encrypting integration tokens at rest. Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    INTEGRATION_SECRET_KEY: str = ""

    SCIM_TOKEN: str = ""

    ADMIN_DEFAULT_PASSWORD: str = "changeme"
    # Bootstrap admin (only used when no admin user exists yet; see main._seed_admin)
    ADMIN_EMAIL: str = "admin@catalogit.local"
    ADMIN_EXTERNAL_ID: str = "local:admin"
    ADMIN_FIRST_NAME: str = "Admin"
    ADMIN_LAST_NAME: str = "User"

    SEED_SAMPLE_DATA: bool = False

    MINIO_ENDPOINT: str = "http://minio:9000"
    MINIO_ACCESS_KEY: str = "catalogit"
    MINIO_SECRET_KEY: str = "catalogit_local"
    MINIO_BUCKET_NAME: str = "catalogit-attachments"
    MINIO_USE_SSL: bool = False

    # Shared secret for POST /api/internal/notifications/renewal-dispatch (cron, k8s CronJob, etc.)
    CRON_SECRET: str = ""

    # Logging: set to "json" for structured stdout (e.g. CloudWatch via Docker log driver).
    LOG_FORMAT: str = Field(default="text")

    # Global audit rows older than this many days are eligible for purge (see POST /api/internal/audit-retention).
    AUDIT_RETENTION_DAYS: int = Field(default=90)


@lru_cache
def get_settings() -> Settings:
    return Settings()
