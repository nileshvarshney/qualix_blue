# tests/test_connector_errors.py
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
