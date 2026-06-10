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
