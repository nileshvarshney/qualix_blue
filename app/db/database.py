from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.dml import Insert
from sqlalchemy.orm import sessionmaker, Session, DeclarativeBase
from snowflake.sqlalchemy import URL as SnowflakeURL
from app.core.config import settings


@compiles(Insert, 'snowflake')
def _snowflake_insert_as_select(insert_stmt, compiler, **kw):
    """Snowflake rejects function calls (PARSE_JSON, TO_VARIANT) in VALUES clauses
    but allows them in SELECT. For any table that has JSONVariant columns we convert
    the generated INSERT…VALUES to INSERT…SELECT so bind_expression function calls work."""
    # Import here to avoid circular import (models.py imports from database.py)
    from app.db.models import JSONVariant

    table = insert_stmt.table
    has_variant = any(isinstance(col.type, JSONVariant) for col in table.columns)

    # Generate standard SQL first (INSERT ... VALUES (...))
    std_sql: str = compiler.visit_insert(insert_stmt, **kw)

    if not has_variant:
        return std_sql

    # Convert "INSERT INTO t (...) VALUES (\n    a, b, c\n)" →
    #         "INSERT INTO t (...) SELECT \n    a, b, c\n"
    upper = std_sql.upper()
    values_pos = upper.rfind(' VALUES ')
    if values_pos == -1:
        return std_sql  # unexpected; fall back to standard form

    before = std_sql[:values_pos]
    after = std_sql[values_pos + len(' VALUES '):]  # "(a, b, c)"

    # Strip the outer parentheses from the VALUES list
    after = after.strip()
    if after.startswith('(') and after.endswith(')'):
        inner = after[1:-1]
    else:
        return std_sql  # can't safely transform

    return f"{before} SELECT {inner}"

_log = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def _build_snowflake_url() -> SnowflakeURL:
    return SnowflakeURL(
        account=settings.sf_platform_account,
        user=settings.sf_platform_user,
        password=settings.sf_platform_password,
        database=settings.snowflake_app_database,
        schema=settings.snowflake_app_schema,
        warehouse=settings.sf_platform_warehouse,
        role=settings.sf_platform_role,
    )


engine = create_engine(
    _build_snowflake_url(),
    echo=settings.debug,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True,
)

_SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class SnowflakeAsyncSession:
    """Wraps a sync SQLAlchemy Session with async methods via asyncio.to_thread.

    Drop-in replacement for AsyncSession — all routers and services work without changes.
    """

    def __init__(self, session: Session):
        self._s = session

    # ── query ops ─────────────────────────────────────────────────────────────
    async def execute(self, statement, *args, **kwargs):
        return await asyncio.to_thread(self._s.execute, statement, *args, **kwargs)

    async def scalar(self, statement, *args, **kwargs):
        return await asyncio.to_thread(self._s.scalar, statement, *args, **kwargs)

    async def scalars(self, statement, *args, **kwargs):
        return await asyncio.to_thread(self._s.scalars, statement, *args, **kwargs)

    async def get(self, entity, pk, **kwargs):
        return await asyncio.to_thread(self._s.get, entity, pk, **kwargs)

    # ── mutation ops ──────────────────────────────────────────────────────────
    def add(self, instance):
        self._s.add(instance)

    def add_all(self, instances):
        self._s.add_all(instances)

    async def delete(self, instance):
        await asyncio.to_thread(self._s.delete, instance)

    async def merge(self, instance):
        return await asyncio.to_thread(self._s.merge, instance)

    # ── transaction ops ───────────────────────────────────────────────────────
    async def flush(self, objects=None):
        await asyncio.to_thread(self._s.flush, objects)

    async def commit(self):
        await asyncio.to_thread(self._s.commit)

    async def rollback(self):
        await asyncio.to_thread(self._s.rollback)

    async def refresh(self, instance, attribute_names=None):
        await asyncio.to_thread(self._s.refresh, instance, attribute_names)

    async def close(self):
        await asyncio.to_thread(self._s.close)

    # ── context manager (supports `async with db.begin():`) ───────────────────
    @asynccontextmanager
    async def begin(self):
        try:
            yield self
            await self.commit()
        except Exception:
            await self.rollback()
            raise

    # ── sync passthrough ──────────────────────────────────────────────────────
    def expire(self, instance, attribute_names=None):
        self._s.expire(instance, attribute_names)

    def expunge(self, instance):
        self._s.expunge(instance)

    def expunge_all(self):
        self._s.expunge_all()


