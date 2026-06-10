# tests/test_connector_base.py
import pytest
from datetime import datetime, timezone
from app.schemas.connector_schemas import (
    ColumnMetadataSchema, TableMetadataSchema, ScanResult,
    ConnectorHealth, ConnectorHealthDetail,
)


def test_column_metadata_schema_fields():
    col = ColumnMetadataSchema(
        name="user_id",
        data_type="int",
        raw_type="integer",
        is_nullable=False,
        ordinal_position=1,
    )
    assert col.name == "user_id"
    assert col.data_type == "int"
    assert col.is_nullable is False
    assert col.default_value is None


def test_table_metadata_schema_defaults():
    tbl = TableMetadataSchema(
        database="mydb",
        schema_name="public",
        table_name="users",
        table_type="TABLE",
    )
    assert tbl.columns == []
    assert tbl.row_count is None


def test_scan_result_has_required_fields():
    now = datetime.now(timezone.utc)
    result = ScanResult(
        connection_id="conn-1",
        database="mydb",
        scan_started_at=now,
        scan_completed_at=now,
        duration_ms=0,
        tables_discovered=0,
        columns_discovered=0,
        scan_status="success",
    )
    assert result.errors == []
    assert result.tables == []


def test_connector_health_defaults():
    health = ConnectorHealth(
        connection_id="conn-1",
        connection_name="My DB",
        database_type="postgresql",
        status="healthy",
        scan_readiness_status="ready",
    )
    assert health.environment is None
    assert isinstance(health.detail, ConnectorHealthDetail)
