# tests/test_bulk_update_endpoint.py
import pytest
from unittest.mock import AsyncMock, MagicMock, call
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router
from app.core.security import get_current_user
from app.db.database import get_db


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "admin@x.com", "role": "admin"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


def _mock_assets(ids):
    from app.db.models import Asset
    assets = []
    for aid in ids:
        a = MagicMock(spec=Asset)
        a.asset_id = aid
        a.criticality = "low"
        a.certification_status = "uncertified"
        a.is_active = True
        a.domain_id = None
        a.subdomain_id = None
        a.owner_name = None
        a.updated_at = None
        assets.append(a)
    return assets


@pytest.mark.asyncio
async def test_bulk_update_422_with_no_asset_ids():
    db = AsyncMock()
    client = _make_client(db)
    resp = client.post("/asset-registry/bulk-update", json={"asset_ids": [], "patch": {"criticality": "high"}})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_update_422_with_invalid_patch_field():
    db = AsyncMock()
    client = _make_client(db)
    resp = client.post(
        "/asset-registry/bulk-update",
        json={"asset_ids": ["a1"], "patch": {"hacked_field": "evil"}},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_update_404_when_asset_not_found():
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result

    client = _make_client(db)
    resp = client.post(
        "/asset-registry/bulk-update",
        json={"asset_ids": ["missing-1"], "patch": {"criticality": "high"}},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_bulk_update_applies_patch_to_all_assets():
    db = AsyncMock()
    assets = _mock_assets(["a1", "a2"])
    result = MagicMock()
    result.scalars.return_value.all.return_value = assets
    db.execute.return_value = result

    client = _make_client(db)
    resp = client.post(
        "/asset-registry/bulk-update",
        json={"asset_ids": ["a1", "a2"], "patch": {"criticality": "critical"}},
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 2
    for asset in assets:
        assert asset.criticality == "critical"
    assert db.commit.called
