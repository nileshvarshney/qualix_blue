"""Tests that asset list endpoints respect an optional connection_id filter,
so screens don't silently blend assets from every configured connection together."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router
from app.core.security import get_current_user
from app.db.database import get_db


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "test@x.com", "role": "admin"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


def _empty_result():
    r = MagicMock()
    r.all.return_value = []
    r.scalars.return_value.all.return_value = []
    r.scalar.return_value = 0
    return r


@pytest.mark.asyncio
async def test_enriched_filters_by_connection_id_when_provided():
    captured = {}
    db = AsyncMock()

    async def execute_side_effect(stmt):
        captured.setdefault("stmt", stmt)
        return _empty_result()
    db.execute = AsyncMock(side_effect=execute_side_effect)

    client = _make_client(db)
    resp = client.get("/asset-registry/enriched?connection_id=conn-pg")
    assert resp.status_code == 200
    compiled = str(captured["stmt"].compile(compile_kwargs={"literal_binds": True}))
    assert "connection_id" in compiled
    assert "conn-pg" in compiled


@pytest.mark.asyncio
async def test_enriched_omits_connection_filter_when_not_provided():
    captured = {}
    db = AsyncMock()

    async def execute_side_effect(stmt):
        captured.setdefault("stmt", stmt)
        return _empty_result()
    db.execute = AsyncMock(side_effect=execute_side_effect)

    client = _make_client(db)
    resp = client.get("/asset-registry/enriched")
    assert resp.status_code == 200
    compiled = str(captured["stmt"].compile(compile_kwargs={"literal_binds": True}))
    assert "WHERE" not in compiled


@pytest.mark.asyncio
async def test_list_assets_filters_by_connection_id_when_provided():
    captured_stmts = []
    db = AsyncMock()

    async def execute_side_effect(stmt):
        captured_stmts.append(stmt)
        return _empty_result()
    db.execute = AsyncMock(side_effect=execute_side_effect)

    client = _make_client(db)
    resp = client.get("/asset-registry?connection_id=conn-pg")
    assert resp.status_code == 200
    assert len(captured_stmts) == 2  # count query + joined query
    for stmt in captured_stmts:
        compiled = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        assert "connection_id" in compiled
        assert "conn-pg" in compiled
