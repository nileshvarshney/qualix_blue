"""Tests that unauthenticated requests to sensitive endpoints return 401."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock

from app.api.connections import router
from app.core.security import get_current_user
from app.db.database import get_db


def _make_unauthenticated_client():
    """TestClient with DB mocked but auth NOT overridden — the real get_current_user fires."""
    app = FastAPI()
    app.include_router(router)

    async def _fake_db():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=result)
        yield db

    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app, raise_server_exceptions=False)


def test_post_connection_test_requires_auth():
    client = _make_unauthenticated_client()
    resp = client.post("/connections/abc-123/test")
    assert resp.status_code == 401


def test_get_databases_requires_auth():
    client = _make_unauthenticated_client()
    resp = client.get("/connections/abc-123/databases")
    assert resp.status_code == 401


def test_get_schemas_requires_auth():
    client = _make_unauthenticated_client()
    resp = client.get("/connections/abc-123/schemas?database=mydb")
    assert resp.status_code == 401


def test_get_tables_requires_auth():
    client = _make_unauthenticated_client()
    resp = client.get("/connections/abc-123/tables?database=mydb&schema=public")
    assert resp.status_code == 401


def test_get_columns_requires_auth():
    client = _make_unauthenticated_client()
    resp = client.get("/connections/abc-123/columns?database=mydb&schema=public&table=users")
    assert resp.status_code == 401


def test_get_preview_requires_auth():
    client = _make_unauthenticated_client()
    resp = client.get("/connections/abc-123/preview?database=mydb&schema=public&table=users")
    assert resp.status_code == 401


def test_post_test_credentials_requires_auth():
    client = _make_unauthenticated_client()
    resp = client.post("/connections/test-credentials", json={
        "database_type": "postgresql",
        "host": "10.0.0.5",
        "port": 5432,
        "sf_user": "admin",
        "password": "guess",
    })
    assert resp.status_code == 401


# ── SQL injection tests ────────────────────────────────────────────────────────


def _make_authenticated_client_with_pg_conn():
    """TestClient with auth and DB overridden, returning a mock PostgreSQL connection."""
    pg_conn = MagicMock()
    pg_conn.database_type = "postgresql"
    pg_conn.host = "localhost"
    pg_conn.port = "5432"
    pg_conn.username = "testuser"
    pg_conn.password = "enc_pass"

    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "test@x.com", "role": "admin"}

    async def _fake_db():
        db = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = pg_conn
        db.execute = AsyncMock(return_value=result)
        yield db

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app, raise_server_exceptions=False)


def test_preview_data_pg_rejects_malicious_schema():
    """schema parameter containing SQL injection must return 400."""
    client = _make_authenticated_client_with_pg_conn()
    resp = client.get(
        "/connections/abc/preview",
        params={
            "database": "mydb",
            "schema": 'public"; DROP TABLE users;--',
            "table": "users",
        },
    )
    assert resp.status_code == 400


def test_preview_data_pg_rejects_malicious_table():
    """table parameter containing SQL injection must return 400."""
    client = _make_authenticated_client_with_pg_conn()
    resp = client.get(
        "/connections/abc/preview",
        params={
            "database": "mydb",
            "schema": "public",
            "table": 'users"; SELECT 1;--',
        },
    )
    assert resp.status_code == 400
