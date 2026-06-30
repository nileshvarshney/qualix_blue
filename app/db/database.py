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


_WAREHOUSE_RECHECK_SECONDS = 60.0
_warehouse_resume_lock = asyncio.Lock()
_last_warehouse_resume_check = 0.0


async def _resume_warehouse(session: Session) -> None:
    """Resume the platform warehouse if it is suspended.

    Snowflake SHOW/DESCRIBE commands work without an active warehouse but DML
    (INSERT/UPDATE/DELETE) requires one.  When the warehouse is suspended we get
    a ProgrammingError 57P03 which surfaces as an opaque 500.

    This is called on every session open (i.e. every request), so it is throttled
    to once per _WAREHOUSE_RECHECK_SECONDS — otherwise every request pays an extra
    Snowflake round trip just to confirm a warehouse that's almost always already
    running. On failure the timestamp is left unset so the next request retries
    immediately rather than waiting out the full window.
    """
    global _last_warehouse_resume_check
    loop = asyncio.get_event_loop()
    if loop.time() - _last_warehouse_resume_check < _WAREHOUSE_RECHECK_SECONDS:
        return
    async with _warehouse_resume_lock:
        if loop.time() - _last_warehouse_resume_check < _WAREHOUSE_RECHECK_SECONDS:
            return
        try:
            await asyncio.to_thread(
                session.execute,
                text(f"ALTER WAREHOUSE {settings.sf_platform_warehouse} RESUME IF SUSPENDED"),
            )
            _last_warehouse_resume_check = loop.time()
        except Exception as e:
            _log.error(
                "Failed to auto-resume warehouse %s — queries will fail until it is resumed "
                "manually (ALTER WAREHOUSE %s RESUME): %s: %s",
                settings.sf_platform_warehouse, settings.sf_platform_warehouse, type(e).__name__, e,
            )


async def get_db():
    """FastAPI dependency — yields SnowflakeAsyncSession (same interface as AsyncSession)."""
    session = _SessionLocal()
    db = SnowflakeAsyncSession(session)
    await _resume_warehouse(session)
    try:
        yield db
    finally:
        await db.close()


@asynccontextmanager
async def get_session_ctx():
    """Async context manager for use outside of FastAPI route handlers (lifespan, services)."""
    session = _SessionLocal()
    db = SnowflakeAsyncSession(session)
    await _resume_warehouse(session)
    try:
        yield db
    finally:
        await db.close()


# Backwards-compatibility alias — existing callers that do:
#   async with AsyncSessionLocal() as db: ...
# continue to work unchanged.
AsyncSessionLocal = get_session_ctx


def _run_ddl(conn, statements: list[str]) -> None:
    """Execute DDL statements, silently ignoring 'already exists' / 'does not exist' errors."""
    for ddl in statements:
        try:
            conn.execute(text(ddl))
        except Exception as exc:
            msg = str(exc).lower()
            if any(k in msg for k in ("already exist", "does not exist", "ambiguous", "invalid identifier")):
                pass
            else:
                _log.warning("DDL warning [%s]: %s", ddl[:60], exc)


