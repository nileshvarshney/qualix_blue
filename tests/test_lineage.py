import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock
from app.api.lineage import extract_table_refs, _ensure_view_definitions


def test_simple_from_join():
    sql = "SELECT a.col1, b.col2 FROM orders a JOIN customers b ON a.id = b.id"
    refs = extract_table_refs(sql)
    assert "ORDERS" in refs
    assert "CUSTOMERS" in refs


def test_cte():
    sql = """
    WITH base AS (SELECT * FROM raw_orders WHERE status = 'active')
    SELECT b.*, p.name FROM base b JOIN products p ON b.product_id = p.id
    """
    refs = extract_table_refs(sql)
    assert "RAW_ORDERS" in refs
    assert "PRODUCTS" in refs
    assert "BASE" not in refs  # CTE alias must be excluded


def test_schema_qualified_name():
    sql = "SELECT * FROM mydb.myschema.my_table t INNER JOIN myschema.other_table o ON t.id = o.id"
    refs = extract_table_refs(sql)
    assert "MY_TABLE" in refs
    assert "OTHER_TABLE" in refs


def test_bad_sql_returns_empty():
    assert extract_table_refs("this is not sql @@##") == []


def test_empty_string_returns_empty():
    assert extract_table_refs("") == []


def test_whitespace_only_returns_empty():
    assert extract_table_refs("   ") == []


def test_returns_uppercase():
    sql = "SELECT * FROM MyMixedCaseTable"
    refs = extract_table_refs(sql)
    assert "MYMIXEDCASETABLE" in refs


@pytest.mark.asyncio
async def test_get_lineage_404():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user
    from unittest.mock import AsyncMock

    _mock_user = {"email": "admin@example.com", "role": "admin", "user_id": "system", "full_name": "System Admin"}

    async def _mock_current_user():
        return _mock_user

    async def mock_db():
        m = AsyncMock()
        m.get = AsyncMock(return_value=None)
        yield m

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/lineage/nonexistent-id-12345")
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_extract_refs_used_for_upstream():
    """extract_table_refs is the source of truth for upstream detection."""
    from app.api.lineage import extract_table_refs
    sql = "SELECT o.*, c.name FROM ORDERS o JOIN CUSTOMERS c ON o.cust_id = c.id"
    refs = extract_table_refs(sql)
    assert set(refs) == {"ORDERS", "CUSTOMERS"}


class _FakeSourceMeta:
    def __init__(self, sf_table_type=None, view_definition=None):
        self.sf_table_type = sf_table_type
        self.view_definition = view_definition


class _FakeAsset:
    def __init__(self, asset_id, source_meta):
        self.asset_id = asset_id
        self.source_meta = source_meta


@pytest.mark.asyncio
async def test_ensure_view_definitions_skips_when_none_missing(monkeypatch):
    """No view is missing its DDL — never touch Snowflake or the DB."""
    assets = [_FakeAsset("a1", _FakeSourceMeta("VIEW", "SELECT 1"))]
    db = AsyncMock()

    called = False
    def _bulk_fetch(*_args, **_kwargs):
        nonlocal called
        called = True
        return {}
    monkeypatch.setattr("app.api.lineage._sync_fetch_view_definitions_bulk", _bulk_fetch)

    await _ensure_view_definitions(assets, "conn-1", db)

    assert called is False
    db.get.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_ensure_view_definitions_backfills_missing(monkeypatch):
    """A view missing its DDL gets backfilled, persisted, and is then usable for lineage extraction."""
    view_asset = _FakeAsset("a1", _FakeSourceMeta("VIEW", None))
    table_asset = _FakeAsset("a2", _FakeSourceMeta("TABLE", None))
    assets = [view_asset, table_asset]

    db = AsyncMock()
    db.get = AsyncMock(return_value=object())  # stand-in SnowflakeConnection
    db.commit = AsyncMock()

    def _bulk_fetch(_conn, missing_assets):
        assert [a.asset_id for a in missing_assets] == ["a1"]  # TABLE asset never queried
        return {"a1": "CREATE VIEW v AS SELECT * FROM upstream_table"}
    monkeypatch.setattr("app.api.lineage._sync_fetch_view_definitions_bulk", _bulk_fetch)

    await _ensure_view_definitions(assets, "conn-1", db)

    assert view_asset.source_meta.view_definition == "CREATE VIEW v AS SELECT * FROM upstream_table"
    assert table_asset.source_meta.view_definition is None
    db.commit.assert_awaited_once()

    refs = extract_table_refs(view_asset.source_meta.view_definition)
    assert "UPSTREAM_TABLE" in refs
