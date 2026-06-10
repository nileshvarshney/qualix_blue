# app/connectors/mysql_adapter.py
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import Optional

from app.connectors.base import BaseConnector
from app.connectors.config import ConnectorConfig
from app.connectors.errors import DriverNotInstalledError, ConnectorNotImplementedError
from app.connectors.factory import register_adapter
from app.schemas.connector_schemas import (
    ColumnMetadataSchema, TableMetadataSchema, ScanResult, ConnectorHealth, ConnectorHealthDetail,
)

try:
    import pymysql
    _PYMYSQL_AVAILABLE = True
except ImportError:
    _PYMYSQL_AVAILABLE = False


class MySQLAdapter(BaseConnector):
    """MySQL / MariaDB connector. test_connection is implemented; metadata methods are scaffolds."""

    def _check_driver(self) -> None:
        if not _PYMYSQL_AVAILABLE:
            raise DriverNotInstalledError(
                "pymysql is not installed.",
                suggestion="Run: pip install pymysql==1.1.1",
            )

    async def test_connection(self) -> dict:
        try:
            self._check_driver()
        except DriverNotInstalledError as exc:
            return {"status": "error", "error_code": exc.error_code, "message": exc.message, "suggestion": exc.suggestion}

        def _run():
            conn = pymysql.connect(
                host=self.config.host,
                port=self.config.port or 3306,
                user=self.config.username,
                password=self.config.password or "",
                database=self.config.database,
                connect_timeout=self.config.connect_timeout,
            )
            conn.close()

        try:
            await asyncio.to_thread(_run)
            return {"status": "ok", "steps": [{"label": "Authentication", "status": "ok"}]}
        except Exception as exc:
            return {"status": "error", "error_code": "CONNECTION_ERROR", "message": str(exc)}

    async def list_databases(self) -> list[str]:
        raise ConnectorNotImplementedError("list_databases not yet implemented for MySQL.")

    async def list_schemas(self, database: str) -> list[str]:
        raise ConnectorNotImplementedError("list_schemas not yet implemented for MySQL.")

    async def list_tables(self, database: str, schema: str) -> list[TableMetadataSchema]:
        raise ConnectorNotImplementedError("list_tables not yet implemented for MySQL.")

    async def list_columns(self, database: str, schema: str, table: str) -> list[ColumnMetadataSchema]:
        raise ConnectorNotImplementedError("list_columns not yet implemented for MySQL.")

    async def get_table_metadata(self, database: str, schema: str, table: str) -> TableMetadataSchema:
        raise ConnectorNotImplementedError("get_table_metadata not yet implemented for MySQL.")

    async def sample_rows(self, database: str, schema: str, table: str, limit: int = 100) -> list[dict]:
        raise ConnectorNotImplementedError("sample_rows not yet implemented for MySQL.")

    async def run_metadata_scan(self, database: str, schema: Optional[str] = None) -> ScanResult:
        raise ConnectorNotImplementedError("run_metadata_scan not yet implemented for MySQL.")

    async def get_health(self) -> ConnectorHealth:
        result = await self.test_connection()
        status = "healthy" if result["status"] == "ok" else "unreachable"
        return ConnectorHealth(
            connection_id=self.config.connection_id,
            connection_name=self.config.connection_name,
            database_type="mysql",
            environment=self.config.environment,
            status=status,
            scan_readiness_status="not_tested" if status == "healthy" else "unavailable",
            detail=ConnectorHealthDetail(),
        )


register_adapter("mysql", MySQLAdapter)
register_adapter("mariadb", MySQLAdapter)
