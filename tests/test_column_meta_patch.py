# tests/test_column_meta_patch.py
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
        return {"email": "editor@x.com", "role": "admin"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


@pytest.mark.asyncio
async def test_patch_column_meta_404_when_column_not_found():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result

    client = _make_client(db)
    resp = client.patch(
        "/asset-registry/no-asset/column-meta/col1",
        json={"description": "test"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_column_meta_updates_description():
    from app.db.models import ColumnMetadata
    db = AsyncMock()

    col = MagicMock(spec=ColumnMetadata)
    col.col_id = "c1"
    col.column_name = "order_id"
    col.description = None
    col.updated_by = None
    col.updated_at = None

    result = MagicMock()
    result.scalar_one_or_none.return_value = col
    db.execute.return_value = result

    async def _fake_refresh(obj):
        obj.description = "Unique order identifier"

    db.refresh = _fake_refresh

    client = _make_client(db)
    resp = client.patch(
        "/asset-registry/a1/column-meta/order_id",
        json={"description": "Unique order identifier"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["col_id"] == "c1"
    assert data["column_name"] == "order_id"
    assert data["description"] == "Unique order identifier"
    assert col.description == "Unique order identifier"
    assert col.updated_by == "editor@x.com"
