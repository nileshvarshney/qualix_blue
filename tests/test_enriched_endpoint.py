# tests/test_enriched_endpoint.py
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
        return {"email": "test@x.com", "role": "admin"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


def _make_asset(asset_id="a1"):
    from app.db.models import Asset, Domain, Subdomain, AssetSourceMeta
    asset = MagicMock(spec=Asset)
    asset.asset_id = asset_id
    asset.connection_id = None
    asset.owner_name = "Alice"
    asset.owner_email = "alice@x.com"
    asset.technical_owner_name = None
    asset.technical_owner_email = None
    asset.criticality = "high"
    asset.certification_status = "certified"
    asset.certified_by = None
    asset.is_active = True
    asset.created_at.isoformat.return_value = "2026-01-01T00:00:00"
    domain = MagicMock(spec=Domain)
    domain.domain_id = "d1"
    domain.domain_name = "Finance"
    subdomain = MagicMock(spec=Subdomain)
    subdomain.subdomain_id = "s1"
    subdomain.subdomain_name = "Reporting"
    meta = MagicMock(spec=AssetSourceMeta)
    meta.sf_database_name = "DB"
    meta.sf_schema_name = "SCH"
    meta.sf_table_name = "ORDERS"
    meta.sf_table_type = "table"
    return asset, domain, subdomain, meta


@pytest.mark.asyncio
async def test_enriched_includes_quality_score_and_tags():
    db = AsyncMock()
    asset, domain, subdomain, meta = _make_asset("a1")

    # First call: main join query
    main_result = MagicMock()
    main_result.all.return_value = [(asset, domain, subdomain, meta)]

    # Second call: score join (subquery is built in Python via .subquery(), not a DB call)
    score_join_result = MagicMock()
    score_join_result.all.return_value = [MagicMock(asset_id="a1", quality_score=87.5)]

    # Third call: tag query
    tag_result = MagicMock()
    tag_result.all.return_value = [
        MagicMock(entity_id="a1", tag_name="PII"),
        MagicMock(entity_id="a1", tag_name="Finance"),
    ]

    db.execute.side_effect = [main_result, score_join_result, tag_result]

    client = _make_client(db)
    resp = client.get("/asset-registry/enriched")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["quality_score"] == 87.5
    assert data[0]["tag_names"] == ["PII", "Finance"]


@pytest.mark.asyncio
async def test_enriched_quality_score_null_when_no_scores():
    db = AsyncMock()
    asset, domain, subdomain, meta = _make_asset("a2")

    main_result = MagicMock()
    main_result.all.return_value = [(asset, domain, subdomain, meta)]
    score_join_result = MagicMock()
    score_join_result.all.return_value = []
    tag_result = MagicMock()
    tag_result.all.return_value = []

    db.execute.side_effect = [main_result, score_join_result, tag_result]

    client = _make_client(db)
    resp = client.get("/asset-registry/enriched")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["quality_score"] is None
    assert data[0]["tag_names"] == []
