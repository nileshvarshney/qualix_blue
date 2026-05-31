from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.core.config import settings
from app.core.limiter import limiter
from app.core.logging_config import setup_logging
from app.core.middleware import RequestIDMiddleware, SecurityHeadersMiddleware
from app.db.database import create_tables, check_db_health
from app.services.scheduler_service import start_scheduler, stop_scheduler
from app.api import (
    domains, subdomains, assets, rules, schedules, executions,
    dashboard, ai, alerts, audit, config, connections,
    # §53 Catalog & Governance
    glossary, classifications, columns, data_products,
    comments, announcements, access_requests, tags, usage, catalog,
    lineage,
    schema_drift,
    # §54-§68 Advanced features
    governance, contracts, compliance, cost, incidents,
    anomaly, marketplace, mesh, observability, cicd,
    privacy, admin,
)
from app.api.users import router as users_router
from app.api.oauth import router as oauth_router
from app.api.service_accounts import router as service_accounts_router

setup_logging()
logger = logging.getLogger("dataguard")

_IS_PRODUCTION = settings.app_env.lower() in ("production", "prod")


def _validate_security_config() -> None:
    """Abort or warn on insecure configurations at startup."""
    if settings.is_weak_secret_key():
        msg = (
            "SECRET_KEY is weak or uses the default value. "
            "Generate a secure key: openssl rand -hex 32"
        )
        if _IS_PRODUCTION:
            raise RuntimeError(f"[SECURITY] {msg}")
        logger.critical(f"[SECURITY] {msg}")

    if not settings.auth_required:
        msg = "AUTH_REQUIRED=false — all API endpoints are unauthenticated."
        if _IS_PRODUCTION:
            raise RuntimeError(f"[SECURITY] {msg}")
        logger.warning(f"[SECURITY] {msg}")

    if not settings.encryption_key:
        msg = (
            "ENCRYPTION_KEY is not set — Snowflake passwords and LLM API keys "
            "will be stored unencrypted in the database. "
            "Generate: python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\""
        )
        if _IS_PRODUCTION:
            logger.critical(f"[SECURITY] {msg}")
        else:
            logger.warning(f"[SECURITY] {msg}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load secrets from Vault / AWS SM before anything else
    from app.core.secrets_loader import bootstrap as _bootstrap_secrets
    _bootstrap_secrets(settings)

    _validate_security_config()
    logger.info("Starting DataGuard Platform...")

    async def _init_db():
        await asyncio.to_thread(create_tables)
        from app.db.database import AsyncSessionLocal
        from app.services.config_service import seed_config
        async with AsyncSessionLocal() as db:
            await seed_config(db)
        start_scheduler()
        from app.services.scheduler_service import load_all_schedules
        async with AsyncSessionLocal() as db:
            await load_all_schedules(db)

    try:
        await asyncio.wait_for(_init_db(), timeout=120)
    except asyncio.TimeoutError:
        logger.error("Database connection timed out (>120s) during startup — server starting without DB")
        start_scheduler()
    except Exception as e:
        logger.error(f"Startup initialization failed (DB may be unavailable): {e}")
        logger.warning("Server will start without full DB init — requests requiring DB will return 500")
        start_scheduler()
    yield
    stop_scheduler()
    from app.db.snowflake_pool import close_all_pools
    close_all_pools()
    logger.info("Shutting down DataGuard Platform")


# Disable interactive API docs in production to reduce attack surface.
_docs_url = "/docs" if not _IS_PRODUCTION else None
_redoc_url = "/redoc" if not _IS_PRODUCTION else None

app = FastAPI(
    title="DataGuard",
    description="Enterprise Data Quality & Governance Platform with AI/LLM capabilities",
    version="3.0.0",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
)

# ── Rate limiting ─────────────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Middleware ────────────────────────────────────────────────────────────────

allowed_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()] or ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)

# ── Global exception handler ──────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error(f"Unhandled exception [{request_id}]: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": request_id},
    )

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(users_router)
app.include_router(oauth_router)
app.include_router(service_accounts_router)
app.include_router(domains.router)
app.include_router(subdomains.router)
app.include_router(assets.router)
app.include_router(rules.router)
app.include_router(schedules.router)
app.include_router(executions.router)
app.include_router(dashboard.router)
app.include_router(ai.router)
app.include_router(alerts.router)
app.include_router(audit.router)
app.include_router(config.router)
app.include_router(connections.router)

# §53 Catalog & Governance routers
app.include_router(glossary.router)
app.include_router(glossary.asset_glossary_router)
app.include_router(classifications.router)
app.include_router(columns.router)
app.include_router(data_products.router)
app.include_router(comments.router)
app.include_router(announcements.router)
app.include_router(access_requests.router)
app.include_router(tags.router)
app.include_router(usage.router)
app.include_router(catalog.router)
app.include_router(lineage.router)
app.include_router(schema_drift.router)

# §54-§68 Advanced feature routers
app.include_router(governance.router)
app.include_router(contracts.router)
app.include_router(compliance.router)
app.include_router(cost.router)
app.include_router(incidents.router)
app.include_router(anomaly.router)
app.include_router(marketplace.router)
app.include_router(mesh.router)
app.include_router(observability.router)
app.include_router(cicd.router)
app.include_router(privacy.router)
app.include_router(admin.router)


# ── Health & Info ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["Health"])
async def health():
    """Deep health check — verifies Snowflake DB connectivity."""
    db_ok, db_error = await check_db_health()
    status_str = "healthy" if db_ok else "degraded"
    return {
        "status": status_str,
        "app": settings.app_name,
        "version": "3.0.0",
        "env": settings.app_env,
        "checks": {
            "database": "ok" if db_ok else f"error: {db_error}",
        },
    }


@app.get("/", tags=["Health"])
async def root():
    return {"message": "DataGuard API", "docs": "/docs", "version": "3.0.0"}
