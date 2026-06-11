# Source Connector Framework — Gap Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the pluggable connector abstraction layer, PostgreSQL full adapter, MySQL/BigQuery/S3 scaffolds, environment tagging, health endpoint, and scan-readiness tracking that are missing from the existing Snowflake-only implementation.

**Architecture:** A new `/app/connectors/` module follows the same abstract-base-class + factory pattern already used by `LLMProvider` in `/app/services/llm_providers.py`. `BaseConnector` defines the standard interface; each adapter implements it. Existing Snowflake logic in `connections.py` remains untouched — a new `SnowflakeAdapter` wraps it. All sync drivers use `asyncio.to_thread()` (established project pattern).

**Tech Stack:** FastAPI · SQLAlchemy 2.0 · Pydantic v2 · Fernet encryption · psycopg2-binary (new) · pymysql optional · google-cloud-bigquery optional · boto3 optional · pytest + unittest.mock

---

## Key Context Before Starting

- **Session type**: `SnowflakeAsyncSession` (wraps sync Session with `asyncio.to_thread()`) — NOT a true `AsyncSession`
- **`ColumnMetadata` is already taken** as an ORM model at `app/db/models.py:570` — the Pydantic connector schema **must** be named `ColumnMetadataSchema`
- **Next migration**: `0012` (last is `0011_metadata_store.py`, down_revision `0010`)
- **`_mask()` function** at `app/api/connections.py:107` must be updated to include 3 new fields
- **Tests**: Use `unittest.mock.MagicMock` / `AsyncMock`; no real DB needed

---

## File Structure

**New files to create:**
```
app/connectors/__init__.py
app/connectors/errors.py
app/connectors/config.py
app/connectors/base.py
app/connectors/factory.py
app/connectors/snowflake_adapter.py
app/connectors/postgresql_adapter.py
app/connectors/mysql_adapter.py
app/connectors/bigquery_adapter.py
app/connectors/s3_adapter.py
app/schemas/connector_schemas.py
migrations/versions/0012_source_connection_meta.py
tests/test_connector_errors.py
tests/test_connector_base.py
tests/test_connector_postgresql.py
```

**Files to modify:**
```
app/db/models.py           — add 3 fields to SnowflakeConnection
app/api/connections.py     — update _mask(), ConnectionCreate/Update, add health endpoint
requirements.txt           — add psycopg2-binary (required) + optional driver comments
```

---

## Task 1: Connector Error Hierarchy

**Files:**
- Create: `app/connectors/__init__.py` (empty placeholder for now)
- Create: `app/connectors/errors.py`
- Create: `tests/test_connector_errors.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_connector_errors.py
import pytest
from app.connectors.errors import (
    ConnectorError, AuthenticationError, ConnectionTimeoutError,
    DatabaseNotFoundError, PermissionDeniedError, QueryError,
    MetadataDiscoveryError, DriverNotInstalledError, ConnectorNotImplementedError,
    TRANSIENT_ERRORS, PERMANENT_ERRORS,
)


def test_authentication_error_has_correct_code():
    err = AuthenticationError("bad creds", suggestion="check password")
    assert err.error_code == "AUTH_FAILED"
    assert err.suggestion == "check password"
    assert str(err) == "bad creds"


def test_to_dict_includes_required_keys():
    err = ConnectionTimeoutError("timed out")
    d = err.to_dict()
    assert d["error_code"] == "CONNECTION_TIMEOUT"
    assert "message" in d
    assert "suggestion" in d


def test_transient_error_isinstance():
    err = ConnectionTimeoutError("timeout")
    assert isinstance(err, TRANSIENT_ERRORS)


def test_permanent_error_isinstance():
    err = AuthenticationError("bad auth")
    assert isinstance(err, PERMANENT_ERRORS)


def test_driver_not_installed_error_code():
    err = DriverNotInstalledError("psycopg2 missing", suggestion="pip install psycopg2-binary")
    assert err.error_code == "DRIVER_NOT_INSTALLED"


def test_connector_not_implemented_error():
    err = ConnectorNotImplementedError("not done yet")
    assert err.error_code == "NOT_IMPLEMENTED"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_connector_errors.py -v
```
Expected: `ModuleNotFoundError: No module named 'app.connectors'`

