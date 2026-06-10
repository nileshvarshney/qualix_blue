# app/connectors/snowflake_adapter.py
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import Optional

import snowflake.connector
import snowflake.connector.errors

from app.connectors.base import BaseConnector
from app.connectors.config import ConnectorConfig
from app.connectors.errors import AuthenticationError, ConnectionTimeoutError, DatabaseNotFoundError
from app.connectors.factory import register_adapter
from app.schemas.connector_schemas import (
    ColumnMetadataSchema, TableMetadataSchema, ScanResult, ConnectorHealth, ConnectorHealthDetail,
)


class SnowflakeAdapter(BaseConnector):
    """Snowflake source connector — full implementation."""

    def _open_connection(self, database: Optional[str] = None):
        cfg = self.config
        params: dict = {
            "account": cfg.account,
            "user": cfg.username,
            "password": cfg.password,
            "login_timeout": cfg.connect_timeout,
        }
        if cfg.warehouse:
            params["warehouse"] = cfg.warehouse
        if cfg.role:
            params["role"] = cfg.role
        if database or cfg.database:
            params["database"] = database or cfg.database
        try:
            return snowflake.connector.connect(**params)
        except snowflake.connector.errors.DatabaseError as exc:
            msg = str(exc)
            if "Incorrect username or password" in msg or "Authentication" in msg:
                raise AuthenticationError(
                    "Invalid Snowflake credentials.",
                    suggestion="Verify account, username and password.",
                ) from exc
            raise ConnectionTimeoutError(f"Snowflake connection failed: {msg}") from exc

    async def test_connection(self) -> dict:
        steps: list[dict] = []
        try:
            conn = await asyncio.to_thread(self._open_connection)
            conn.close()
            steps.append({"label": "Authentication", "status": "ok"})
            return {"status": "ok", "steps": steps}
        except AuthenticationError as exc:
            steps.append({"label": "Authentication", "status": "error", "detail": exc.message})
            return {"status": "error", "error_code": exc.error_code, "message": exc.message, "suggestion": exc.suggestion, "steps": steps}
        except Exception as exc:
            steps.append({"label": "Connectivity", "status": "error", "detail": str(exc)})
            return {"status": "error", "error_code": "CONNECTION_ERROR", "message": str(exc), "steps": steps}

    async def list_databases(self) -> list[str]:
        def _run() -> list[str]:
            conn = self._open_connection()
            cur = conn.cursor()
            try:
                cur.execute("SHOW DATABASES")
                return [row[1] for row in cur.fetchall()]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def list_schemas(self, database: str) -> list[str]:
        def _run() -> list[str]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(f'SHOW SCHEMAS IN DATABASE "{database}"')
                return [row[1] for row in cur.fetchall()]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def list_tables(self, database: str, schema: str) -> list[TableMetadataSchema]:
        def _run() -> list[TableMetadataSchema]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(f"""
                    SELECT table_name, table_type, row_count, bytes,
                           created, last_altered, comment
                    FROM "{database}".information_schema.tables
                    WHERE table_schema = '{schema.upper()}'
                    ORDER BY table_name
                """)
                return [
                    TableMetadataSchema(
                        database=database,
                        schema_name=schema,
                        table_name=row[0],
                        table_type=row[1],
                        row_count=row[2],
                        size_bytes=row[3],
                        created_at=row[4],
                        last_modified_at=row[5],
                        comment=row[6],
                    )
                    for row in cur.fetchall()
                ]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def list_columns(self, database: str, schema: str, table: str) -> list[ColumnMetadataSchema]:
        def _run() -> list[ColumnMetadataSchema]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(f"""
                    SELECT column_name, data_type, is_nullable, ordinal_position,
                           column_default, comment
                    FROM "{database}".information_schema.columns
                    WHERE table_schema = '{schema.upper()}'
                      AND table_name = '{table.upper()}'
                    ORDER BY ordinal_position
                """)
                return [
                    ColumnMetadataSchema(
                        name=row[0],
                        data_type=_normalize_sf_type(row[1]),
                        raw_type=row[1],
                        is_nullable=(row[2] == "YES"),
                        ordinal_position=row[3],
                        default_value=row[4],
                        comment=row[5],
                    )
                    for row in cur.fetchall()
                ]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def get_table_metadata(self, database: str, schema: str, table: str) -> TableMetadataSchema:
        tables = await self.list_tables(database, schema)
        meta = next((t for t in tables if t.table_name.upper() == table.upper()), None)
        if meta is None:
            raise DatabaseNotFoundError(f"Table {schema}.{table} not found in {database}.")
        meta.columns = await self.list_columns(database, schema, table)
        return meta

    async def sample_rows(self, database: str, schema: str, table: str, limit: int = 100) -> list[dict]:
        def _run() -> list[dict]:
            conn = self._open_connection(database=database)
            cur = conn.cursor()
            try:
                cur.execute(f'SELECT * FROM "{database}"."{schema}"."{table}" LIMIT {limit}')
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row)) for row in cur.fetchall()]
            finally:
                cur.close(); conn.close()
        return await asyncio.to_thread(_run)

    async def run_metadata_scan(self, database: str, schema: Optional[str] = None) -> ScanResult:
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
        return ConnectorHealth(
            connection_id=self.config.connection_id,
            connection_name=self.config.connection_name,
            database_type="snowflake",
            environment=self.config.environment,
            status=status,
            scan_readiness_status="ready" if status == "healthy" else "unavailable",
            detail=ConnectorHealthDetail(latency_ms=latency_ms),
        )


def _normalize_sf_type(sf_type: str) -> str:
    t = sf_type.upper()
    if t in ("VARCHAR", "TEXT", "STRING", "CHAR", "CHARACTER"):
        return "varchar"
    if t in ("NUMBER", "NUMERIC", "DECIMAL", "INT", "INTEGER", "BIGINT", "SMALLINT", "BYTEINT"):
        return "int"
    if t in ("FLOAT", "FLOAT4", "FLOAT8", "DOUBLE", "REAL"):
        return "float"
    if t == "BOOLEAN":
        return "boolean"
    if t == "DATE":
        return "date"
    if t in ("TIMESTAMP", "TIMESTAMP_NTZ", "TIMESTAMP_LTZ", "TIMESTAMP_TZ", "DATETIME"):
        return "datetime"
    if t in ("VARIANT", "OBJECT", "ARRAY"):
        return "json"
    if t in ("BINARY", "VARBINARY"):
        return "bytes"
    return sf_type.lower()


register_adapter("snowflake", SnowflakeAdapter)
