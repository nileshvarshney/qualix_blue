from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_approval(status="pending", entity_type="policy", entity_id="pol-001"):
    a = MagicMock()
    a.approval_id = "apr-001"
    a.entity_type = entity_type
    a.entity_id = entity_id
    a.entity_snapshot = {"policy_name": "Test Policy", "severity": "high"}
    a.status = status
    a.requested_by = "user@example.com"
    a.reviewed_by = None
    a.feedback = None
    a.created_at = MagicMock()
    a.created_at.isoformat.return_value = "2026-06-19T10:00:00"
    a.reviewed_at = None
    return a


def test_approvals_router_has_expected_routes():
    from app.api.governance import router
    paths = {r.path for r in router.routes}
    assert "/governance/approvals" in paths
    assert "/governance/approvals/{approval_id}/approve" in paths
    assert "/governance/approvals/{approval_id}/reject" in paths


@pytest.mark.asyncio
async def test_list_approvals_returns_list():
    from app.api.governance import list_approvals
    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = [_make_approval()]
    db.execute.return_value = res

    result = await list_approvals(db=db, entity_type=None, status=None)

    assert isinstance(result, list)
    assert result[0]["approval_id"] == "apr-001"


@pytest.mark.asyncio
async def test_create_approval_request_sets_entity_to_pending_review():
    from app.api.governance import create_approval_request
    db = AsyncMock()

    # Simulate no existing pending approval (duplicate check returns None),
    # then policy lookup returning a policy
    policy = MagicMock()
    policy.policy_id = "pol-001"
    policy.status = "active"
    res_no_dup = MagicMock()
    res_no_dup.scalar_one_or_none.return_value = None
    res_policy = MagicMock()
    res_policy.scalar_one_or_none.return_value = policy
    db.execute.side_effect = [res_no_dup, res_policy]
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    user = {"email": "user@example.com", "role": "data_steward"}
    body = {"entity_type": "policy", "entity_id": "pol-001", "entity_snapshot": {"policy_name": "P"}}

    result = await create_approval_request(body=body, db=db, user=user)

    assert result["status"] == "pending"
    assert policy.status == "pending_review"


@pytest.mark.asyncio
async def test_approve_request_activates_policy():
    from app.api.governance import approve_request
    db = AsyncMock()

    approval = _make_approval(status="pending", entity_type="policy")
    policy = MagicMock()
    policy.policy_id = "pol-001"
    policy.status = "pending_review"
    policy.is_active = False

    res1 = MagicMock()
    res1.scalar_one_or_none.return_value = approval
    res2 = MagicMock()
    res2.scalar_one_or_none.return_value = policy
    # version count query
    res3 = MagicMock()
    res3.scalar_one.return_value = 0
    db.execute.side_effect = [res1, res2, res3]
    db.add = MagicMock()
    db.commit = AsyncMock()

    user = {"email": "admin@example.com", "role": "admin"}
    result = await approve_request(approval_id="apr-001", body={}, db=db, user=user)

    assert approval.status == "approved"
    assert policy.status == "active"
    assert policy.is_active is True


@pytest.mark.asyncio
async def test_reject_request_sets_entity_to_draft():
    from app.api.governance import reject_request
    db = AsyncMock()

    approval = _make_approval(status="pending", entity_type="policy")
    policy = MagicMock()
    policy.policy_id = "pol-001"
    policy.status = "pending_review"

    res1 = MagicMock()
    res1.scalar_one_or_none.return_value = approval
    res2 = MagicMock()
    res2.scalar_one_or_none.return_value = policy
    db.execute.side_effect = [res1, res2]
    db.commit = AsyncMock()

    user = {"email": "admin@example.com", "role": "admin"}
    body = {"feedback": "Needs more detail"}
    result = await reject_request(approval_id="apr-001", body=body, db=db, user=user)

    assert approval.status == "rejected"
    assert approval.feedback == "Needs more detail"
    assert policy.status == "draft"
