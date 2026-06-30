# tests/test_issues_remediation_api.py
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi import HTTPException

ADMIN = {"email": "admin@example.com", "role": "admin", "user_id": "u1", "domain_id": None}
DOMAIN_OWNER_OTHER = {
    "email": "owner@example.com",
    "role": "domain_owner",
    "user_id": "u2",
    "domain_id": "domain-other",
}


def _issue(**overrides):
    issue = MagicMock()
    issue.issue_id = overrides.get("issue_id", "iss-1")
    issue.domain_id = overrides.get("domain_id", "dom-1")
    return issue


def _proposal(**overrides):
    p = MagicMock()
    p.proposal_id = overrides.get("proposal_id", "prop-1")
    p.issue_id = overrides.get("issue_id", "iss-1")
    p.rule_id = overrides.get("rule_id", "rule-1")
    p.run_id = overrides.get("run_id", "run-1")
    p.asset_id = overrides.get("asset_id", "asset-1")
    p.rule_type = overrides.get("rule_type", "freshness_check")
    p.classification = overrides.get("classification", "auto_fixable")
    p.proposed_action = overrides.get("proposed_action", "Bump max_hours from 24 to 30.")
    p.config_field = overrides.get("config_field", "max_hours")
    p.old_value = overrides.get("old_value", "24")
    p.new_value = overrides.get("new_value", "30")
    p.confidence = overrides.get("confidence", "high")
    p.status = overrides.get("status", "pending")
    p.decided_by = overrides.get("decided_by")
    p.decided_at = overrides.get("decided_at")
    p.rerun_run_id = overrides.get("rerun_run_id")
    p.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-21T00:00:00"))
    return p


def _result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


@pytest.mark.asyncio
async def test_get_remediation_proposal_returns_latest():
    from app.api.issues import get_remediation_proposal

    db = AsyncMock()
    db.execute.side_effect = [_result(_issue()), _result(_proposal())]

    out = await get_remediation_proposal("iss-1", db=db, user=ADMIN)
    assert out["proposal_id"] == "prop-1"
    assert out["status"] == "pending"


@pytest.mark.asyncio
async def test_get_remediation_proposal_returns_none_when_absent():
    from app.api.issues import get_remediation_proposal

    db = AsyncMock()
    db.execute.side_effect = [_result(_issue()), _result(None)]

    out = await get_remediation_proposal("iss-1", db=db, user=ADMIN)
    assert out is None


@pytest.mark.asyncio
async def test_get_remediation_proposal_enforces_domain_access():
    from app.api.issues import get_remediation_proposal

    db = AsyncMock()
    db.execute.side_effect = [_result(_issue(domain_id="dom-1"))]

    with pytest.raises(HTTPException) as exc_info:
        await get_remediation_proposal("iss-1", db=db, user=DOMAIN_OWNER_OTHER)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_approve_remediation_proposal_calls_apply_proposal():
    from app.api.issues import approve_remediation_proposal

    proposal = _proposal(status="pending")
    db = AsyncMock()
    db.execute.side_effect = [_result(_issue()), _result(proposal)]

    applied = _proposal(status="applied")
    with patch("app.services.remediation_service.apply_proposal", new_callable=AsyncMock, return_value=applied) as mock_apply:
        out = await approve_remediation_proposal("iss-1", "prop-1", db=db, user=ADMIN)

    mock_apply.assert_called_once_with(proposal, "admin@example.com", db)
    assert out["status"] == "applied"


@pytest.mark.asyncio
async def test_approve_remediation_proposal_rejects_non_pending():
    from app.api.issues import approve_remediation_proposal

    proposal = _proposal(status="rejected")
    db = AsyncMock()
    db.execute.side_effect = [_result(_issue()), _result(proposal)]

    with pytest.raises(HTTPException) as exc_info:
        await approve_remediation_proposal("iss-1", "prop-1", db=db, user=ADMIN)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_approve_remediation_proposal_enforces_domain_access():
    from app.api.issues import approve_remediation_proposal

    db = AsyncMock()
    db.execute.side_effect = [_result(_issue(domain_id="dom-1"))]

    with pytest.raises(HTTPException) as exc_info:
        await approve_remediation_proposal("iss-1", "prop-1", db=db, user=DOMAIN_OWNER_OTHER)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_reject_remediation_proposal_sets_status():
    from app.api.issues import reject_remediation_proposal

    proposal = _proposal(status="pending")
    db = AsyncMock()
    db.commit = AsyncMock()
    db.execute.side_effect = [_result(_issue()), _result(proposal)]

    out = await reject_remediation_proposal("iss-1", "prop-1", db=db, user=ADMIN)
    assert proposal.status == "rejected"
    assert proposal.decided_by == "admin@example.com"
    assert out["status"] == "rejected"


@pytest.mark.asyncio
async def test_reject_remediation_proposal_enforces_domain_access():
    from app.api.issues import reject_remediation_proposal

    db = AsyncMock()
    db.execute.side_effect = [_result(_issue(domain_id="dom-1"))]

    with pytest.raises(HTTPException) as exc_info:
        await reject_remediation_proposal("iss-1", "prop-1", db=db, user=DOMAIN_OWNER_OTHER)
    assert exc_info.value.status_code == 403
