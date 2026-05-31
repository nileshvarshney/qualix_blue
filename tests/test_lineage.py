import pytest
from httpx import AsyncClient, ASGITransport
from app.api.lineage import extract_table_refs


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
