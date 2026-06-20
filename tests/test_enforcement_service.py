from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_policy(policy_type, severity, status="active"):
    p = MagicMock()
    p.policy_type = policy_type
    p.severity = severity
    p.status = status
    p.is_active = True
    p.policy_name = f"Test {policy_type}"
    return p


def _make_asset(**kwargs):
    a = MagicMock()
    a.asset_id = "asset-001"
    a.owner_email = kwargs.get("owner_email", "owner@x.com")
    a.table_description = kwargs.get("table_description", "A table")
    a.certification_status = kwargs.get("certification_status", "certified")
    return a


def _make_db_with_policies(policies):
    db = AsyncMock()
    policy_res = MagicMock()
    policy_res.scalars.return_value.all.return_value = policies
    rule_count_res = MagicMock()
    rule_count_res.scalar_one.return_value = 3
    db.execute.side_effect = [policy_res, rule_count_res]
    return db


@pytest.mark.asyncio
async def test_check_asset_enforcement_blocks_on_high_severity():
    from app.services.enforcement_service import check_asset_enforcement
    policies = [_make_policy("owner_required", "high")]
    asset = _make_asset(owner_email=None)
    db = _make_db_with_policies(policies)

    result = await check_asset_enforcement(asset, db)

    assert result["blocked"] is True
    assert len(result["blocking_violations"]) == 1
    assert result["warnings"] == []


@pytest.mark.asyncio
async def test_check_asset_enforcement_warns_on_medium_severity():
    from app.services.enforcement_service import check_asset_enforcement
    policies = [_make_policy("stale_description", "medium")]
    asset = _make_asset(table_description=None)
    db = _make_db_with_policies(policies)

    result = await check_asset_enforcement(asset, db)

    assert result["blocked"] is False
    assert result["warnings"] == ["Test stale_description (severity: medium)"]


@pytest.mark.asyncio
async def test_check_asset_enforcement_passes_when_no_violations():
    from app.services.enforcement_service import check_asset_enforcement
    policies = [_make_policy("owner_required", "high")]
    asset = _make_asset(owner_email="owner@x.com")
    db = _make_db_with_policies(policies)

    result = await check_asset_enforcement(asset, db)

    assert result["blocked"] is False
    assert result["blocking_violations"] == []


@pytest.mark.asyncio
async def test_check_asset_enforcement_ignores_non_active_policies():
    from app.services.enforcement_service import check_asset_enforcement
    asset = _make_asset(owner_email=None)
    db = AsyncMock()
    # SQL WHERE filters out non-active policies — simulate by returning empty list
    policy_res = MagicMock()
    policy_res.scalars.return_value.all.return_value = []  # no active policies returned
    rule_count_res = MagicMock()
    rule_count_res.scalar_one.return_value = 3
    db.execute.side_effect = [policy_res, rule_count_res]

    result = await check_asset_enforcement(asset, db)

    assert result["blocked"] is False


@pytest.mark.asyncio
async def test_check_rule_count_enforcement_blocks_on_zero_rules():
    from app.services.enforcement_service import check_rule_count_enforcement
    policies = [_make_policy("no_rules_defined", "high")]
    db = AsyncMock()
    policy_res = MagicMock()
    policy_res.scalars.return_value.all.return_value = policies
    count_res = MagicMock()
    count_res.scalar_one.return_value = 1  # currently 1 rule; delta=-1 makes it 0
    db.execute.side_effect = [policy_res, count_res]

    result = await check_rule_count_enforcement("asset-001", db, delta=-1)

    assert result["blocked"] is True
