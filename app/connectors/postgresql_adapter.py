# app/connectors/postgresql_adapter.py
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import Optional

from app.connectors.base import BaseConnector
from app.connectors.config import ConnectorConfig
from app.connectors.errors import (
    AuthenticationError, ConnectionTimeoutError, DatabaseNotFoundError,
    DriverNotInstalledError,
)
from app.connectors.factory import register_adapter
from app.schemas.connector_schemas import (
    ColumnMetadataSchema, TableMetadataSchema, ScanResult, ConnectorHealth, ConnectorHealthDetail,
)

try:
    import psycopg2
    import psycopg2.extras
    import psycopg2.sql as pgsql
    _PSYCOPG2_AVAILABLE = True
except ImportError:
    _PSYCOPG2_AVAILABLE = False


class PostgreSQLAdapter(BaseConnector):
    """PostgreSQL source connector — full implementation."""

    def _check_driver(self) -> None:
        if not _PSYCOPG2_AVAILABLE:
            raise DriverNotInstalledError(
                "psycopg2 is not installed.",
                suggestion="Run: pip install psycopg2-binary",
            )

    def _open_connection(self, database: Optional[str] = None):
        self._check_driver()
        cfg = self.config
        try:
            return psycopg2.connect(
                host=cfg.host,
                port=cfg.port or 5432,
                dbname=database or cfg.database or "postgres",
                user=cfg.username,
                password=cfg.password or "",
                connect_timeout=cfg.connect_timeout,
            )
        except psycopg2.OperationalError as exc:
            msg = str(exc)
            if "password authentication failed" in msg or "authentication failed" in msg:
                raise AuthenticationError(
                    "Invalid PostgreSQL credentials.",
                    suggestion="Verify the username and password.",
                ) from exc
            if "could not connect" in msg or "Connection refused" in msg or "timeout" in msg:
                raise ConnectionTimeoutError(
                    f"Cannot reach PostgreSQL at {cfg.host}:{cfg.port or 5432}.",
                    suggestion="Check host, port, and firewall rules.",
                ) from exc
            raise ConnectionTimeoutError(f"Connection failed: {msg}") from exc

    async def test_connection(self) -> dict:
        steps: list[dict] = []
        try:
            self._check_driver()
            steps.append({"label": "Driver check", "status": "ok"})
        except DriverNotInstalledError as exc:
            return {"status": "error", "error_code": exc.error_code, "message": exc.message, "suggestion": exc.suggestion, "steps": steps}

        def _run() -> str:
            conn = self._open_connection()
            cur = conn.cursor()
            try:
                cur.execute("SELECT version()")
                return cur.fetchone()[0]
            finally:
                cur.close(); conn.close()

        try:
            version = await asyncio.to_thread(_run)
            steps.append({"label": "Authentication", "status": "ok", "detail": version})
            return {"status": "ok", "steps": steps}
        except AuthenticationError as exc:
            steps.append({"label": "Authentication", "status": "error", "detail": exc.message})
            return {"status": "error", "error_code": exc.error_code, "message": exc.message, "suggestion": exc.suggestion, "steps": steps}
        except ConnectionTimeoutError as exc:
            steps.append({"label": "Connectivity", "status": "error", "detail": exc.message})
            return {"status": "error", "error_code": exc.error_code, "message": exc.message, "suggestion": exc.suggestion, "steps": steps}
        except Exception as exc:
            steps.append({"label": "Connection", "status": "error", "detail": str(exc)})
            return {"status": "error", "error_code": "CONNECTION_ERROR", "message": str(exc), "steps": steps}

    async def list_databases(self) -> list[str]:
        def _run() -> list[str]:
            conn = self._open_connection()
            cur = conn.cursor()
            try:
                cur.execute(
                    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
                )
                return [row[0] for row in cur.fetchall()]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def list_schemas(self, database: str) -> list[str]:
        def _run() -> list[str]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(
                    "SELECT schema_name FROM information_schema.schemata "
                    "WHERE catalog_name = %s "
                    "  AND schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') "
                    "ORDER BY schema_name",
                    (database,),
                )
                return [row[0] for row in cur.fetchall()]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def list_tables(self, database: str, schema: str) -> list[TableMetadataSchema]:
        def _run() -> list[TableMetadataSchema]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    SELECT t.table_name,
                           t.table_type,
                           obj_description(
                               (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass,
                               'pg_class'
                           ) AS comment
                    FROM information_schema.tables t
                    WHERE t.table_schema = %s
                    ORDER BY t.table_name
                    """,
                    (schema,),
                )
                return [
                    TableMetadataSchema(
                        database=database,
                        schema_name=schema,
                        table_name=row[0],
                        table_type="TABLE" if row[1] == "BASE TABLE" else row[1],
                        comment=row[2],
                    )
                    for row in cur.fetchall()
                ]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def list_columns(
        self, database: str, schema: str, table: str
    ) -> list[ColumnMetadataSchema]:
        def _run() -> list[ColumnMetadataSchema]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(
                    """
                    SELECT column_name,
                           udt_name,
                           is_nullable,
                           ordinal_position,
                           column_default,
                           data_type,
                           col_description(
                               (quote_ident(table_schema)||'.'||quote_ident(table_name))::regclass,
                               ordinal_position
                           ) AS comment
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (schema, table),
                )
                return [
                    ColumnMetadataSchema(
                        name=row[0],
                        data_type=_normalize_pg_type(row[5]),
                        raw_type=row[1],
                        is_nullable=(row[2] == "YES"),
                        ordinal_position=row[3],
                        default_value=row[4],
                        comment=row[6],
                    )
                    for row in cur.fetchall()
                ]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def get_view_definition(
        self, database: str, schema: str, view: str
    ) -> Optional[str]:
        def _run() -> Optional[str]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(
                    "SELECT view_definition FROM information_schema.views "
                    "WHERE table_schema = %s AND table_name = %s",
                    (schema, view),
                )
                row = cur.fetchone()
                return row[0] if row else None
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def get_table_metadata(
        self, database: str, schema: str, table: str
    ) -> TableMetadataSchema:
        def _approx_rows() -> Optional[int]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(
                    "SELECT reltuples::bigint FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = %s AND c.relname = %s",
                    (schema, table),
                )
                row = cur.fetchone()
                return int(row[0]) if row and row[0] >= 0 else None
            finally:
                cur.close(); conn.close()

        tables = await self.list_tables(database, schema)
        meta = next((t for t in tables if t.table_name == table), None)
        if meta is None:
            raise DatabaseNotFoundError(f"Table {schema}.{table} not found in {database}.")

        approx, columns = await asyncio.gather(
            asyncio.to_thread(_approx_rows),
            self.list_columns(database, schema, table),
        )
        meta.row_count = approx
        meta.columns = columns
        return meta

    async def sample_rows(
        self, database: str, schema: str, table: str, limit: int = 100
    ) -> list[dict]:
        import re
        _IDENT_RE = re.compile(r'^[A-Za-z0-9_$]+$')
        if not _IDENT_RE.match(schema):
            raise ValueError(f"Invalid identifier for schema: {schema!r}")
        if not _IDENT_RE.match(table):
            raise ValueError(f"Invalid identifier for table: {table!r}")

        def _run() -> list[dict]:
            conn = self._open_connection(database=database)
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            try:
                query = pgsql.SQL("SELECT * FROM {}.{} LIMIT %s").format(
                    pgsql.Identifier(schema),
                    pgsql.Identifier(table),
                )
                cur.execute(query, (limit,))
                return [dict(row) for row in cur.fetchall()]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def run_metadata_scan(
        self, database: str, schema: Optional[str] = None
    ) -> ScanResult:
        started = datetime.now(timezone.utc)
        tables: list[TableMetadataSchema] = []
        errors: list[str] = []
        schemas = [schema] if schema else await self.list_schemas(database)
        for s in schemas:
            try:
                schema_tables = await self.list_tables(database, s)
                for t in schema_tables:
                    try:
                        t.columns = await self.list_columns(database, s, t.table_name)
                        tables.append(t)
                    except Exception as exc:
                        errors.append(f"{s}.{t.table_name}: {exc}")
            except Exception as exc:
                errors.append(f"schema {s}: {exc}")
        completed = datetime.now(timezone.utc)
        return ScanResult(
            connection_id=self.config.connection_id,
            database=database,
            schema_name=schema,
            scan_started_at=started,
            scan_completed_at=completed,
            duration_ms=int((completed - started).total_seconds() * 1000),
            tables_discovered=len(tables),
            columns_discovered=sum(len(t.columns) for t in tables),
            tables=tables,
            errors=errors,
            scan_status="success" if not errors else ("partial" if tables else "failed"),
        )

    async def get_health(self) -> ConnectorHealth:
        start = datetime.now(timezone.utc)
        result = await self.test_connection()
        latency_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        status = "healthy" if result["status"] == "ok" else "unreachable"
        version: Optional[str] = None
        for step in result.get("steps", []):
            if step.get("label") == "Authentication" and step.get("detail"):
                version = step["detail"]
        return ConnectorHealth(
            connection_id=self.config.connection_id,
            connection_name=self.config.connection_name,
            database_type="postgresql",
            environment=self.config.environment,
            status=status,
            scan_readiness_status="ready" if status == "healthy" else "unavailable",
            detail=ConnectorHealthDetail(latency_ms=latency_ms, version=version),
        )


def _normalize_pg_type(pg_type: str) -> str:
    t = pg_type.lower()
    if t in ("character varying", "varchar", "text", "char", "character", "name", "citext"):
        return "varchar"
    if t in ("integer", "int", "int4", "int2", "int8", "smallint", "bigint",
             "serial", "bigserial", "smallserial"):
        return "int"
    if t in ("numeric", "decimal", "real", "double precision", "float4", "float8", "money"):
        return "float"
    if t in ("boolean", "bool"):
        return "boolean"
    if t == "date":
        return "date"
    if t in ("timestamp", "timestamp without time zone", "timestamp with time zone",
             "timestamptz", "time", "timetz"):
        return "datetime"
    if t in ("json", "jsonb"):
        return "json"
    if t == "bytea":
        return "bytes"
    if t == "uuid":
        return "varchar"
    if t.startswith("_"):
        return "json"   # PostgreSQL array types
    return t


register_adapter("postgresql", PostgreSQLAdapter)
register_adapter("postgres", PostgreSQLAdapter)
