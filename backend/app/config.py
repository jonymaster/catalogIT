from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    DATABASE_URL: str = "postgresql+asyncpg://catalogit:catalogit_local@db:5432/catalogit"

    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 8

    FRONTEND_URL: str = "http://localhost:5173"

    SCIM_TOKEN: str = ""

    ADMIN_DEFAULT_PASSWORD: str = "changeme"
    SEED_SAMPLE_DATA: bool = False

    MINIO_ENDPOINT: str = "http://minio:9000"
    MINIO_ACCESS_KEY: str = "catalogit"
    MINIO_SECRET_KEY: str = "catalogit_local"
    MINIO_BUCKET_NAME: str = "catalogit-attachments"
    MINIO_USE_SSL: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