def create_tables():
    """Idempotent schema creation and evolution. Called once at startup."""
    db_name = settings.snowflake_app_database
    schema_name = settings.snowflake_app_schema

    with engine.connect() as conn:
        # ── Ensure database and schema exist ──────────────────────────────────
        conn.execute(text(f'CREATE DATABASE IF NOT EXISTS "{db_name}"'))
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{db_name}"."{schema_name}"'))

        # ── Rename old table if still using the legacy name ───────────────────
        # data_assets was renamed to assets in the Asset Registry redesign.
        _run_ddl(conn, ["ALTER TABLE data_assets RENAME TO assets"])

        # ── Additive column migrations (idempotent) ───────────────────────────
        _run_ddl(conn, [
            # snowflake_connections additions
            "ALTER TABLE snowflake_connections ADD COLUMN connection_type VARCHAR(50) DEFAULT 'named'",
            "ALTER TABLE snowflake_connections ADD COLUMN is_primary_target BOOLEAN DEFAULT FALSE",
            "ALTER TABLE snowflake_connections ADD COLUMN excluded_databases VARIANT",
            "ALTER TABLE snowflake_connections ADD COLUMN excluded_schemas VARIANT",
            "ALTER TABLE snowflake_connections ADD COLUMN filter_mode VARCHAR(20) DEFAULT 'exclude'",
            "ALTER TABLE snowflake_connections ADD COLUMN included_databases VARIANT",
            "ALTER TABLE snowflake_connections ADD COLUMN included_schemas VARIANT",
            'ALTER TABLE snowflake_connections ADD COLUMN "environment" VARCHAR(20)',
            "ALTER TABLE snowflake_connections ADD COLUMN last_successful_scan_at TIMESTAMP_NTZ",
            "ALTER TABLE snowflake_connections ADD COLUMN scan_readiness_status VARCHAR(20) DEFAULT 'not_tested'",
            # dq_rules additions (governance upgrade)
            "ALTER TABLE dq_rules ADD COLUMN rule_category VARCHAR(50)",
            "ALTER TABLE dq_rules ADD COLUMN version INTEGER DEFAULT 1",
            "ALTER TABLE dq_rules ADD COLUMN sla_threshold FLOAT",
            "ALTER TABLE dq_rules ADD COLUMN approved_by VARCHAR(200)",
            "ALTER TABLE dq_rules ADD COLUMN rejected_by VARCHAR(200)",
            "ALTER TABLE dq_rules ADD COLUMN rejection_reason TEXT",
            "ALTER TABLE dq_rules ADD COLUMN business_owner_name VARCHAR(200)",
            "ALTER TABLE dq_rules ADD COLUMN business_owner_email VARCHAR(200)",
            # Asset Registry: generic description field
            "ALTER TABLE assets ADD COLUMN description TEXT",
            # Asset Registry hierarchy fields (added in registry evolution)
            "ALTER TABLE assets ADD COLUMN parent_asset_id VARCHAR(36)",
            "ALTER TABLE assets ADD COLUMN asset_type VARCHAR(50) DEFAULT 'table'",
            "ALTER TABLE assets ADD COLUMN physical_name VARCHAR(500)",
            "ALTER TABLE assets ADD COLUMN display_name VARCHAR(500)",
            "ALTER TABLE assets ADD COLUMN qualified_name VARCHAR(2000)",
            "ALTER TABLE assets ADD COLUMN path VARCHAR(2000)",
            "ALTER TABLE assets ADD COLUMN status VARCHAR(50) DEFAULT 'active'",
            "ALTER TABLE assets ADD COLUMN owner_user_id VARCHAR(36)",
            "ALTER TABLE assets ADD COLUMN owner_team_id VARCHAR(36)",
            "ALTER TABLE assets ADD COLUMN steward_user_id VARCHAR(36)",
            "ALTER TABLE assets ADD COLUMN discovered_at TIMESTAMP_NTZ",
            "ALTER TABLE assets ADD COLUMN last_seen_at TIMESTAMP_NTZ",
            # metadata store columns (migration 0011)
            "ALTER TABLE assets ADD COLUMN last_scanned_at TIMESTAMP_NTZ",
            "ALTER TABLE assets ADD COLUMN scan_status VARCHAR(20)",
            "ALTER TABLE assets ADD COLUMN scan_duration_ms INTEGER",
            "ALTER TABLE assets ADD COLUMN scan_version VARCHAR(50)",
            "ALTER TABLE assets ADD COLUMN latest_profile_score FLOAT",
            "ALTER TABLE assets ADD COLUMN latest_quality_status VARCHAR(20)",
            "ALTER TABLE assets ADD COLUMN is_critical_data_element BOOLEAN DEFAULT FALSE",
            "ALTER TABLE assets ADD COLUMN attached_rule_count INTEGER DEFAULT 0",
            "ALTER TABLE asset_source_meta ADD COLUMN partition_info VARIANT",
            "ALTER TABLE asset_source_meta ADD COLUMN last_modified_at TIMESTAMP_NTZ",
            "ALTER TABLE asset_source_meta ADD COLUMN table_created_at TIMESTAMP_NTZ",
            "ALTER TABLE column_metadata ADD COLUMN precision INTEGER",
            "ALTER TABLE column_metadata ADD COLUMN scale INTEGER",
            "ALTER TABLE column_metadata ADD COLUMN character_max_length INTEGER",
            "ALTER TABLE column_metadata ADD COLUMN default_value TEXT",
            "ALTER TABLE column_metadata ADD COLUMN is_partition_key BOOLEAN DEFAULT FALSE",
            "ALTER TABLE column_metadata ADD COLUMN partition_key_index INTEGER",
            # glossary_terms approval workflow fields
            "ALTER TABLE glossary_terms ADD COLUMN reviewed_by VARCHAR(200)",
            "ALTER TABLE glossary_terms ADD COLUMN review_note TEXT",
            "ALTER TABLE glossary_terms ADD COLUMN reviewed_at TIMESTAMP_NTZ",
        ])
        conn.commit()

    # ── Snowflake doesn't support indexes on standard tables ──────────────────
    for table in Base.metadata.tables.values():
        table.indexes.clear()

    # ── Create all tables from ORM metadata (skips existing) ─────────────────
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

    # ── Backfill asset_source_meta from legacy Snowflake columns on assets ────
    # Runs only if assets has the old SF columns AND asset_source_meta is empty.
    with engine.connect() as conn:
        try:
            existing = conn.execute(text("SELECT COUNT(*) FROM asset_source_meta")).scalar()
            if existing == 0:
                conn.execute(text("""
                    INSERT INTO asset_source_meta
                        (asset_id, provider, sf_account, sf_database_name, sf_schema_name,
                         sf_table_name, sf_table_type, view_definition, row_count, bytes,
                         created_at, updated_at)
                    SELECT asset_id, 'snowflake',
                           snowflake_account, sf_database_name, sf_schema_name,
                           sf_table_name, table_type, view_definition, row_count, bytes,
                           created_at, updated_at
                    FROM assets
                    WHERE sf_table_name IS NOT NULL
                """))
                conn.execute(text("""
                    UPDATE assets
                    SET description = table_description
                    WHERE table_description IS NOT NULL AND description IS NULL
                """))
                conn.commit()
                _log.info("create_tables: backfilled asset_source_meta from legacy assets columns")
        except Exception as exc:
            msg = str(exc).lower()
            if "invalid identifier" in msg or "does not exist" in msg:
                pass  # old SF columns already dropped — nothing to backfill
            else:
                _log.warning("asset_source_meta backfill skipped: %s", exc)


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
