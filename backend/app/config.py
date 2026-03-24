from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.secrets import fetch_aws_secrets


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://catalogit:catalogit_local@db:5432/catalogit"

    # Okta OIDC
    OKTA_CLIENT_ID: str = ""
    OKTA_CLIENT_SECRET: str = ""
    OKTA_ISSUER: str = ""

    # JWT
    JWT_SECRET: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_HOURS: int = 8

    # Frontend
    FRONTEND_URL: str = "http://localhost:5173"

    # SCIM
    SCIM_TOKEN: str = ""

    # AWS (optional)
    AWS_SECRET_NAME: str = ""
    AWS_REGION: str = "us-east-1"


@lru_cache
def get_settings() -> Settings:
    """Build settings, overlaying AWS Secrets Manager values when available."""
    base = Settings()

    if base.AWS_SECRET_NAME:
        aws_values = fetch_aws_secrets(base.AWS_SECRET_NAME, base.AWS_REGION)
        if aws_values:
            merged = {**base.model_dump(), **aws_values}
            return Settings(**merged)

    return base
