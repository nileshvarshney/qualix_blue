# tests/test_asset_registry.py
from app.services.asset_registry import stable_asset_id
from app.schemas.asset import AssetUpdate


def test_stable_asset_id_is_deterministic():
    id1 = stable_asset_id("source:conn-abc")
    id2 = stable_asset_id("source:conn-abc")
    assert id1 == id2


def test_stable_asset_id_differs_for_different_paths():
    a = stable_asset_id("source:conn-abc")
    b = stable_asset_id("database:conn-abc:MY_DB")
    assert a != b


def test_stable_asset_id_is_valid_uuid():
    import uuid
    result = stable_asset_id("schema:conn-abc:MY_DB:PUBLIC")
    parsed = uuid.UUID(result)
    assert str(parsed) == result


import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_effective_description_returns_own():
    from app.services.asset_registry import effective_description
    db = AsyncMock()
    mock_asset = MagicMock()
    mock_asset.description = "My own description"
    mock_asset.parent_asset_id = None
    db.execute.return_value.scalar_one_or_none.return_value = mock_asset
    result = await effective_description("asset-123", db)
    assert result == "My own description"


@pytest.mark.asyncio
async def test_effective_description_walks_ancestors():
    from app.services.asset_registry import effective_description
    db = AsyncMock()
    child = MagicMock(); child.description = None; child.parent_asset_id = "parent-456"
    parent = MagicMock(); parent.description = "Parent desc"; parent.parent_asset_id = None
    db.execute.return_value.scalar_one_or_none.side_effect = [child, parent]
    result = await effective_description("child-123", db)
    assert result == "Parent desc"


@pytest.mark.asyncio
async def test_effective_description_none_when_empty_lineage():
    from app.services.asset_registry import effective_description
    db = AsyncMock()
    asset = MagicMock(); asset.description = None; asset.parent_asset_id = None
    db.execute.return_value.scalar_one_or_none.return_value = asset
    result = await effective_description("orphan-123", db)
    assert result is None


def test_asset_update_accepts_description():
    u = AssetUpdate(description="A new description")
    assert u.description == "A new description"


def test_asset_update_accepts_domain_and_subdomain():
    u = AssetUpdate(domain_id="d-123", subdomain_id="s-456")
    assert u.domain_id == "d-123"
    assert u.subdomain_id == "s-456"


def test_asset_update_exclude_none_omits_unset():
    u = AssetUpdate(criticality="high")
    dumped = u.model_dump(exclude_none=True)
    assert "description" not in dumped
    assert "domain_id" not in dumped
    assert dumped == {"criticality": "high"}