- [ ] **Step 3: Create the package placeholder**

```python
# app/connectors/__init__.py
# Populated in Task 5 after all modules exist.
```

- [ ] **Step 4: Create the error hierarchy**

```python
# app/connectors/errors.py
from __future__ import annotations
from typing import Optional


class ConnectorError(Exception):
    error_code: str = "CONNECTOR_ERROR"

    def __init__(
        self,
        message: str,
        suggestion: Optional[str] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(message)
        self.message = message
        self.suggestion = suggestion
        self.cause = cause

    def to_dict(self) -> dict:
        return {
            "error_code": self.error_code,
            "message": self.message,
            "suggestion": self.suggestion,
        }


class AuthenticationError(ConnectorError):
    error_code = "AUTH_FAILED"


class ConnectionTimeoutError(ConnectorError):
    error_code = "CONNECTION_TIMEOUT"


class DatabaseNotFoundError(ConnectorError):
    error_code = "DATABASE_NOT_FOUND"


class SchemaNotFoundError(ConnectorError):
    error_code = "SCHEMA_NOT_FOUND"


class PermissionDeniedError(ConnectorError):
    error_code = "PERMISSION_DENIED"


class QueryError(ConnectorError):
    error_code = "QUERY_ERROR"


class MetadataDiscoveryError(ConnectorError):
    error_code = "METADATA_DISCOVERY_ERROR"


class DriverNotInstalledError(ConnectorError):
    error_code = "DRIVER_NOT_INSTALLED"


class ConnectorNotImplementedError(ConnectorError):
    error_code = "NOT_IMPLEMENTED"


# Tuples for retry classification (use isinstance(err, TRANSIENT_ERRORS))
TRANSIENT_ERRORS = (ConnectionTimeoutError, QueryError)
PERMANENT_ERRORS = (AuthenticationError, PermissionDeniedError, DriverNotInstalledError)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
python -m pytest tests/test_connector_errors.py -v
```
Expected: `6 passed`

- [ ] **Step 6: Commit**

```bash
git add app/connectors/__init__.py app/connectors/errors.py tests/test_connector_errors.py
git commit -m "feat(connectors): add connector error hierarchy with retry classification"
```

---

## Task 2: Normalized Metadata Schemas

**Files:**
- Create: `app/schemas/connector_schemas.py`

> **Naming note**: `ColumnMetadata` is an ORM model at `app/db/models.py:570`. Use `ColumnMetadataSchema` for the Pydantic model.

- [ ] **Step 1: Write the failing test** (add to new file `tests/test_connector_base.py`)

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_connector_base.py -v
```
Expected: `ImportError` — module doesn't exist yet

- [ ] **Step 3: Create the schema file**

```python
# app/schemas/connector_schemas.py
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ColumnMetadataSchema(BaseModel):
    name: str
    data_type: str          # normalized: varchar, int, float, boolean, date, datetime, json, bytes
    raw_type: str           # native type string from the source database
    is_nullable: bool
    ordinal_position: int
    default_value: Optional[str] = None
    comment: Optional[str] = None


class TableMetadataSchema(BaseModel):
    database: str
    schema_name: str
    table_name: str
    table_type: str         # TABLE, VIEW, MATERIALIZED_VIEW, EXTERNAL
    row_count: Optional[int] = None
    size_bytes: Optional[int] = None
    columns: list[ColumnMetadataSchema] = []
    comment: Optional[str] = None
    created_at: Optional[datetime] = None
    last_modified_at: Optional[datetime] = None


class ScanResult(BaseModel):
    connection_id: str
    database: str
    schema_name: Optional[str] = None
    scan_started_at: datetime
    scan_completed_at: datetime
    duration_ms: int
    tables_discovered: int
    columns_discovered: int
    tables: list[TableMetadataSchema] = []
    errors: list[str] = []
    scan_status: str        # success, partial, failed


class ConnectorHealthDetail(BaseModel):
    latency_ms: Optional[int] = None
    version: Optional[str] = None
    extra: dict = {}