async def get_db():
    """FastAPI dependency — yields SnowflakeAsyncSession (same interface as AsyncSession)."""
    session = _SessionLocal()
    db = SnowflakeAsyncSession(session)
    try:
        yield db
    finally:
        await db.close()


@asynccontextmanager
async def get_session_ctx():
    """Async context manager for use outside of FastAPI route handlers (lifespan, services)."""
    session = _SessionLocal()
    db = SnowflakeAsyncSession(session)
    try:
        yield db
    finally:
        await db.close()


# Backwards-compatibility alias — existing callers that do:
#   async with AsyncSessionLocal() as db: ...
# continue to work unchanged.
AsyncSessionLocal = get_session_ctx


def create_tables():
    """Idempotent table creation. Called once at startup via asyncio.to_thread."""
    db_name = settings.snowflake_app_database
    schema_name = settings.snowflake_app_schema

    # Ensure the app database and schema exist before creating tables
    with engine.connect() as conn:
        conn.execute(text(f'CREATE DATABASE IF NOT EXISTS "{db_name}"'))
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{db_name}"."{schema_name}"'))
        for col_ddl in [
            "ALTER TABLE snowflake_connections ADD COLUMN connection_type VARCHAR(50) DEFAULT 'named'",
            "ALTER TABLE snowflake_connections ADD COLUMN is_primary_target BOOLEAN DEFAULT FALSE",
            # dq_rules columns added in governance upgrade (approval workflow, versioning)
            "ALTER TABLE dq_rules ADD COLUMN rule_category VARCHAR(50)",
            "ALTER TABLE dq_rules ADD COLUMN version INTEGER DEFAULT 1",
            "ALTER TABLE dq_rules ADD COLUMN sla_threshold FLOAT",
            "ALTER TABLE dq_rules ADD COLUMN approved_by VARCHAR(200)",
            "ALTER TABLE dq_rules ADD COLUMN rejected_by VARCHAR(200)",
            "ALTER TABLE dq_rules ADD COLUMN rejection_reason TEXT",
            "ALTER TABLE dq_rules ADD COLUMN business_owner_name VARCHAR(200)",
            "ALTER TABLE dq_rules ADD COLUMN business_owner_email VARCHAR(200)",
        ]:
            try:
                conn.execute(text(col_ddl))
            except Exception as exc:
                if "already exist" in str(exc).lower() or "ambiguous" in str(exc).lower():
                    pass  # column already present
                else:
                    _log.warning("ALTER TABLE failed: %s", exc)
        conn.commit()

    # Snowflake doesn't support indexes on standard tables — strip them
    for table in Base.metadata.tables.values():
        table.indexes.clear()

    # Create tables one at a time (sorted by FK dependency), skipping any that already exist.
    # Snowflake's checkfirst inspection is unreliable, so we catch "already exists" errors.
    created = skipped = 0
    for table in Base.metadata.sorted_tables:
        try:
            table.create(bind=engine, checkfirst=False)
            created += 1
        except Exception as exc:
            if "already exists" in str(exc).lower():
                skipped += 1
            else:
                _log.warning("Could not create table %s: %s", table.name, exc)
    _log.info("create_tables: %d created, %d already existed", created, skipped)


async def check_db_health() -> tuple[bool, str]:
    """Returns (ok, error_message). Used by the /health endpoint."""
    try:
        def _ping():
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
        await asyncio.to_thread(_ping)
        return True, ""
    except Exception as exc:
        return False, str(exc)
