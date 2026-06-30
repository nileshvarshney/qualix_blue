import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

_MOCK_USER = {"email": "admin@example.com", "role": "admin", "user_id": "system", "full_name": "System Admin"}


async def _mock_current_user():
    return _MOCK_USER


@pytest.mark.asyncio
async def test_get_continuous_config_empty():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    async def mock_db():
        db = AsyncMock()
        r = MagicMock()
        r.all.return_value = []
        db.execute = AsyncMock(return_value=r)
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/observability/continuous-config")
        assert resp.status_code == 200
        assert resp.json() == {"connections": []}
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_get_continuous_config_with_rows():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    config = MagicMock()
    config.connection_id = "conn-1"
    config.interval_minutes = 15
    config.is_enabled = True
    config.freshness_enabled = True
    config.volume_enabled = True
    config.schema_drift_enabled = True
    config.distribution_enabled = True
    config.last_run_at = datetime(2026, 6, 21, 10, 0, 0)

    conn = MagicMock()
    conn.connection_id = "conn-1"
    conn.connection_name = "snowflake-prod"

    async def mock_db():
        db = AsyncMock()
        r = MagicMock()
        r.all.return_value = [(config, conn)]
        db.execute = AsyncMock(return_value=r)
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/observability/continuous-config")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["connections"]) == 1
        entry = data["connections"][0]
        assert entry["connection_id"] == "conn-1"
        assert entry["name"] == "snowflake-prod"
        assert entry["interval_minutes"] == 15
        assert entry["next_check_at"] == "2026-06-21T10:15:00"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_post_continuous_config_creates_new_row():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    call_no = [0]

    async def mock_db():
        db = AsyncMock()

        async def execute(stmt, *a, **kw):
            call_no[0] += 1
            r = MagicMock()
            if call_no[0] == 1:
                r.scalar_one_or_none.return_value = None  # no existing config row
            else:
                r.all.return_value = []  # final re-fetch for response
            return r

        db.execute = execute
        db.add = MagicMock()
        db.commit = AsyncMock()
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        body = {
            "connection_id": "conn-2",
            "interval_minutes": 30,
            "is_enabled": True,
            "freshness_enabled": True,
            "volume_enabled": False,
            "schema_drift_enabled": True,
            "distribution_enabled": False,
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/observability/continuous-config", json=body)
        assert resp.status_code == 200
        assert resp.json() == {"connections": []}
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
