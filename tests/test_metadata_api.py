# tests/test_metadata_api.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient


def _make_metadata_client(router, mock_store_patch, mock_db_return=None):
    """Build a TestClient with auth and db dependencies overridden."""
    from fastapi import FastAPI
    from app.core.security import get_current_user
    from app.db.database import get_db

    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "test@x.com", "role": "admin"}

    async def _fake_db():
        if mock_db_return is not None:
            yield mock_db_return
        else:
            yield AsyncMock()

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


@pytest.mark.asyncio
async def test_get_asset_metadata_404_for_unknown():
    from app.api.metadata import router

    with patch("app.api.metadata.metadata_store") as mock_store:
        mock_store.get_current_state = AsyncMock(return_value=None)
        client = _make_metadata_client(router, mock_store)
        resp = client.get("/metadata/assets/no-such")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_asset_metadata_200_with_state():
    from app.api.metadata import router
    from app.schemas.metadata import AssetMetaCurrentState

    state = AssetMetaCurrentState(
        asset_id="asset-1", asset_type="table",
        status="active", scan_status="success",
        attached_rule_count=2, is_critical_data_element=False,
    )

    with patch("app.api.metadata.metadata_store") as mock_store:
        mock_store.get_current_state = AsyncMock(return_value=state)
        client = _make_metadata_client(router, mock_store)
        resp = client.get("/metadata/assets/asset-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["asset_id"] == "asset-1"
    assert data["scan_status"] == "success"


@pytest.mark.asyncio
async def test_patch_cde_404_for_unknown():
    from app.api.metadata import router

    with patch("app.api.metadata.metadata_store") as mock_store:
        mock_store.set_critical_data_element = AsyncMock(side_effect=ValueError("not found"))
        client = _make_metadata_client(router, mock_store)
        resp = client.patch("/metadata/assets/no-such/cde",
                            json={"is_critical_data_element": True})
    assert resp.status_code == 404
