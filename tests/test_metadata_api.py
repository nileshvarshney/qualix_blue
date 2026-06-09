# tests/test_metadata_api.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_get_asset_metadata_404_for_unknown():
    from app.api.metadata import router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(router)

    with patch("app.api.metadata.metadata_store") as mock_store, \
         patch("app.api.metadata.get_current_user", return_value={"email": "test@x.com"}), \
         patch("app.api.metadata.get_db"):
        mock_store.get_current_state = AsyncMock(return_value=None)
        client = TestClient(app)
        resp = client.get("/metadata/assets/no-such")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_asset_metadata_200_with_state():
    from app.api.metadata import router
    from app.schemas.metadata import AssetMetaCurrentState
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    state = AssetMetaCurrentState(
        asset_id="asset-1", asset_type="table",
        status="active", scan_status="success",
        attached_rule_count=2, is_critical_data_element=False,
    )

    app = FastAPI()
    app.include_router(router)

    with patch("app.api.metadata.metadata_store") as mock_store, \
         patch("app.api.metadata.get_current_user", return_value={"email": "test@x.com"}), \
         patch("app.api.metadata.get_db"):
        mock_store.get_current_state = AsyncMock(return_value=state)
        client = TestClient(app)
        resp = client.get("/metadata/assets/asset-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["asset_id"] == "asset-1"
    assert data["scan_status"] == "success"


@pytest.mark.asyncio
async def test_patch_cde_404_for_unknown():
    from app.api.metadata import router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(router)

    with patch("app.api.metadata.metadata_store") as mock_store, \
         patch("app.api.metadata.get_current_user", return_value={"email": "test@x.com"}), \
         patch("app.api.metadata.get_db"):
        mock_store.set_critical_data_element = AsyncMock(side_effect=ValueError("not found"))
        client = TestClient(app)
        resp = client.patch("/metadata/assets/no-such/cde",
                            json={"is_critical_data_element": True})
    assert resp.status_code == 404
