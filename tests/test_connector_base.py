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


from app.connectors.config import ConnectorConfig, from_orm
from unittest.mock import MagicMock


def test_connector_config_defaults():
    cfg = ConnectorConfig(connection_id="c1", database_type="postgresql")
    assert cfg.host is None
    assert cfg.port is None
    assert cfg.connect_timeout == 30
    assert cfg.query_timeout == 300


def test_from_orm_maps_fields():
    conn = MagicMock()
    conn.connection_id = "c1"
    conn.connection_name = "Test"
    conn.database_type = "postgresql"
    conn.account = None
    conn.sf_user = "dbuser"
    conn.password = "decrypted_pass"
    conn.warehouse = None
    conn.role = None
    conn.host = "localhost"
    conn.port = "5432"
    conn.default_database = "mydb"
    conn.project = None
    conn.key_file = None
    conn.file_path = None
    conn.base_url = None
    conn.auth_type = None
    conn.connection_string = None
    conn.environment = "dev"

    cfg = from_orm(conn)
    assert cfg.connection_id == "c1"
    assert cfg.username == "dbuser"
    assert cfg.password == "decrypted_pass"
    assert cfg.port == 5432
    assert cfg.environment == "dev"


from app.connectors.base import BaseConnector
import inspect


def test_base_connector_is_abstract():
    assert inspect.isabstract(BaseConnector)


def test_base_connector_required_methods():
    required = {
        "test_connection", "list_databases", "list_schemas",
        "list_tables", "list_columns", "get_table_metadata",
        "sample_rows", "run_metadata_scan", "get_health",
    }
    abstract_methods = BaseConnector.__abstractmethods__
    assert required == abstract_methods


def test_base_connector_cannot_be_instantiated():
    cfg = ConnectorConfig(connection_id="c1", database_type="test")
    with pytest.raises(TypeError):
        BaseConnector(cfg)
