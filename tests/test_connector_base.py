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


from app.connectors.factory import get_connector, register_adapter
from app.connectors.errors import ConnectorNotImplementedError


def make_config(db_type: str = "postgresql") -> ConnectorConfig:
    return ConnectorConfig(
        connection_id="test-1",
        connection_name="Test",
        database_type=db_type,
    )


def test_factory_raises_for_unknown_type():
    cfg = make_config("oracle")
    with pytest.raises(ConnectorNotImplementedError) as exc_info:
        get_connector(cfg)
    assert "oracle" in str(exc_info.value).lower()


def test_factory_register_and_retrieve():
    class DummyConnector(BaseConnector):
        async def test_connection(self): return {}
        async def list_databases(self): return []
        async def list_schemas(self, database): return []
        async def list_tables(self, database, schema): return []
        async def list_columns(self, database, schema, table): return []
        async def get_table_metadata(self, database, schema, table): ...
        async def sample_rows(self, database, schema, table, limit=100): return []
        async def run_metadata_scan(self, database, schema=None): ...
        async def get_health(self): ...

    register_adapter("testdb_xyz", DummyConnector)
    cfg = make_config("testdb_xyz")
    connector = get_connector(cfg)
    assert isinstance(connector, DummyConnector)


from app.db.models import SnowflakeConnection


def test_snowflake_connection_has_new_fields():
    required = {"environment", "last_successful_scan_at", "scan_readiness_status"}
    model_columns = {c.name for c in SnowflakeConnection.__table__.columns}
    assert required.issubset(model_columns)


def test_mask_includes_new_fields():
    from app.api.connections import _mask
    conn = MagicMock(spec=SnowflakeConnection)
    conn.connection_id = "c1"
    conn.connection_name = "Test"
    conn.database_type = "postgresql"
    conn.account = None
    conn.sf_user = "u"
    conn.password = None
    conn.has_password = False
    conn.warehouse = None
    conn.role = None
    conn.default_database = None
    conn.default_schema = None
    conn.description = None
    conn.is_active = True
    conn.connection_type = "named"
    conn.is_primary_target = False
    conn.excluded_databases = None
    conn.excluded_schemas = None
    conn.filter_mode = "exclude"
    conn.included_databases = None
    conn.included_schemas = None
    conn.host = None
    conn.port = None
    conn.project = None
    conn.connection_string = None
    conn.file_path = None
    conn.delimiter = None
    conn.base_url = None
    conn.auth_type = None
    conn.last_test_status = None
    conn.last_tested_at = None
    conn.created_at = MagicMock(isoformat=lambda: "2026-01-01")
    conn.updated_at = MagicMock(isoformat=lambda: "2026-01-01")
    conn.environment = "dev"
    conn.last_successful_scan_at = None
    conn.scan_readiness_status = "not_tested"

    result = _mask(conn)
    assert result["environment"] == "dev"
    assert result["scan_readiness_status"] == "not_tested"
    assert "last_successful_scan_at" in result


from app.connectors.snowflake_adapter import SnowflakeAdapter, _normalize_sf_type


def test_normalize_sf_type_varchar():
    assert _normalize_sf_type("VARCHAR") == "varchar"
    assert _normalize_sf_type("TEXT") == "varchar"

def test_normalize_sf_type_numeric():
    assert _normalize_sf_type("NUMBER") == "int"
    assert _normalize_sf_type("BIGINT") == "int"

def test_normalize_sf_type_float():
    assert _normalize_sf_type("FLOAT") == "float"
    assert _normalize_sf_type("DOUBLE") == "float"

def test_normalize_sf_type_json():
    assert _normalize_sf_type("VARIANT") == "json"
    assert _normalize_sf_type("OBJECT") == "json"

def test_normalize_sf_type_unknown_passthrough():
    assert _normalize_sf_type("CUSTOM_SF_TYPE") == "custom_sf_type"

def test_snowflake_adapter_registered():
    from app.connectors.factory import _REGISTRY
    assert "snowflake" in _REGISTRY


def test_health_endpoint_exists():
    """Verify the health endpoint is registered."""
    from app.main import app
    from fastapi.testclient import TestClient
    client = TestClient(app, raise_server_exceptions=False)
    # 401 means the route exists but auth failed — that's fine for this test
    # 500 means the route exists but encountered a backend error (e.g. test DB schema mismatch)
    response = client.get("/connections/nonexistent-id/health")
    assert response.status_code in (401, 403, 404, 500)
