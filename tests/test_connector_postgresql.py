# tests/test_connector_postgresql.py
import pytest
from unittest.mock import MagicMock, patch
from app.connectors.config import ConnectorConfig
from app.connectors.postgresql_adapter import PostgreSQLAdapter, _normalize_pg_type
from app.connectors.errors import AuthenticationError, DriverNotInstalledError, ConnectionTimeoutError


def make_pg_config() -> ConnectorConfig:
    return ConnectorConfig(
        connection_id="pg-1",
        connection_name="Postgres Test",
        database_type="postgresql",
        host="localhost",
        port=5432,
        database="testdb",
        username="dbuser",
        password="secret",
    )


# --- Type normalization ---

def test_normalize_pg_varchar():
    assert _normalize_pg_type("character varying") == "varchar"
    assert _normalize_pg_type("text") == "varchar"

def test_normalize_pg_int():
    assert _normalize_pg_type("integer") == "int"
    assert _normalize_pg_type("bigint") == "int"

def test_normalize_pg_float():
    assert _normalize_pg_type("numeric") == "float"
    assert _normalize_pg_type("double precision") == "float"

def test_normalize_pg_json():
    assert _normalize_pg_type("jsonb") == "json"

def test_normalize_pg_array():
    assert _normalize_pg_type("_int4") == "json"

def test_normalize_pg_unknown():
    assert _normalize_pg_type("custom_type") == "custom_type"


# --- test_connection ---

@pytest.mark.asyncio
async def test_test_connection_driver_missing():
    adapter = PostgreSQLAdapter(make_pg_config())
    with patch("app.connectors.postgresql_adapter._PSYCOPG2_AVAILABLE", False):
        result = await adapter.test_connection()
    assert result["status"] == "error"
    assert result["error_code"] == "DRIVER_NOT_INSTALLED"


@pytest.mark.asyncio
async def test_test_connection_auth_failure():
    adapter = PostgreSQLAdapter(make_pg_config())
    with patch("app.connectors.postgresql_adapter._PSYCOPG2_AVAILABLE", True):
        with patch.object(adapter, "_open_connection", side_effect=AuthenticationError("bad creds")):
            result = await adapter.test_connection()
    assert result["status"] == "error"
    assert result["error_code"] == "AUTH_FAILED"


@pytest.mark.asyncio
async def test_test_connection_success():
    adapter = PostgreSQLAdapter(make_pg_config())
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchone.return_value = ("PostgreSQL 15.3",)
    mock_conn.cursor.return_value = mock_cur
    with patch("app.connectors.postgresql_adapter._PSYCOPG2_AVAILABLE", True):
        with patch.object(adapter, "_open_connection", return_value=mock_conn):
            result = await adapter.test_connection()
    assert result["status"] == "ok"
    mock_conn.close.assert_called_once()


# --- list_databases ---

@pytest.mark.asyncio
async def test_list_databases():
    adapter = PostgreSQLAdapter(make_pg_config())
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchall.return_value = [("mydb",), ("otherdb",)]
    mock_conn.cursor.return_value = mock_cur
    with patch("app.connectors.postgresql_adapter._PSYCOPG2_AVAILABLE", True):
        with patch.object(adapter, "_open_connection", return_value=mock_conn):
            dbs = await adapter.list_databases()
    assert dbs == ["mydb", "otherdb"]


# --- list_columns ---

@pytest.mark.asyncio
async def test_list_columns_normalized():
    adapter = PostgreSQLAdapter(make_pg_config())
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_cur.fetchall.return_value = [
        ("id",    "int4",    "NO",  1, None, "integer",           None),
        ("email", "varchar", "YES", 2, None, "character varying", "User email"),
    ]
    mock_conn.cursor.return_value = mock_cur
    with patch("app.connectors.postgresql_adapter._PSYCOPG2_AVAILABLE", True):
        with patch.object(adapter, "_open_connection", return_value=mock_conn):
            cols = await adapter.list_columns("testdb", "public", "users")
    assert len(cols) == 2
    assert cols[0].name == "id"
    assert cols[0].data_type == "int"
    assert cols[0].is_nullable is False
    assert cols[1].name == "email"
    assert cols[1].data_type == "varchar"
    assert cols[1].is_nullable is True
    assert cols[1].comment == "User email"


# --- factory registration ---

def test_postgresql_adapter_registered():
    from app.connectors.factory import _REGISTRY
    assert "postgresql" in _REGISTRY
    assert "postgres" in _REGISTRY


from app.connectors.mysql_adapter import MySQLAdapter


def test_mysql_adapter_registered():
    from app.connectors.factory import _REGISTRY
    assert "mysql" in _REGISTRY
    assert "mariadb" in _REGISTRY


@pytest.mark.asyncio
async def test_mysql_list_databases_raises_not_implemented():
    from app.connectors.errors import ConnectorNotImplementedError
    adapter = MySQLAdapter(
        ConnectorConfig(connection_id="m1", database_type="mysql", host="localhost")
    )
    with pytest.raises(ConnectorNotImplementedError):
        await adapter.list_databases()


def test_bigquery_adapter_registered():
    from app.connectors.factory import _REGISTRY
    assert "bigquery" in _REGISTRY

def test_s3_adapter_registered():
    from app.connectors.factory import _REGISTRY
    assert "s3" in _REGISTRY


@pytest.mark.asyncio
async def test_sample_rows_rejects_malicious_schema():
    """SQL injection via schema name must raise ValueError before any DB call."""
    adapter = PostgreSQLAdapter(make_pg_config())
    with pytest.raises(ValueError, match="Invalid identifier"):
        await adapter.sample_rows("testdb", "public; DROP TABLE assets;--", "users")


@pytest.mark.asyncio
async def test_sample_rows_rejects_malicious_table():
    """SQL injection via table name must raise ValueError before any DB call."""
    adapter = PostgreSQLAdapter(make_pg_config())
    with pytest.raises(ValueError, match="Invalid identifier"):
        await adapter.sample_rows("testdb", "public", "users; SELECT 1;--")


@pytest.mark.asyncio
async def test_sample_rows_uses_sql_identifier(monkeypatch):
    """Safe schema/table names must use psycopg2.sql.Identifier, not f-strings."""
    import psycopg2.sql as pgsql

    adapter = PostgreSQLAdapter(make_pg_config())
    executed_queries = []

    def fake_open_connection(database=None):
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_cur.__enter__ = MagicMock(return_value=mock_cur)
        mock_cur.__exit__ = MagicMock(return_value=False)
        mock_cur.fetchall.return_value = [{"id": 1, "name": "Alice"}]

        def capture_execute(query, params):
            executed_queries.append((query, params))

        mock_cur.execute = capture_execute
        mock_conn.cursor.return_value = mock_cur
        return mock_conn

    monkeypatch.setattr(adapter, "_open_connection", fake_open_connection)

    # psycopg2 is not available in the test environment so we patch at the call site
    with patch("app.connectors.postgresql_adapter.psycopg2.extras.RealDictCursor", MagicMock()):
        try:
            await adapter.sample_rows("testdb", "public", "users")
        except Exception:
            pass  # we only care that execute was called with a Composed object

    # The query passed to execute must be a psycopg2 Composed object, not a plain string
    assert executed_queries, "execute() was never called — monkeypatch did not wire up correctly"
    query_arg = executed_queries[0][0]
    assert isinstance(query_arg, pgsql.Composed), (
        f"Expected psycopg2.sql.Composed, got {type(query_arg).__name__!r}. "
        "sample_rows must use psycopg2.sql.Identifier, not f-strings."
    )