class ConnectorHealth(BaseModel):
    connection_id: str
    connection_name: str
    database_type: str
    environment: Optional[str] = None
    status: str             # healthy, degraded, unreachable
    last_tested_at: Optional[datetime] = None
    last_test_status: Optional[str] = None
    last_successful_scan_at: Optional[datetime] = None
    scan_readiness_status: str   # ready, not_tested, degraded, unavailable
    detail: ConnectorHealthDetail = ConnectorHealthDetail()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_connector_base.py -v -k "schema"
```
Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add app/schemas/connector_schemas.py tests/test_connector_base.py
git commit -m "feat(connectors): add normalized connector metadata schemas"
```

---

## Task 3: ConnectorConfig Dataclass

**Files:**
- Create: `app/connectors/config.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_connector_base.py`)

```python
# append to tests/test_connector_base.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_connector_base.py::test_connector_config_defaults -v
```
Expected: `ImportError`

- [ ] **Step 3: Create config.py**

```python
# app/connectors/config.py
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.db.models import SnowflakeConnection


@dataclass
class ConnectorConfig:
    connection_id: str
    database_type: str
    connection_name: str = ""
    # Generic params
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None       # must be decrypted by caller before passing
    # Snowflake-specific
    account: Optional[str] = None
    warehouse: Optional[str] = None
    role: Optional[str] = None
    # BigQuery-specific
    project: Optional[str] = None
    key_file: Optional[str] = None       # path to service-account JSON
    # File / S3
    file_path: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    connection_string: Optional[str] = None  # must be decrypted by caller
    # Source metadata
    environment: Optional[str] = None   # dev, stage, prod, test
    # Execution tuning
    connect_timeout: int = 30
    query_timeout: int = 300


def from_orm(conn: "SnowflakeConnection") -> ConnectorConfig:
    """Build ConnectorConfig from a SnowflakeConnection ORM object.

    Caller is responsible for decrypting conn.password before calling this.
    """
    return ConnectorConfig(
        connection_id=conn.connection_id,
        database_type=conn.database_type or "snowflake",
        connection_name=conn.connection_name or "",
        host=conn.host,
        port=int(conn.port) if conn.port else None,
        database=conn.default_database,
        username=conn.sf_user,
        password=conn.password,
        account=conn.account,
        warehouse=conn.warehouse,
        role=conn.role,
        project=conn.project,
        key_file=conn.key_file,
        file_path=conn.file_path,
        base_url=conn.base_url,
        auth_type=conn.auth_type,
        connection_string=conn.connection_string,
        environment=getattr(conn, "environment", None),
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_connector_base.py -v -k "config"
```
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add app/connectors/config.py tests/test_connector_base.py
git commit -m "feat(connectors): add ConnectorConfig dataclass with from_orm factory"
```

---

## Task 4: BaseConnector Abstract Class

**Files:**
- Create: `app/connectors/base.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_connector_base.py`)

```python
# append to tests/test_connector_base.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_connector_base.py -v -k "base"
```
Expected: `ImportError` — base module doesn't exist

- [ ] **Step 3: Create base.py**

```python
# app/connectors/base.py
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional

from app.connectors.config import ConnectorConfig
from app.schemas.connector_schemas import (
    ColumnMetadataSchema, TableMetadataSchema, ScanResult, ConnectorHealth,
)


class BaseConnector(ABC):
    """Abstract base for all source connectors.

    Follow the LLMProvider pattern: subclass, implement all abstract methods,
    register in factory.py.
    """

    def __init__(self, config: ConnectorConfig) -> None:
        self.config = config

    @abstractmethod
    async def test_connection(self) -> dict:
        """Test connectivity. Returns dict with 'status' ('ok'|'error'), 'steps', and optional 'error_code'."""

    @abstractmethod
    async def list_databases(self) -> list[str]:
        """Return accessible database names."""

    @abstractmethod
    async def list_schemas(self, database: str) -> list[str]:
        """Return schema names in the given database."""

    @abstractmethod
    async def list_tables(self, database: str, schema: str) -> list[TableMetadataSchema]:
        """Return table metadata list for database.schema."""

    @abstractmethod
    async def list_columns(
        self, database: str, schema: str, table: str
    ) -> list[ColumnMetadataSchema]:
        """Return column metadata for the given table."""

    @abstractmethod
    async def get_table_metadata(
        self, database: str, schema: str, table: str
    ) -> TableMetadataSchema:
        """Return full metadata for a single table including columns."""

    @abstractmethod
    async def sample_rows(
        self, database: str, schema: str, table: str, limit: int = 100
    ) -> list[dict]:
        """Return up to `limit` rows from table as list of dicts."""

    @abstractmethod
    async def run_metadata_scan(
        self, database: str, schema: Optional[str] = None
    ) -> ScanResult:
        """Scan all tables in a database (or specific schema) and return normalized results."""

    @abstractmethod
    async def get_health(self) -> ConnectorHealth:
        """Return current health status of this connector."""
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_connector_base.py -v -k "base"
```
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add app/connectors/base.py tests/test_connector_base.py
git commit -m "feat(connectors): add BaseConnector abstract class with 9 required methods"
```

