# tests/test_asset_metadata_endpoints.py
"""Tests for asset-scoped documentation links, additional owners, and tags endpoints
on the /asset-registry router."""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router
from app.core.security import get_current_user
from app.db.database import get_db


def _scalar_result(value):
    """A plain (non-async) result mock whose scalar_one_or_none() returns `value`.

    Must be a plain MagicMock, not relying on AsyncMock auto-vivification — when the
    parent is an AsyncMock, nested attribute mocks become AsyncMock too, which turns
    sync Result methods like scalar_one_or_none()/scalars() into coroutines.
    """
    m = MagicMock()
    m.scalar_one_or_none.return_value = value
    return m


def _scalars_result(values):
    m = MagicMock()
    m.scalars.return_value.all.return_value = values
    return m


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "test@x.com", "role": "viewer"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


# ── Documents ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_documents_404_for_unknown_asset():
    db = AsyncMock()
    db.execute.return_value = _scalar_result(None)
    client = _make_client(db)
    resp = client.get("/asset-registry/no-such/documents")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_documents_returns_rows_for_known_asset():
    db = AsyncMock()
    asset = MagicMock()
    doc = MagicMock(doc_id="d1", asset_id="a1", title="Spec", url="https://x.com", created_at=datetime(2026, 1, 1))

    db.execute.side_effect = [_scalar_result(asset), _scalars_result([doc])]

    client = _make_client(db)
    resp = client.get("/asset-registry/a1/documents")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["title"] == "Spec"
    assert data[0]["url"] == "https://x.com"


@pytest.mark.asyncio
async def test_create_document_404_for_unknown_asset():
    db = AsyncMock()
    db.execute.return_value = _scalar_result(None)
    client = _make_client(db)
    resp = client.post("/asset-registry/no-such/documents", json={"title": "Spec", "url": "https://x.com"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_document_succeeds_for_known_asset():
    db = AsyncMock()
    asset = MagicMock()
    db.execute.return_value = _scalar_result(asset)
    client = _make_client(db)
    resp = client.post("/asset-registry/a1/documents", json={"title": "Spec", "url": "https://x.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Spec"
    assert data["url"] == "https://x.com"
    assert data["asset_id"] == "a1"
    db.add.assert_called_once()
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_delete_document_404_when_not_found():
    db = AsyncMock()
    db.execute.return_value = _scalar_result(None)
    client = _make_client(db)
    resp = client.delete("/asset-registry/a1/documents/no-such")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_document_succeeds():
    db = AsyncMock()
    doc = MagicMock()
    db.execute.return_value = _scalar_result(doc)
    client = _make_client(db)
    resp = client.delete("/asset-registry/a1/documents/d1")
    assert resp.status_code == 200
    db.delete.assert_awaited_with(doc)
    db.commit.assert_awaited()


# ── Owners ───────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_owners_404_for_unknown_asset():
    db = AsyncMock()
    db.execute.return_value = _scalar_result(None)
    client = _make_client(db)
    resp = client.get("/asset-registry/no-such/owners")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_owner_succeeds_for_known_asset():
    db = AsyncMock()
    asset = MagicMock()
    db.execute.return_value = _scalar_result(asset)
    client = _make_client(db)
    resp = client.post(
        "/asset-registry/a1/owners",
        json={"owner_type": "technical_owner", "name": "Raj Patel", "email": "raj@co.com"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Raj Patel"
    assert data["owner_type"] == "technical_owner"
    db.add.assert_called_once()


@pytest.mark.asyncio
async def test_delete_owner_404_when_not_found():
    db = AsyncMock()
    db.execute.return_value = _scalar_result(None)
    client = _make_client(db)
    resp = client.delete("/asset-registry/a1/owners/no-such")
    assert resp.status_code == 404


# ── Tags ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_asset_tags_404_for_unknown_asset():
    db = AsyncMock()
    db.execute.return_value = _scalar_result(None)
    client = _make_client(db)
    resp = client.get("/asset-registry/no-such/tags")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_asset_tags_returns_empty_list_when_none_applied():
    db = AsyncMock()
    asset = MagicMock()
    db.execute.side_effect = [_scalar_result(asset), _scalars_result([])]

    client = _make_client(db)
    resp = client.get("/asset-registry/a1/tags")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_apply_tags_404_when_tag_ids_missing_from_catalog():
    db = AsyncMock()
    asset = MagicMock()
    db.execute.side_effect = [_scalar_result(asset), _scalars_result([])]  # no matching tags found

    client = _make_client(db)
    resp = client.post("/asset-registry/a1/tags", json={"tag_ids": ["t1"]})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_apply_tags_422_when_tag_ids_empty():
    db = AsyncMock()
    asset = MagicMock()
    db.execute.return_value = _scalar_result(asset)
    client = _make_client(db)
    resp = client.post("/asset-registry/a1/tags", json={"tag_ids": []})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_remove_tag_404_when_not_applied():
    db = AsyncMock()
    db.execute.side_effect = [_scalar_result(MagicMock()), _scalar_result(None)]

    client = _make_client(db)
    resp = client.delete("/asset-registry/a1/tags/t1")
    assert resp.status_code == 404
