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

    class _FakeSfConn:
        database_type = "snowflake"

    db = AsyncMock()
    db.get = AsyncMock(return_value=_FakeSfConn())  # stand-in SnowflakeConnection
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


@pytest.mark.asyncio
async def test_resolve_connection_id_does_not_filter_by_type(monkeypatch):
    """Auto-select (no connection_id given) must consider non-Snowflake connections too."""
    from app.api.lineage import _resolve_connection_id
    from unittest.mock import AsyncMock, MagicMock

    captured_stmt = {}
    db = AsyncMock()

    async def execute_side_effect(stmt):
        captured_stmt["stmt"] = stmt
        r = MagicMock()
        r.scalar.return_value = "pg-conn-1"
        return r
    db.execute = AsyncMock(side_effect=execute_side_effect)

    result = await _resolve_connection_id(None, db)

    assert result == "pg-conn-1"
    compiled = str(captured_stmt["stmt"].compile(compile_kwargs={"literal_binds": True}))
    assert "database_type" not in compiled


def test_display_name_prefers_snowflake_field():
    from app.api.lineage import _display_name

    class M:
        sf_table_name = "SF_TABLE"
        generic_object_name = "pg_table"
    assert _display_name(M()) == "SF_TABLE"


def test_display_name_falls_back_to_generic_field():
    from app.api.lineage import _display_name

    class M:
        sf_table_name = None
        generic_object_name = "pg_table"
    assert _display_name(M()) == "pg_table"


def test_display_schema_falls_back_to_generic_field():
    from app.api.lineage import _display_schema

    class M:
        sf_schema_name = None
        generic_schema_name = "public"
    assert _display_schema(M()) == "public"


def test_display_database_falls_back_to_generic_field():
    from app.api.lineage import _display_database

    class M:
        sf_database_name = None
        generic_database_name = "analytics"
    assert _display_database(M()) == "analytics"


def test_display_type_falls_back_to_generic_field():
    from app.api.lineage import _display_type

    class M:
        sf_table_type = None
        generic_object_type = "TABLE"
    assert _display_type(M()) == "TABLE"


@pytest.mark.asyncio
async def test_ensure_view_definitions_uses_pg_backfill_for_postgres_connection(monkeypatch):
    """Postgres connections must use the information_schema-based backfill, not Snowflake's GET_DDL."""
    view_asset = _FakeAsset("a1", _FakeSourceMeta("VIEW", None))
    db = AsyncMock()
    db.commit = AsyncMock()

    class FakePgConn:
        database_type = "postgresql"
    db.get = AsyncMock(return_value=FakePgConn())

    sf_called = False
    def _sf_bulk_fetch(*_args, **_kwargs):
        nonlocal sf_called
        sf_called = True
        return {}
    monkeypatch.setattr("app.api.lineage._sync_fetch_view_definitions_bulk", _sf_bulk_fetch)

    pg_called_with = None
    async def _pg_bulk_fetch(conn, assets):
        nonlocal pg_called_with
        pg_called_with = (conn, assets)
        return {}
    monkeypatch.setattr("app.api.lineage._fetch_pg_view_definitions_bulk", _pg_bulk_fetch)

    await _ensure_view_definitions([view_asset], "conn-1", db)

    assert sf_called is False
    assert pg_called_with is not None
    assert pg_called_with[1] == [view_asset]


@pytest.mark.asyncio
async def test_ensure_view_definitions_handles_timeout(monkeypatch):
    """A slow GET_DDL backfill must not hang the request indefinitely."""
    import time
    import app.api.lineage as lineage_mod

    view_asset = _FakeAsset("a1", _FakeSourceMeta("VIEW", None))
    db = AsyncMock()

    class _FakeSfConn:
        database_type = "snowflake"
    db.get = AsyncMock(return_value=_FakeSfConn())
    db.commit = AsyncMock()

    def _slow_fetch(*_args, **_kwargs):
        time.sleep(0.3)
        return {"a1": "CREATE VIEW v AS SELECT 1"}
    monkeypatch.setattr(lineage_mod, "_sync_fetch_view_definitions_bulk", _slow_fetch)
    monkeypatch.setattr(lineage_mod, "VIEW_DEFINITION_BACKFILL_TIMEOUT", 0.05)

    await lineage_mod._ensure_view_definitions([view_asset], "conn-1", db)

    assert view_asset.source_meta.view_definition is None
    db.commit.assert_not_called()


@pytest.mark.asyncio
async def test_compute_column_edges_with_timeout_returns_empty_on_timeout(monkeypatch):
    """Column-lineage sqlglot computation must not hang the request indefinitely."""
    import time
    import app.api.lineage as lineage_mod

    def _slow(*_args, **_kwargs):
        time.sleep(0.3)
        return [{"fromAssetId": "x", "fromColumn": "y", "toAssetId": "z", "toColumn": "w"}]
    monkeypatch.setattr(lineage_mod, "_compute_column_edges_sync", _slow)
    monkeypatch.setattr(lineage_mod, "COLUMN_LINEAGE_TIMEOUT", 0.05)

    edges = await lineage_mod._compute_column_edges_with_timeout([], {}, {}, {})
    assert edges == []


