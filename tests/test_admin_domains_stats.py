"""GET /domains (admin cleanup UI) must batch the asset/rule/run counts across all
domains instead of querying per-domain — Snowflake's per-statement latency makes a
3-query-per-domain loop slow even with a modest number of domains."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.admin import router
from app.core.security import require_admin
from app.db.database import get_db


def _scalars_result(values):
    m = MagicMock()
    m.scalars.return_value.all.return_value = values
    return m


def _rows_result(pairs):
    m = MagicMock()
    m.all.return_value = pairs
    return m


def _domain(domain_id, name="Domain"):
    return MagicMock(domain_id=domain_id, domain_name=name, is_active=True, owner_email="o@x.com")


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_admin():
        return {"email": "admin@x.com", "role": "admin"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[require_admin] = _fake_admin
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


@pytest.mark.asyncio
async def test_list_domains_issues_constant_query_count_regardless_of_domain_count():
    domains = [_domain(f"d{i}") for i in range(10)]

    db = AsyncMock()
    db.execute.side_effect = [
        _scalars_result(domains),  # domains
        _rows_result([]),          # asset counts (group by)
        _rows_result([]),          # rule counts (group by)
        _rows_result([]),          # run counts (group by)
    ]

    client = _make_client(db)
    resp = client.get("/admin/domains")

    assert resp.status_code == 200
    assert db.execute.call_count == 4
    assert len(resp.json()) == 10


@pytest.mark.asyncio
async def test_list_domains_maps_counts_to_correct_domain():
    domains = [_domain("d1"), _domain("d2")]

    db = AsyncMock()
    db.execute.side_effect = [
        _scalars_result(domains),
        _rows_result([("d1", 5)]),       # d2 has zero assets
        _rows_result([("d2", 2)]),       # d1 has zero rules
        _rows_result([("d1", 1), ("d2", 1)]),
    ]

    client = _make_client(db)
    resp = client.get("/admin/domains")
    data = {row["domain_id"]: row for row in resp.json()}

    assert data["d1"]["asset_count"] == 5
    assert data["d1"]["rule_count"] == 0
    assert data["d1"]["run_count"] == 1
    assert data["d2"]["asset_count"] == 0
    assert data["d2"]["rule_count"] == 2
    assert data["d2"]["run_count"] == 1
