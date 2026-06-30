"""Tests for governance_service.evaluate_policies — batched-query behavior.

Snowflake per-statement latency is high, so issuing a query per (policy, asset)
pair turns a handful of policies/assets into seconds of wall-clock time. These
tests pin the query count to a small constant regardless of N, and verify the
violation create/resolve logic still produces correct results.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock


def _scalars_result(values):
    m = MagicMock()
    m.scalars.return_value.all.return_value = values
    return m


def _rows_result(pairs):
    """Mimics the (asset_id, count) tuples returned by a GROUP BY query."""
    m = MagicMock()
    m.all.return_value = pairs
    return m


def _policy(policy_id, policy_type):
    return MagicMock(policy_id=policy_id, policy_type=policy_type)


def _asset(asset_id, owner_email=None, certification_status="uncertified", table_description=None):
    return MagicMock(
        asset_id=asset_id,
        owner_email=owner_email,
        certification_status=certification_status,
        table_description=table_description,
        sf_table_name=f"TBL_{asset_id}",
    )


@pytest.mark.asyncio
async def test_evaluate_policies_issues_constant_query_count_regardless_of_size():
    """Query count must not scale with len(policies) * len(assets)."""
    from app.services.governance_service import evaluate_policies

    policies = [_policy(f"p{i}", "owner_required") for i in range(5)]
    assets = [_asset(f"a{i}") for i in range(20)]

    db = AsyncMock()
    db.execute.side_effect = [
        _scalars_result(policies),     # policies
        _scalars_result(assets),       # assets
        _rows_result([]),              # rule counts (group by)
        _scalars_result([]),           # existing open violations
    ]

    await evaluate_policies(db)

    # Exactly 4 queries no matter how many policies/assets — not 5*20*2.
    assert db.execute.call_count == 4


@pytest.mark.asyncio
async def test_evaluate_policies_creates_violation_for_missing_owner():
    from app.services.governance_service import evaluate_policies

    policy = _policy("p1", "owner_required")
    asset = _asset("a1", owner_email=None)

    db = AsyncMock()
    db.execute.side_effect = [
        _scalars_result([policy]),
        _scalars_result([asset]),
        _rows_result([]),
        _scalars_result([]),
    ]

    count = await evaluate_policies(db)

    assert count == 1
    assert db.add.call_count == 1
    created = db.add.call_args[0][0]
    assert created.policy_id == "p1"
    assert created.entity_id == "a1"
    assert created.status == "open"


@pytest.mark.asyncio
async def test_evaluate_policies_resolves_violation_once_owner_is_set():
    from app.services.governance_service import evaluate_policies

    policy = _policy("p1", "owner_required")
    asset = _asset("a1", owner_email="owner@x.com")  # now compliant
    existing_violation = MagicMock(policy_id="p1", entity_id="a1", status="open")

    db = AsyncMock()
    db.execute.side_effect = [
        _scalars_result([policy]),
        _scalars_result([asset]),
        _rows_result([]),
        _scalars_result([existing_violation]),
    ]

    count = await evaluate_policies(db)

    assert count == 0
    assert existing_violation.status == "resolved"
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_evaluate_policies_no_rules_defined_uses_batched_rule_counts():
    from app.services.governance_service import evaluate_policies

    policy = _policy("p1", "no_rules_defined")
    asset_with_rules = _asset("a1")
    asset_without_rules = _asset("a2")

    db = AsyncMock()
    db.execute.side_effect = [
        _scalars_result([policy]),
        _scalars_result([asset_with_rules, asset_without_rules]),
        _rows_result([("a1", 3)]),     # a2 absent => zero active rules
        _scalars_result([]),
    ]

    count = await evaluate_policies(db)

    assert count == 1
    created = db.add.call_args[0][0]
    assert created.entity_id == "a2"
