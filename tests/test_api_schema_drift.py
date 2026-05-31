import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock

_MOCK_USER = {"email": "admin@example.com", "role": "admin", "user_id": "system", "full_name": "System Admin"}


async def _mock_current_user():
    return _MOCK_USER


@pytest.mark.asyncio
async def test_get_schema_drift_asset_not_found():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    async def mock_db():
        db = AsyncMock()
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=r)
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/assets/nonexistent/schema-drift")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_get_schema_drift_no_baseline():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user
    from unittest.mock import MagicMock

    asset = MagicMock()
    asset.asset_id = "asset-1"

    call_no = [0]

    async def mock_db():
        db = AsyncMock()

        async def execute(stmt, *a, **kw):
            call_no[0] += 1
            r = MagicMock()
            if call_no[0] == 1:
                r.scalar_one_or_none.return_value = asset   # asset exists
            else:
                r.scalar_one_or_none.return_value = None    # no baseline, no events
                r.scalars.return_value.all.return_value = []
            return r

        db.execute = execute
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/assets/asset-1/schema-drift")
        assert resp.status_code == 200
        data = resp.json()
        assert data["baseline"] is None
        assert data["open_events"] == []
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_get_schema_drift_with_open_events():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user
    from unittest.mock import MagicMock
    from datetime import datetime

    asset = MagicMock()
    asset.asset_id = "asset-1"

    baseline = MagicMock()
    baseline.baseline_id = "bl-1"
    baseline.asset_id = "asset-1"
    baseline.status = "active"
    baseline.columns_snapshot = []
    baseline.approved_by = None
    baseline.approved_at = None
    baseline.created_at = datetime(2026, 5, 1)

    event = MagicMock()
    event.event_id = "ev-1"
    event.asset_id = "asset-1"
    event.baseline_id = "bl-1"
    event.detected_at = datetime(2026, 5, 17)
    event.change_type = "column_added"
    event.column_name = "loyalty_tier"
    event.old_value = None
    event.new_value = "VARCHAR"
    event.status = "open"
    event.resolved_at = None
    event.resolved_by = None

    call_no = [0]

    async def mock_db():
        db = AsyncMock()

        async def execute(stmt, *a, **kw):
            call_no[0] += 1
            r = MagicMock()
            if call_no[0] == 1:
                r.scalar_one_or_none.return_value = asset
            elif call_no[0] == 2:
                r.scalar_one_or_none.return_value = baseline
            else:
                r.scalar_one_or_none.return_value = event
                r.scalars.return_value.all.return_value = [event]
            return r

        db.execute = execute
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/assets/asset-1/schema-drift")
        assert resp.status_code == 200
        data = resp.json()
        assert data["baseline"]["baseline_id"] == "bl-1"
        assert len(data["open_events"]) == 1
        assert data["open_events"][0]["change_type"] == "column_added"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_approve_baseline_asset_not_found():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    async def mock_db():
        db = AsyncMock()
        r = MagicMock()
        r.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=r)
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/api/v1/assets/nonexistent/schema-drift/approve")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
