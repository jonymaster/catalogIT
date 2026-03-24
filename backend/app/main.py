from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.audit import register_audit_listeners
from app.config import get_settings
from app.routers import auth, history, laptops, services, scim


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="CatalogIT", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_URL],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_audit_listeners()

    app.include_router(auth.router)
    app.include_router(scim.router)
    app.include_router(services.router)
    app.include_router(laptops.router)
    app.include_router(history.router)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
