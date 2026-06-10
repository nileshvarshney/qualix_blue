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
