import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import bcrypt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.audit import register_audit_listeners
from app.config import get_settings
from app.database import async_session
from app.models.service import Service
from app.models.user import User
from app.dependencies.storage import ensure_bucket
from app.routers import (
    api_tokens, attachments, auth, categories, cost_records, dashboard,
    history, integrations, internal, laptops, login_methods, me, payment_methods, reference_data,
    service_statuses, services, scim,
    settings, users, vendors,
)
from scripts.seed_from_json import SEED_DIR, seed_database

logger = logging.getLogger(__name__)


async def _seed_admin() -> None:
    """Ensure a working admin account exists on every startup.

    - If no admin exists, create one using ADMIN_* profile fields and ADMIN_DEFAULT_PASSWORD.
    - If the admin exists but never changed their password
      (must_reset_password is still True), re-sync the hash from the env var
      so a changed ADMIN_DEFAULT_PASSWORD always takes effect.
    - If the admin already chose their own password, leave it alone.

    Silently skips if the users table has not been created (migrations not yet run).
    """
    cfg = get_settings()
    try:
        async with async_session() as session:
            result = await session.execute(select(User).where(User.role == "admin"))
            admin = result.scalar_one_or_none()

            hashed = bcrypt.hashpw(
                cfg.ADMIN_DEFAULT_PASSWORD.encode(), bcrypt.gensalt()
            ).decode()

            if admin is None:
                admin = User(
                    external_id=cfg.ADMIN_EXTERNAL_ID,
                    email=cfg.ADMIN_EMAIL,
                    first_name=cfg.ADMIN_FIRST_NAME,
                    last_name=cfg.ADMIN_LAST_NAME,
                    role="admin",
                    password_hash=hashed,
                    must_reset_password=True,
                )
                session.add(admin)
                logger.info("Default admin account created")
            elif admin.must_reset_password:
                admin.password_hash = hashed
                logger.info("Admin password re-synced from ADMIN_DEFAULT_PASSWORD")

            await session.commit()
    except Exception:
        logger.warning("Admin seed skipped (run migrations first: alembic upgrade head)")


async def _seed_sample_data() -> None:
    cfg = get_settings()
    if not cfg.SEED_SAMPLE_DATA or not SEED_DIR.exists():
        return

    try:
        async with async_session() as session:
            existing_service = await session.scalar(select(Service.id).limit(1))
        if existing_service is not None:
            return

        logger.info("No services found, loading sample seed data from %s", SEED_DIR)
        await seed_database()
    except Exception:
        logger.warning("Sample data seed skipped (run migrations first: alembic upgrade head)")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await _seed_admin()
    await _seed_sample_data()
    try:
        await ensure_bucket()
    except Exception:
        logger.warning("MinIO bucket init skipped (is MinIO running?)")
    yield


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(title="CatalogIT", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[cfg.FRONTEND_URL],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_audit_listeners()

    app.include_router(auth.router)
    app.include_router(me.router)
    app.include_router(scim.router)
    app.include_router(services.router)
    app.include_router(laptops.router)
    app.include_router(history.router)
    app.include_router(settings.router)
    app.include_router(internal.router)
    app.include_router(integrations.settings_router)
    app.include_router(integrations.oauth_router)
    app.include_router(users.router)
    app.include_router(api_tokens.router)
    app.include_router(attachments.router)
    app.include_router(vendors.router)
    app.include_router(categories.router)
    app.include_router(login_methods.router)
    app.include_router(payment_methods.router)
    app.include_router(service_statuses.router)
    app.include_router(reference_data.router)
    app.include_router(cost_records.router)
    app.include_router(dashboard.router)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
