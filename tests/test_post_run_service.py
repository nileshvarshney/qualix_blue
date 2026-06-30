"""Tests for post_run_service orchestrator.
Uses mocks to avoid DB and LLM calls.
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_handle_exits_gracefully_when_run_not_found():
    """Orchestrator should return silently if run_id doesn't exist."""
    mock_db = AsyncMock()
    mock_db.execute.return_value.scalar_one_or_none.return_value = None

    with patch("app.services.post_run_service.AsyncSessionLocal") as mock_session:
        mock_session.return_value.__aenter__.return_value = mock_db
        mock_session.return_value.__aexit__.return_value = AsyncMock()

        from app.services.post_run_service import handle
        # Should not raise
        await handle("nonexistent-run-id", "some-asset-id")


@pytest.mark.asyncio
async def test_anomaly_detection_failure_does_not_prevent_issue_creation():
    """Step 1 failure (anomaly) must not block Step 4 (issue creation)."""
    from unittest.mock import patch, AsyncMock, MagicMock

    mock_run = MagicMock()
    mock_run.run_id = "run-1"
    mock_run.rule_id = "rule-1"
    mock_run.asset_id = "asset-1"
    mock_run.domain_id = "domain-1"
    mock_run.subdomain_id = "sub-1"
    mock_run.status = "failed"
    mock_run.quality_score = 45.0

    mock_rule = MagicMock()
    mock_rule.rule_id = "rule-1"
    mock_rule.rule_name = "Null Check"
    mock_rule.severity = "high"

    mock_asset = MagicMock()
    mock_asset.asset_id = "asset-1"
    mock_asset.sf_table_name = "orders"
    mock_asset.sf_schema_name = "sales"

    added_objects = []

    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.add = lambda obj: added_objects.append(obj)

    call_count = [0]
    async def mock_execute(query):
        call_count[0] += 1
        result = MagicMock()
        if call_count[0] == 1:
            result.scalar_one_or_none.return_value = mock_run
        elif call_count[0] == 2:
            result.scalar_one_or_none.return_value = mock_rule
        elif call_count[0] == 3:
            result.scalar_one_or_none.return_value = mock_asset
        else:
            result.scalar_one_or_none.return_value = None
        return result
    mock_db.execute = mock_execute

    with patch("app.services.post_run_service.AsyncSessionLocal") as mock_session, \
         patch("app.services.post_run_service._trigger_anomaly_detection", side_effect=Exception("detector broke")), \
         patch("app.services.post_run_service._auto_create_issue", new_callable=AsyncMock) as mock_issue, \
         patch("app.services.ai_service.explain_failure", new_callable=AsyncMock, return_value="AI explanation text"):
        mock_session.return_value.__aenter__.return_value = mock_db
        mock_session.return_value.__aexit__.return_value = AsyncMock()
        mock_issue.return_value = None

        from app.services import post_run_service

        await post_run_service._run("run-1", "asset-1", mock_db)
        mock_issue.assert_called_once()


@pytest.mark.asyncio
async def test_failed_run_triggers_remediation_proposal_generation():
    from unittest.mock import patch, AsyncMock, MagicMock

    mock_run = MagicMock()
    mock_run.run_id = "run-1"
    mock_run.rule_id = "rule-1"
    mock_run.asset_id = "asset-1"
    mock_run.domain_id = "domain-1"
    mock_run.subdomain_id = "sub-1"
    mock_run.status = "failed"
    mock_run.quality_score = 45.0

    mock_rule = MagicMock()
    mock_rule.rule_id = "rule-1"
    mock_rule.rule_name = "Freshness Check"
    mock_rule.severity = "high"

    mock_asset = MagicMock()
    mock_asset.asset_id = "asset-1"
    mock_asset.sf_table_name = "orders"
    mock_asset.sf_schema_name = "sales"

    mock_issue = MagicMock()
    mock_issue.issue_id = "iss-1"

    mock_db = AsyncMock()

    call_count = [0]
    async def mock_execute(query):
        call_count[0] += 1
        result = MagicMock()
        if call_count[0] == 1:
            result.scalar_one_or_none.return_value = mock_run
        elif call_count[0] == 2:
            result.scalar_one_or_none.return_value = mock_rule
        elif call_count[0] == 3:
            result.scalar_one_or_none.return_value = mock_asset
        else:
            result.scalar_one_or_none.return_value = None
        return result
    mock_db.execute = mock_execute

    with patch("app.services.post_run_service.AsyncSessionLocal") as mock_session, \
         patch("app.services.post_run_service._trigger_anomaly_detection", new_callable=AsyncMock, return_value=None), \
         patch("app.services.post_run_service._auto_create_issue", new_callable=AsyncMock, return_value=mock_issue) as mock_create_issue, \
         patch("app.services.ai_service.explain_failure", new_callable=AsyncMock, return_value="AI explanation text"), \
         patch("app.services.remediation_service.generate_proposal", new_callable=AsyncMock) as mock_generate_proposal:
        mock_session.return_value.__aenter__.return_value = mock_db
        mock_session.return_value.__aexit__.return_value = AsyncMock()

        from app.services import post_run_service
        await post_run_service._run("run-1", "asset-1", mock_db)

        mock_create_issue.assert_called_once()
        mock_generate_proposal.assert_called_once_with(mock_issue, mock_run, mock_rule, mock_db)


@pytest.mark.asyncio
async def test_remediation_proposal_failure_does_not_raise():
    from unittest.mock import patch, AsyncMock, MagicMock

    mock_run = MagicMock(run_id="run-1", rule_id="rule-1", asset_id="asset-1",
                          domain_id="d", subdomain_id="s", status="failed", quality_score=40.0)
    mock_rule = MagicMock(rule_id="rule-1", rule_name="R", severity="high")
    mock_asset = MagicMock(asset_id="asset-1", sf_table_name="t", sf_schema_name="s")
    mock_issue = MagicMock(issue_id="iss-1")
    mock_db = AsyncMock()

    call_count = [0]
    async def mock_execute(query):
        call_count[0] += 1
        result = MagicMock()
        results = [mock_run, mock_rule, mock_asset]
        result.scalar_one_or_none.return_value = results[call_count[0] - 1] if call_count[0] <= 3 else None
        return result
    mock_db.execute = mock_execute

    with patch("app.services.post_run_service.AsyncSessionLocal") as mock_session, \
         patch("app.services.post_run_service._trigger_anomaly_detection", new_callable=AsyncMock, return_value=None), \
         patch("app.services.post_run_service._auto_create_issue", new_callable=AsyncMock, return_value=mock_issue), \
         patch("app.services.ai_service.explain_failure", new_callable=AsyncMock, return_value="x"), \
         patch("app.services.remediation_service.generate_proposal", new_callable=AsyncMock, side_effect=Exception("ai down")):
        mock_session.return_value.__aenter__.return_value = mock_db
        mock_session.return_value.__aexit__.return_value = AsyncMock()

        from app.services import post_run_service
        # Should not raise even though generate_proposal blew up.
        await post_run_service._run("run-1", "asset-1", mock_db)