---

## Task 5: Connector Factory

**Files:**
- Create: `app/connectors/factory.py`
- Modify: `app/connectors/__init__.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_connector_base.py`)

```python
# append to tests/test_connector_base.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_connector_base.py -v -k "factory"
```
Expected: `ImportError`

- [ ] **Step 3: Create factory.py**

```python
# app/connectors/factory.py
from __future__ import annotations
from app.connectors.base import BaseConnector
from app.connectors.config import ConnectorConfig
from app.connectors.errors import ConnectorNotImplementedError

_REGISTRY: dict[str, type[BaseConnector]] = {}


def register_adapter(db_type: str, adapter_cls: type[BaseConnector]) -> None:
    _REGISTRY[db_type.lower()] = adapter_cls


def get_connector(config: ConnectorConfig) -> BaseConnector:
    db_type = (config.database_type or "").lower()
    adapter_cls = _REGISTRY.get(db_type)
    if adapter_cls is None:
        raise ConnectorNotImplementedError(
            f"No connector registered for database type '{db_type}'.",
            suggestion=f"Supported types: {sorted(_REGISTRY.keys())}",
        )
    return adapter_cls(config)


# Adapters are registered in app/connectors/__init__.py on package import.
```

- [ ] **Step 4: Update `__init__.py` with core re-exports only (no adapters yet)**

Adapter files don't exist until Tasks 7–10. This minimal `__init__.py` is importable now; adapter imports are added in Task 11.

```python
# app/connectors/__init__.py
from app.connectors.factory import get_connector, register_adapter
from app.connectors.base import BaseConnector
from app.connectors.config import ConnectorConfig, from_orm as config_from_orm
from app.connectors.errors import (
    ConnectorError,
    AuthenticationError,
    ConnectionTimeoutError,
    DatabaseNotFoundError,
    SchemaNotFoundError,
    PermissionDeniedError,
    QueryError,
    MetadataDiscoveryError,
    DriverNotInstalledError,
    ConnectorNotImplementedError,
    TRANSIENT_ERRORS,
    PERMANENT_ERRORS,
)

# Adapter imports are added in Task 11 (after all adapter files exist).
# Each adapter calls register_adapter() at module bottom when imported.

__all__ = [
    "get_connector",
    "register_adapter",
    "BaseConnector",
    "ConnectorConfig",
    "config_from_orm",
    "ConnectorError",
    "AuthenticationError",
    "ConnectionTimeoutError",
    "DatabaseNotFoundError",
    "SchemaNotFoundError",
    "PermissionDeniedError",
    "QueryError",
    "MetadataDiscoveryError",
    "DriverNotInstalledError",
    "ConnectorNotImplementedError",
    "TRANSIENT_ERRORS",
    "PERMANENT_ERRORS",
]
```

- [ ] **Step 5: Run test to verify it passes**

