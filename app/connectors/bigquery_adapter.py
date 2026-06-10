# app/connectors/bigquery_adapter.py
from __future__ import annotations
from typing import Optional

from app.connectors.base import BaseConnector
from app.connectors.errors import DriverNotInstalledError, ConnectorNotImplementedError
from app.connectors.factory import register_adapter
from app.schemas.connector_schemas import (
    ColumnMetadataSchema, TableMetadataSchema, ScanResult, ConnectorHealth, ConnectorHealthDetail,
)

try:
    from google.cloud import bigquery as _bq
    _BQ_AVAILABLE = True
except ImportError:
    _BQ_AVAILABLE = False


class BigQueryAdapter(BaseConnector):
    """Google BigQuery connector. All methods are scaffolds pending auth implementation."""

    def _check_driver(self) -> None:
        if not _BQ_AVAILABLE:
            raise DriverNotInstalledError(
                "google-cloud-bigquery is not installed.",
                suggestion="Run: pip install google-cloud-bigquery==3.26.0",
            )

    async def test_connection(self) -> dict:
        try:
            self._check_driver()
        except DriverNotInstalledError as exc:
            return {"status": "error", "error_code": exc.error_code, "message": exc.message, "suggestion": exc.suggestion}
        return {"status": "error", "error_code": "NOT_IMPLEMENTED", "message": "BigQuery test_connection not yet implemented."}

    async def list_databases(self) -> list[str]:
        raise ConnectorNotImplementedError("list_databases not yet implemented for BigQuery.")

    async def list_schemas(self, database: str) -> list[str]:
        raise ConnectorNotImplementedError("list_schemas not yet implemented for BigQuery.")

    async def list_tables(self, database: str, schema: str) -> list[TableMetadataSchema]:
        raise ConnectorNotImplementedError("list_tables not yet implemented for BigQuery.")

    async def list_columns(self, database: str, schema: str, table: str) -> list[ColumnMetadataSchema]:
        raise ConnectorNotImplementedError("list_columns not yet implemented for BigQuery.")

    async def get_table_metadata(self, database: str, schema: str, table: str) -> TableMetadataSchema:
        raise ConnectorNotImplementedError("get_table_metadata not yet implemented for BigQuery.")

    async def sample_rows(self, database: str, schema: str, table: str, limit: int = 100) -> list[dict]:
        raise ConnectorNotImplementedError("sample_rows not yet implemented for BigQuery.")

    async def run_metadata_scan(self, database: str, schema: Optional[str] = None) -> ScanResult:
        raise ConnectorNotImplementedError("run_metadata_scan not yet implemented for BigQuery.")

    async def get_health(self) -> ConnectorHealth:
        result = await self.test_connection()
        status = "healthy" if result["status"] == "ok" else "unreachable"
        return ConnectorHealth(
            connection_id=self.config.connection_id,
            connection_name=self.config.connection_name,
            database_type="bigquery",
            environment=self.config.environment,
            status=status,
            scan_readiness_status="not_tested",
            detail=ConnectorHealthDetail(),
        )


register_adapter("bigquery", BigQueryAdapter)