@pytest.mark.asyncio
async def test_lineage_graph_renders_postgres_asset_via_generic_fields(monkeypatch):
    """A Postgres asset (no sf_* fields populated) must still render with a real name/schema."""
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    _mock_user = {"email": "admin@example.com", "role": "admin", "user_id": "system", "full_name": "System Admin"}

    async def _mock_current_user():
        return _mock_user

    class FakeMeta:
        sf_table_name = None
        sf_schema_name = None
        sf_database_name = None
        sf_table_type = None
        generic_object_name = "customers"
        generic_schema_name = "public"
        generic_database_name = "appdb"
        generic_object_type = "TABLE"
        view_definition = None
        last_modified_at = None
        row_count = 50

    class FakeAsset:
        asset_id = "asset-pg-1"
        asset_type = "table"
        physical_name = "customers"
        display_name = None
        description = "Customer records"
        table_description = "Customer records"
        owner_name = "Alice"
        technical_owner_name = "Bob"
        is_active = True
        connection_id = "conn-pg"
        source_meta = FakeMeta()

    class FakeConn:
        connection_id = "conn-pg"
        connection_name = "Postgres Prod"
        database_type = "postgresql"
        default_database = "appdb"
        default_schema = "public"
        warehouse = None
        is_active = True
        is_primary_target = False

    from unittest.mock import AsyncMock, MagicMock
    from sqlalchemy.engine import Result

    async def mock_db():
        db = AsyncMock()

        def make_result(rows):
            r = MagicMock(spec=Result)
            r.scalars.return_value.all.return_value = rows
            r.scalar.return_value = None
            r.all.return_value = rows
            return r

        db.get = AsyncMock(side_effect=lambda model, pk: FakeConn() if pk == "conn-pg" else None)

        call_count = 0

        async def execute_side_effect(stmt):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return make_result([FakeAsset()])
            return make_result([])

        db.execute = AsyncMock(side_effect=execute_side_effect)
        db.commit = AsyncMock()
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user

    monkeypatch.setattr(
        "app.api.lineage._resolve_connection_id",
        AsyncMock(return_value="conn-pg"),
    )

    try:
        from httpx import AsyncClient, ASGITransport
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/lineage?connection_id=conn-pg")
        assert response.status_code == 200
        data = response.json()
        assert len(data["nodes"]) == 1
        node = data["nodes"][0]
        assert node["label"] == "customers"
        assert node["schema"] == "public"
        assert node["database"] == "appdb"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_lineage_graph_nodes_include_owner_fields(monkeypatch):
    """GET /lineage returns ownerName and techOwnerName on every node."""
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    _mock_user = {"email": "admin@example.com", "role": "admin", "user_id": "system", "full_name": "System Admin"}

    async def _mock_current_user():
        return _mock_user

    # Build minimal ORM fakes
    class FakeMeta:
        sf_table_name = "ORDERS"
        sf_schema_name = "PUBLIC"
        sf_database_name = "PROD"
        sf_table_type = "TABLE"
        view_definition = None
        last_modified_at = None
        row_count = 100

    class FakeAsset:
        asset_id = "asset-1"
        asset_type = "table"
        physical_name = "ORDERS"
        display_name = None
        description = "Order facts"
        table_description = "Order facts"
        owner_name = "Alice"
        technical_owner_name = "Bob"
        is_active = True
        connection_id = "conn-1"
        source_meta = FakeMeta()

    class FakeConn:
        connection_id = "conn-1"
        connection_name = "Prod"
        database_type = "snowflake"
        default_database = "PROD"
        default_schema = "PUBLIC"
        warehouse = "WH"
        is_active = True
        is_primary_target = True

    from unittest.mock import AsyncMock, MagicMock
    from sqlalchemy.engine import Result

    async def mock_db():
        db = AsyncMock()

        def make_result(rows):
            r = MagicMock(spec=Result)
            r.scalars.return_value.all.return_value = rows
            r.scalar.return_value = None
            r.all.return_value = rows
            return r

        db.get = AsyncMock(side_effect=lambda model, pk: FakeConn() if pk == "conn-1" else None)

        call_count = 0

        async def execute_side_effect(stmt):
            nonlocal call_count
            call_count += 1
            # First call = asset query, rest = enrich queries
            if call_count == 1:
                return make_result([FakeAsset()])
            return make_result([])

        db.execute = AsyncMock(side_effect=execute_side_effect)
        db.commit = AsyncMock()
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user

    # monkeypatch _resolve_connection_id to return our fake conn
    monkeypatch.setattr(
        "app.api.lineage._resolve_connection_id",
        AsyncMock(return_value="conn-1"),
    )
    # monkeypatch _ensure_view_definitions to no-op
    monkeypatch.setattr(
        "app.api.lineage._ensure_view_definitions",
        AsyncMock(return_value=None),
    )

    try:
        from httpx import AsyncClient, ASGITransport
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/lineage?connection_id=conn-1")
        assert response.status_code == 200
        data = response.json()
        assert len(data["nodes"]) > 0
        node = data["nodes"][0]
        assert "ownerName" in node, "ownerName field missing from lineage node"
        assert "techOwnerName" in node, "techOwnerName field missing from lineage node"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
