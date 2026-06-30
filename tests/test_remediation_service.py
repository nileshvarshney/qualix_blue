from unittest.mock import AsyncMock, MagicMock, patch
import pytest


def _rule(rule_id="rule-1", rule_type="freshness_check", config=None, severity="high"):
    r = MagicMock()
    r.rule_id = rule_id
    r.rule_type = rule_type
    r.rule_config = config or {"max_hours": 24}
    r.severity = severity
    r.rule_name = "Freshness check"
    r.version = 1
    return r


def _run(run_id="run-1", asset_id="asset-1", total_rows_scanned=1000, failed_rows_count=1, failure_percentage=0.1):
    run = MagicMock()
    run.run_id = run_id
    run.asset_id = asset_id
    run.total_rows_scanned = total_rows_scanned
    run.failed_rows_count = failed_rows_count
    run.failure_percentage = failure_percentage
    return run


def _issue(issue_id="iss-1", status="new"):
    i = MagicMock()
    i.issue_id = issue_id
    i.status = status
    return i


@pytest.mark.asyncio
async def test_generate_proposal_skips_if_open_proposal_exists():
    from app.services import remediation_service

    db = AsyncMock()
    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = MagicMock()  # an open proposal
    db.execute.return_value = existing_result

    result = await remediation_service.generate_proposal(_issue(), _run(), _rule(), db)
    assert result is None


@pytest.mark.asyncio
async def test_generate_proposal_skips_if_existing_proposal_is_applied():
    """A human-approved ("applied") proposal must still block a duplicate proposal
    for the same rule/asset if the rule fails again."""
    from app.services import remediation_service

    db = AsyncMock()
    existing_proposal = MagicMock()
    existing_proposal.status = "applied"
    existing_result = MagicMock()
    existing_result.scalar_one_or_none.return_value = existing_proposal
    db.execute.return_value = existing_result

    result = await remediation_service.generate_proposal(_issue(), _run(), _rule(), db)
    assert result is None


@pytest.mark.asyncio
async def test_generate_proposal_falls_back_to_escalation_with_insufficient_history():
    from app.services import remediation_service

    db = AsyncMock()
    no_existing = MagicMock()
    no_existing.scalar_one_or_none.return_value = None
    history_result = MagicMock()
    history_result.scalars.return_value.all.return_value = [MagicMock()]  # only 1 prior run
    db.execute.side_effect = [no_existing, history_result]
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.remediation_service._describe_fix", new_callable=AsyncMock, return_value=("Investigate.", "medium")):
        proposal = await remediation_service.generate_proposal(_issue(), _run(), _rule(), db)

    assert proposal.classification == "escalation_only"
    assert proposal.config_field is None


@pytest.mark.asyncio
async def test_generate_proposal_auto_applies_when_gate_passes():
    from app.services import remediation_service

    db = AsyncMock()
    no_existing = MagicMock()
    no_existing.scalar_one_or_none.return_value = None
    history_result = MagicMock()
    history_result.scalars.return_value.all.return_value = [MagicMock(), MagicMock(), MagicMock()]
    db.execute.side_effect = [no_existing, history_result]
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.remediation_service._describe_fix", new_callable=AsyncMock, return_value=("Bump max_hours.", "high")), \
         patch("app.services.remediation_service._apply_gate_passes", new_callable=AsyncMock, return_value=True), \
         patch("app.services.remediation_service.apply_proposal", new_callable=AsyncMock) as mock_apply:
        proposal = await remediation_service.generate_proposal(_issue(), _run(), _rule(), db)

    assert proposal.classification == "auto_fixable"
    mock_apply.assert_called_once()
    _, kwargs = mock_apply.call_args
    assert mock_apply.call_args[0][1] == "system" or kwargs.get("triggered_by") == "system"


@pytest.mark.asyncio
async def test_apply_proposal_patches_config_and_reruns_then_resolves_issue():
    from app.services import remediation_service
    from app.db.models import ISSUE_TRANSITIONS

    proposal = MagicMock()
    proposal.proposal_id = "prop-1"
    proposal.issue_id = "iss-1"
    proposal.rule_id = "rule-1"
    proposal.classification = "auto_fixable"
    proposal.config_field = "max_hours"
    proposal.old_value = "24"
    proposal.new_value = "30"

    rule = _rule()
    rule_result = MagicMock()
    rule_result.scalar_one_or_none.return_value = rule

    issue = _issue(status="new")
    issue_result = MagicMock()
    issue_result.scalar_one_or_none.return_value = issue

    db = AsyncMock()
    db.execute.side_effect = [rule_result, issue_result]
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    rerun = MagicMock()
    rerun.run_id = "run-2"
    rerun.status = "passed"

    with patch("app.services.execution_service.execute_rule", new_callable=AsyncMock, return_value=rerun):
        result = await remediation_service.apply_proposal(proposal, "system", db)

    assert rule.rule_config["max_hours"] == 30
    assert rule.version == 2
    assert result.status == "auto_applied"
    assert issue.status == "resolved"


@pytest.mark.asyncio
async def test_apply_proposal_resolves_issue_in_confirmed_state_after_passing_rerun():
    """A human may have already moved the issue to 'confirmed' before approving the
    remediation. The re-run passing is still proof the problem is fixed, so the issue
    should be auto-resolved even though 'confirmed' isn't 'new' or directly wired to
    'resolved' in ISSUE_TRANSITIONS."""
    from app.services import remediation_service

    proposal = MagicMock()
    proposal.proposal_id = "prop-1"
    proposal.issue_id = "iss-1"
    proposal.rule_id = "rule-1"
    proposal.classification = "auto_fixable"
    proposal.config_field = "max_hours"
    proposal.old_value = "24"
    proposal.new_value = "30"

    rule = _rule()
    rule_result = MagicMock()
    rule_result.scalar_one_or_none.return_value = rule

    issue = _issue(status="confirmed")
    issue_result = MagicMock()
    issue_result.scalar_one_or_none.return_value = issue

    db = AsyncMock()
    db.execute.side_effect = [rule_result, issue_result]
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    rerun = MagicMock()
    rerun.run_id = "run-2"
    rerun.status = "passed"

    with patch("app.services.execution_service.execute_rule", new_callable=AsyncMock, return_value=rerun):
        result = await remediation_service.apply_proposal(proposal, "human@example.com", db)

    assert rule.rule_config["max_hours"] == 30
    assert result.status == "applied"
    assert issue.status == "resolved"


@pytest.mark.asyncio
async def test_apply_proposal_marks_failed_on_exception():
    from app.services import remediation_service

    proposal = MagicMock()
    proposal.proposal_id = "prop-1"
    proposal.issue_id = "iss-1"
    proposal.rule_id = "rule-1"
    proposal.classification = "auto_fixable"
    proposal.config_field = "max_hours"
    proposal.old_value = "24"
    proposal.new_value = "30"

    rule = _rule()
    rule_result = MagicMock()
    rule_result.scalar_one_or_none.return_value = rule

    db = AsyncMock()
    db.execute.return_value = rule_result
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    with patch("app.services.execution_service.execute_rule", new_callable=AsyncMock, side_effect=RuntimeError("boom")):
        result = await remediation_service.apply_proposal(proposal, "system", db)

    assert result.status == "apply_failed"