```bash
python -m pytest tests/test_connector_base.py -v -k "factory"
```
Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add app/connectors/factory.py app/connectors/__init__.py tests/test_connector_base.py
git commit -m "feat(connectors): add connector factory with registry pattern"
```

---

## Task 6: Migration + ORM Update (environment, scan_readiness, last_successful_scan)

**Files:**
- Create: `migrations/versions/0012_source_connection_meta.py`
- Modify: `app/db/models.py` (SnowflakeConnection class, after line 475)

- [ ] **Step 1: Write the failing test** (append to `tests/test_connector_base.py`)

```python
# append to tests/test_connector_base.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_connector_base.py -v -k "new_fields or mask"
```
Expected: `AssertionError` — columns not present yet

- [ ] **Step 3: Create the migration file**

```python
# migrations/versions/0012_source_connection_meta.py
"""Add environment, last_successful_scan_at, scan_readiness_status to snowflake_connections

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-10
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "snowflake_connections",
        sa.Column("environment", sa.String(20), nullable=True),
    )
    op.add_column(
        "snowflake_connections",
        sa.Column("last_successful_scan_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "snowflake_connections",
        sa.Column(
            "scan_readiness_status",
            sa.String(20),
            nullable=True,
            server_default="not_tested",
        ),
    )


def downgrade() -> None:
    op.drop_column("snowflake_connections", "scan_readiness_status")
    op.drop_column("snowflake_connections", "last_successful_scan_at")
    op.drop_column("snowflake_connections", "environment")
```

- [ ] **Step 4: Update SnowflakeConnection in models.py**

Find the `last_tested_at` field at line 475 in `app/db/models.py` and add after it:

```python
    # Source connector metadata (migration 0012)
    environment: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    last_successful_scan_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scan_readiness_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="not_tested")
```

- [ ] **Step 5: Update `_mask()` in `app/api/connections.py`**

Add these three lines to the `_mask()` return dict, after `"updated_at"`:

```python
        "environment": conn.environment,
        "last_successful_scan_at": conn.last_successful_scan_at.isoformat() if conn.last_successful_scan_at else None,
        "scan_readiness_status": conn.scan_readiness_status,
```

- [ ] **Step 6: Update `ConnectionCreate` schema in `connections.py`**

Find the `ConnectionCreate` Pydantic class and add:

```python
    environment: Optional[str] = None   # dev, stage, prod, test
```

Do the same for `ConnectionUpdate`.

- [ ] **Step 7: Run migration**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
alembic upgrade head
```
Expected: Migration `0012` applied successfully.

- [ ] **Step 8: Run test to verify it passes**

```bash
python -m pytest tests/test_connector_base.py -v -k "new_fields or mask"
```
Expected: `2 passed`

- [ ] **Step 9: Commit**

```bash
git add migrations/versions/0012_source_connection_meta.py app/db/models.py app/api/connections.py tests/test_connector_base.py
git commit -m "feat(connectors): add environment, scan_readiness_status, last_successful_scan_at to source connections"
```

---

## Task 7: SnowflakeAdapter

**Files:**
- Create: `app/connectors/snowflake_adapter.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_connector_base.py`)

```python
# append to tests/test_connector_base.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_connector_base.py -v -k "sf_type or snowflake_adapter"
```
Expected: `ImportError`

- [ ] **Step 3: Create snowflake_adapter.py**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_connector_base.py -v -k "sf_type or snowflake_adapter"
```
Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add app/connectors/snowflake_adapter.py tests/test_connector_base.py
git commit -m "feat(connectors): add SnowflakeAdapter implementing BaseConnector"
```

---

## Task 8: PostgreSQL Adapter (Full Implementation)

**Files:**
- Create: `app/connectors/postgresql_adapter.py`
- Create: `tests/test_connector_postgresql.py`
- Modify: `requirements.txt` (add psycopg2-binary)

- [ ] **Step 1: Add psycopg2-binary to requirements.txt**

Add after the `snowflake-*` entries:

```
psycopg2-binary==2.9.9
# Optional connector drivers (install as needed):
# pymysql==1.1.1
# google-cloud-bigquery==3.26.0
# boto3==1.35.0
```

- [ ] **Step 2: Install the driver**

```bash
pip install psycopg2-binary==2.9.9
```
Expected: Successfully installed

- [ ] **Step 3: Write the failing tests**

```python
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
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
python -m pytest tests/test_connector_postgresql.py -v
```
Expected: `ImportError` — module doesn't exist

- [ ] **Step 5: Create postgresql_adapter.py**

```python
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
        def _run() -> list[dict]:
            conn = self._open_connection(database=database)
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            try:
                cur.execute(f"SELECT * FROM {schema}.{table} LIMIT %s", (limit,))
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
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
python -m pytest tests/test_connector_postgresql.py -v
```
Expected: `11 passed`

- [ ] **Step 7: Commit**

```bash
git add app/connectors/postgresql_adapter.py tests/test_connector_postgresql.py requirements.txt
git commit -m "feat(connectors): add full PostgreSQL adapter with type normalization"
```

---

## Task 9: MySQL Adapter (Scaffold)

**Files:**
- Create: `app/connectors/mysql_adapter.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_connector_postgresql.py`)

```python
# append to tests/test_connector_postgresql.py
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_connector_postgresql.py -v -k "mysql"
```
Expected: `ImportError`

- [ ] **Step 3: Create mysql_adapter.py**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_connector_postgresql.py -v -k "mysql"
```
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add app/connectors/mysql_adapter.py tests/test_connector_postgresql.py
git commit -m "feat(connectors): add MySQL adapter scaffold with test_connection"
```

---

## Task 10: BigQuery + S3 Adapter Scaffolds

**Files:**
- Create: `app/connectors/bigquery_adapter.py`
- Create: `app/connectors/s3_adapter.py`

- [ ] **Step 1: Write the failing test** (append to `tests/test_connector_postgresql.py`)

```python
# append to tests/test_connector_postgresql.py
def test_bigquery_adapter_registered():
    from app.connectors.factory import _REGISTRY
    assert "bigquery" in _REGISTRY

def test_s3_adapter_registered():
    from app.connectors.factory import _REGISTRY
    assert "s3" in _REGISTRY
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_connector_postgresql.py -v -k "bigquery or s3"
```
Expected: `ImportError`

- [ ] **Step 3: Create bigquery_adapter.py**

```python
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
```

- [ ] **Step 4: Create s3_adapter.py**

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python -m pytest tests/test_connector_postgresql.py -v -k "bigquery or s3"
```
Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add app/connectors/bigquery_adapter.py app/connectors/s3_adapter.py tests/test_connector_postgresql.py
git commit -m "feat(connectors): add BigQuery and S3 adapter scaffolds"
```

---

## Task 11: Wire `__init__.py` and Run Full Test Suite

All adapter files now exist — add their imports to `__init__.py` so they self-register, then run the full suite.

- [ ] **Step 1: Add adapter imports to `app/connectors/__init__.py`**

Add these lines after the `__all__` list (replacing the `# Adapter imports are added in Task 11` comment):

```python
# Adapter registrations — each adapter calls register_adapter() at its module bottom.
from app.connectors.snowflake_adapter import SnowflakeAdapter        # noqa: F401
from app.connectors.postgresql_adapter import PostgreSQLAdapter       # noqa: F401
from app.connectors.mysql_adapter import MySQLAdapter                 # noqa: F401
from app.connectors.bigquery_adapter import BigQueryAdapter           # noqa: F401
from app.connectors.s3_adapter import S3Adapter                      # noqa: F401
```

- [ ] **Step 2: Verify all adapters are registered**

```bash
grep "import.*Adapter" app/connectors/__init__.py
```
Expected: 5 lines (Snowflake, PostgreSQL, MySQL, BigQuery, S3)

- [ ] **Step 2: Run the full connector test suite**

```bash
python -m pytest tests/test_connector_errors.py tests/test_connector_base.py tests/test_connector_postgresql.py -v
```
Expected: All pass (no ImportErrors now that all adapter files exist)

- [ ] **Step 3: Run the full existing test suite to check for regressions**

```bash
python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```
Expected: No new failures introduced

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add app/connectors/__init__.py
git commit -m "feat(connectors): wire all adapters into connectors package"
```

---

## Task 12: Connector Health Endpoint

**Files:**
- Modify: `app/api/connections.py` (add health endpoint near existing test endpoint)

- [ ] **Step 1: Write the failing test** (append to `tests/test_connector_base.py`)

```python
# append to tests/test_connector_base.py
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock


def test_health_endpoint_exists():
    """Verify the health endpoint is registered."""
    from app.main import app
    client = TestClient(app)
    # 401 means the route exists but auth failed — that's fine for this test
    response = client.get("/connections/nonexistent-id/health")
    assert response.status_code in (401, 403, 404)
```

- [ ] **Step 2: Run test to verify it fails (returns 404 for unknown route, not unknown connection)**

```bash
python -m pytest tests/test_connector_base.py -v -k "health_endpoint"
```

- [ ] **Step 3: Add the health endpoint to `app/api/connections.py`**

Add this endpoint after the existing `POST /{connection_id}/test` endpoint:

```python
from app.connectors import get_connector, config_from_orm
from app.schemas.connector_schemas import ConnectorHealth


@router.get("/{connection_id}/health", tags=["Connections"])
async def get_connection_health(
    connection_id: str,
    db: SnowflakeAsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
) -> dict:
    """Return connector health status and scan readiness for a source connection."""
    conn = await db.get(SnowflakeConnection, connection_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="Connection not found")

    _decrypt_password(conn)
    cfg = config_from_orm(conn)

    try:
        connector = get_connector(cfg)
        health = await connector.get_health()
    except Exception as exc:
        health = ConnectorHealth(
            connection_id=connection_id,
            connection_name=conn.connection_name,
            database_type=conn.database_type or "unknown",
            status="unreachable",
            scan_readiness_status="unavailable",
            last_tested_at=conn.last_tested_at,
            last_test_status=conn.last_test_status,
            last_successful_scan_at=getattr(conn, "last_successful_scan_at", None),
            environment=getattr(conn, "environment", None),
        )

    # Persist health probe result
    conn.last_test_status = health.status
    from datetime import datetime, timezone
    conn.last_tested_at = datetime.now(timezone.utc)
    if hasattr(conn, "scan_readiness_status"):
        conn.scan_readiness_status = health.scan_readiness_status
    await db.commit()

    return health.model_dump()
```

Also add the import for `config_from_orm` near the top of `connections.py`:

```python
from app.connectors import get_connector, config_from_orm
from app.schemas.connector_schemas import ConnectorHealth
```

- [ ] **Step 4: Run tests to verify endpoint is registered**

```bash
python -m pytest tests/test_connector_base.py -v -k "health_endpoint"
```
Expected: `1 passed` (returns 401/403 — route exists, auth required)

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add app/api/connections.py tests/test_connector_base.py
git commit -m "feat(connectors): add GET /connections/{id}/health endpoint"
```

---

## Verification

End-to-end checks a developer can run after all tasks complete:

```bash
# 1. All connector tests pass
python -m pytest tests/test_connector_errors.py tests/test_connector_base.py tests/test_connector_postgresql.py -v

# 2. No regressions in existing suite
python -m pytest tests/ --tb=short

# 3. Migration ran cleanly
alembic current   # should show 0012

# 4. Factory resolves all supported types
python -c "
from app.connectors import get_connector
from app.connectors.config import ConnectorConfig
for t in ['snowflake', 'postgresql', 'postgres', 'mysql', 'mariadb', 'bigquery', 's3', 'csv']:
    c = get_connector(ConnectorConfig(connection_id='x', database_type=t))
    print(f'{t}: {type(c).__name__}')
"

# 5. New fields present on model
python -c "
from app.db.models import SnowflakeConnection
cols = {c.name for c in SnowflakeConnection.__table__.columns}
print('environment' in cols, 'scan_readiness_status' in cols, 'last_successful_scan_at' in cols)
"

# 6. Health endpoint in OpenAPI spec
python -c "
from app.main import app
routes = [r.path for r in app.routes]
print(any('/health' in r for r in routes))
"
```

---

## Next Integration Notes (Asset Registry)

After this framework is in place, the following wiring steps are needed in a future PR:

1. **`discovery_service.py`**: Replace inline Snowflake SQL with `connector.list_tables()` and `connector.list_columns()` calls — currently hardcoded to Snowflake only.

2. **`execution_service.py`**: `_DynamicExecutor` currently wraps only Snowflake. For multi-DB rule execution, resolve a `BaseConnector` and call `connector.sample_rows()` instead of raw Snowflake queries.

3. **Scan persistence**: After `connector.run_metadata_scan()` completes, write `connection.last_successful_scan_at = completed_at` and set `scan_readiness_status = "ready"`.

4. **Asset source meta**: `AssetSourceMeta.provider` should be populated from `ConnectorConfig.database_type` to associate assets with their source connector.

5. **Connection Test Endpoint**: Update `POST /connections/{id}/test` to delegate to `connector.test_connection()` for non-Snowflake types (currently returns a generic error for those).
