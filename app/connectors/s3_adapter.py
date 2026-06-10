# app/connectors/s3_adapter.py
from __future__ import annotations
from typing import Optional

from app.connectors.base import BaseConnector
from app.connectors.errors import DriverNotInstalledError, ConnectorNotImplementedError
from app.connectors.factory import register_adapter
from app.schemas.connector_schemas import (
    ColumnMetadataSchema, TableMetadataSchema, ScanResult, ConnectorHealth, ConnectorHealthDetail,
)

try:
    import boto3
    _BOTO3_AVAILABLE = True
except ImportError:
    _BOTO3_AVAILABLE = False


class S3Adapter(BaseConnector):
    """AWS S3 file dataset connector. Metadata-level only — no SQL execution.

    Conceptual mapping:
      database  → S3 bucket
      schema    → top-level prefix (folder)
      table     → individual file/dataset
    """

    def _check_driver(self) -> None:
        if not _BOTO3_AVAILABLE:
            raise DriverNotInstalledError(
                "boto3 is not installed.",
                suggestion="Run: pip install boto3==1.35.0",
            )

    async def test_connection(self) -> dict:
        try:
            self._check_driver()
        except DriverNotInstalledError as exc:
            return {"status": "error", "error_code": exc.error_code, "message": exc.message, "suggestion": exc.suggestion}
        return {"status": "error", "error_code": "NOT_IMPLEMENTED", "message": "S3 test_connection not yet implemented."}

    async def list_databases(self) -> list[str]:
        raise ConnectorNotImplementedError("S3 bucket listing not yet implemented.")

    async def list_schemas(self, database: str) -> list[str]:
        raise ConnectorNotImplementedError("S3 prefix listing not yet implemented.")

    async def list_tables(self, database: str, schema: str) -> list[TableMetadataSchema]:
        raise ConnectorNotImplementedError("S3 file listing not yet implemented.")

    async def list_columns(self, database: str, schema: str, table: str) -> list[ColumnMetadataSchema]:
        raise ConnectorNotImplementedError("S3 column inference (from Parquet/CSV header) not yet implemented.")

    async def get_table_metadata(self, database: str, schema: str, table: str) -> TableMetadataSchema:
        raise ConnectorNotImplementedError("S3 file metadata not yet implemented.")

    async def sample_rows(self, database: str, schema: str, table: str, limit: int = 100) -> list[dict]:
        raise ConnectorNotImplementedError("S3 file sampling not yet implemented.")

    async def run_metadata_scan(self, database: str, schema: Optional[str] = None) -> ScanResult:
        raise ConnectorNotImplementedError("S3 metadata scan not yet implemented.")

    async def get_health(self) -> ConnectorHealth:
        result = await self.test_connection()
        status = "healthy" if result["status"] == "ok" else "unreachable"
        return ConnectorHealth(
            connection_id=self.config.connection_id,
            connection_name=self.config.connection_name,
            database_type="s3",
            environment=self.config.environment,
            status=status,
            scan_readiness_status="not_tested",
            detail=ConnectorHealthDetail(),
        )


register_adapter("s3", S3Adapter)
register_adapter("csv", S3Adapter)   # CSV file sources use the same scaffold
