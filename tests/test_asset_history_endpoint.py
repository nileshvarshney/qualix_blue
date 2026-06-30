# tests/test_asset_history_endpoint.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router
from app.core.security import get_current_user
from app.db.database import get_db


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "viewer@x.com", "role": "viewer"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


@pytest.mark.asyncio
async def test_history_404_for_unknown_asset():
    db = AsyncMock()
    not_found = MagicMock()
    not_found.scalar_one_or_none.return_value = None
    db.execute.return_value = not_found

    client = _make_client(db)
    resp = client.get("/asset-registry/no-such/history")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_history_returns_audit_entries():
    from app.db.models import Asset, AuditLog
    db = AsyncMock()

    asset = MagicMock(spec=Asset)
    asset_result = MagicMock()
    asset_result.scalar_one_or_none.return_value = asset

    log = MagicMock(spec=AuditLog)
    log.audit_id = "log-1"
    log.action = "UPDATE"
    log.user_email = "alice@x.com"
    log.created_at = datetime(2026, 6, 1, 10, 0, 0)
    log.old_value = {"criticality": "low"}
    log.new_value = {"criticality": "high"}

    logs_result = MagicMock()
    logs_result.scalars.return_value.all.return_value = [log]

    db.execute.side_effect = [asset_result, logs_result]

    client = _make_client(db)
    resp = client.get("/asset-registry/a1/history")
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 1
    assert entries[0]["audit_id"] == "log-1"
    assert entries[0]["action"] == "UPDATE"
    assert entries[0]["user_email"] == "alice@x.com"
    assert "criticality" in entries[0]["changed_fields"]
    assert entries[0]["old_value"] == {"criticality": "low"}
    assert entries[0]["new_value"] == {"criticality": "high"}


@pytest.mark.asyncio
async def test_history_empty_when_no_logs():
    from app.db.models import Asset, AuditLog
    db = AsyncMock()

    asset = MagicMock(spec=Asset)
    asset_result = MagicMock()
    asset_result.scalar_one_or_none.return_value = asset

    logs_result = MagicMock()
    logs_result.scalars.return_value.all.return_value = []
    db.execute.side_effect = [asset_result, logs_result]

    client = _make_client(db)
    resp = client.get("/asset-registry/a1/history")
    assert resp.status_code == 200
    assert resp.json() == []
