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
