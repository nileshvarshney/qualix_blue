import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from app.db.models import Issue, ISSUE_TRANSITIONS


ADMIN = {"email": "admin@example.com", "role": "admin", "user_id": "u1", "domain_id": None}


def _make_issue(**overrides):
    issue = MagicMock(spec=Issue)
    issue.issue_id = overrides.get("issue_id", "iss-1")
    issue.title = overrides.get("title", "Null values in customer_id")
    issue.description = overrides.get("description", "desc")
    issue.issue_type = overrides.get("issue_type", "manual")
    issue.status = overrides.get("status", "new")
    issue.severity = overrides.get("severity", "medium")
    issue.domain_id = overrides.get("domain_id")
    issue.subdomain_id = overrides.get("subdomain_id")
    issue.asset_id = overrides.get("asset_id")
    issue.source_id = overrides.get("source_id")
    issue.rule_id = overrides.get("rule_id")
    issue.run_id = overrides.get("run_id")
    issue.alert_id = overrides.get("alert_id")
    issue.assigned_team_id = overrides.get("assigned_team_id")
    issue.assigned_to = overrides.get("assigned_to")
    issue.created_by = overrides.get("created_by", "admin@example.com")
    issue.reopen_count = overrides.get("reopen_count", 0)
    issue.resolution_note = overrides.get("resolution_note")
    issue.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))
    issue.updated_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))
    issue.resolved_at = overrides.get("resolved_at")
    issue.closed_at = overrides.get("closed_at")
    return issue


@pytest.mark.asyncio
async def test_list_issues_empty():
    from app.api.issues import list_issues

    db = AsyncMock()
    count_result = MagicMock()
    count_result.scalar_one.return_value = 0
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = []
    db.execute.side_effect = [count_result, list_result]

    out = await list_issues(
        status=None, severity=None, issue_type=None, asset_id=None, domain_id=None,
        rule_id=None, alert_id=None, run_id=None, assigned_team_id=None, assigned_to=None,
        limit=100, offset=0, db=db, user=ADMIN,
    )
    assert out == {"total": 0, "limit": 100, "offset": 0, "items": []}


@pytest.mark.asyncio
async def test_list_issues_returns_items():
    from app.api.issues import list_issues

    issue = _make_issue()
    db = AsyncMock()
    count_result = MagicMock()
    count_result.scalar_one.return_value = 1
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = [issue]
    db.execute.side_effect = [count_result, list_result]

    out = await list_issues(
        status=None, severity=None, issue_type=None, asset_id=None, domain_id=None,
        rule_id=None, alert_id=None, run_id=None, assigned_team_id=None, assigned_to=None,
        limit=100, offset=0, db=db, user=ADMIN,
    )
    assert out["total"] == 1
    assert out["items"][0]["issue_id"] == "iss-1"
    assert out["items"][0]["status"] == "new"


@pytest.mark.asyncio
async def test_issue_stats():
    from app.api.issues import issue_stats

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.all.return_value = [
        MagicMock(status="new", count=2),
        MagicMock(status="resolved", count=3),
    ]
    db.execute.return_value = result_mock

    out = await issue_stats(db=db, user=ADMIN)
    assert out["by_status"]["new"] == 2
    assert out["by_status"]["resolved"] == 3
    assert out["open_count"] == 2


@pytest.mark.asyncio
async def test_create_issue_requires_title():
    from app.api.issues import create_issue

    db = AsyncMock()
    with pytest.raises(HTTPException) as exc_info:
        await create_issue(body={}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_create_issue_manual_minimal():
    from app.api.issues import create_issue

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    async def fake_refresh(obj):
        obj.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))
        obj.updated_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))

    db.refresh = AsyncMock(side_effect=fake_refresh)

    body = {"title": "Suspicious spike in null rate", "severity": "high"}
    result = await create_issue(body=body, db=db, user=ADMIN)

    assert result["title"] == "Suspicious spike in null rate"
    assert result["status"] == "new"
    assert result["severity"] == "high"
    assert result["issue_type"] == "manual"
    assert result["created_by"] == "admin@example.com"
    assert db.add.call_count == 2  # Issue row + AuditLog row
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_issue_with_asset_derives_domain():
    from app.api.issues import create_issue

    asset = MagicMock(domain_id="dom-1", subdomain_id="sub-1", connection_id="conn-1")
    db = AsyncMock()
    asset_result = MagicMock()
    asset_result.scalar_one_or_none.return_value = asset
    db.execute.return_value = asset_result
    db.add = MagicMock()
    db.commit = AsyncMock()

    async def fake_refresh(obj):
        obj.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))
        obj.updated_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))

    db.refresh = AsyncMock(side_effect=fake_refresh)

    body = {"title": "Row count drop", "asset_id": "asset-1", "issue_type": "alert", "severity": "critical"}
    result = await create_issue(body=body, db=db, user=ADMIN)

    assert result["domain_id"] == "dom-1"
    assert result["subdomain_id"] == "sub-1"
    assert result["source_id"] == "conn-1"
    assert result["issue_type"] == "alert"


@pytest.mark.asyncio
async def test_create_issue_asset_not_found():
    from app.api.issues import create_issue

    db = AsyncMock()
    asset_result = MagicMock()
    asset_result.scalar_one_or_none.return_value = None
    db.execute.return_value = asset_result

    with pytest.raises(HTTPException) as exc_info:
        await create_issue(body={"title": "x", "asset_id": "missing"}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_issue_not_found():
    from app.api.issues import get_issue

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.first.return_value = None
    db.execute.return_value = result_mock

    with pytest.raises(HTTPException) as exc_info:
        await get_issue(issue_id="missing", db=db, user=ADMIN)
    assert exc_info.value.status_code == 404


def test_router_registered():
    from app.api.issues import router
    paths = {r.path for r in router.routes}
    assert "/issues" in paths
    assert "/issues/enriched" in paths
    assert "/issues/stats" in paths
    assert "/issues/{issue_id}" in paths


@pytest.mark.asyncio
async def test_update_issue_changed_fields_audited():
    from app.api.issues import update_issue

    issue = _make_issue(title="Old title", severity="low")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await update_issue(issue_id="iss-1", body={"title": "New title", "severity": "low"}, db=db, user=ADMIN)
    assert out["title"] == "New title"
    assert issue.title == "New title"
    db.add.assert_called_once()  # only AuditLog — severity unchanged so not counted


@pytest.mark.asyncio
async def test_update_issue_not_found():
    from app.api.issues import update_issue

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute.return_value = result_mock

    with pytest.raises(HTTPException) as exc_info:
        await update_issue(issue_id="missing", body={"title": "x"}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_transition_issue_valid():
    from app.api.issues import transition_issue

    issue = _make_issue(status="new")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await transition_issue(issue_id="iss-1", body={"status": "confirmed"}, db=db, user=ADMIN)
    assert out["status"] == "confirmed"
    assert issue.status == "confirmed"


@pytest.mark.asyncio
async def test_transition_issue_invalid():
    from app.api.issues import transition_issue

    issue = _make_issue(status="new")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock

    with pytest.raises(HTTPException) as exc_info:
        await transition_issue(issue_id="iss-1", body={"status": "resolved"}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_transition_to_resolved_sets_resolved_at_and_note():
    from app.api.issues import transition_issue

    issue = _make_issue(status="in_progress")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await transition_issue(
        issue_id="iss-1", body={"status": "resolved", "resolution_note": "Fixed upstream job"}, db=db, user=ADMIN,
    )
    assert out["status"] == "resolved"
    assert issue.resolution_note == "Fixed upstream job"
    assert issue.resolved_at is not None


@pytest.mark.asyncio
async def test_transition_to_reopened_clears_resolved_and_increments_count():
    from app.api.issues import transition_issue

    issue = _make_issue(status="resolved", reopen_count=0, resolved_at=MagicMock(isoformat=MagicMock(return_value="2026-06-01T00:00:00")))
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await transition_issue(issue_id="iss-1", body={"status": "reopened"}, db=db, user=ADMIN)
    assert out["status"] == "reopened"
    assert issue.reopen_count == 1
    assert issue.resolved_at is None


@pytest.mark.asyncio
async def test_reopen_issue_from_resolved():
    from app.api.issues import reopen_issue

    issue = _make_issue(status="resolved", reopen_count=0)
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await reopen_issue(issue_id="iss-1", body={}, db=db, user=ADMIN)
    assert out["status"] == "reopened"
    assert issue.reopen_count == 1


@pytest.mark.asyncio
async def test_reopen_issue_invalid_status():
    from app.api.issues import reopen_issue

    issue = _make_issue(status="new")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock

    with pytest.raises(HTTPException) as exc_info:
        await reopen_issue(issue_id="iss-1", body={}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_get_issue_audit():
    from app.api.issues import get_issue_audit

    log = MagicMock()
    log.audit_id = "audit-1"
    log.user_email = "admin@example.com"
    log.action = "create"
    log.old_value = None
    log.new_value = {"status": "new"}
    log.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [log]
    db.execute.return_value = result_mock

    out = await get_issue_audit(issue_id="iss-1", db=db, user=ADMIN)
    assert out["items"][0]["audit_id"] == "audit-1"
    assert out["items"][0]["action"] == "create"


def test_action_routes_registered():
    from app.api.issues import router
    paths = {r.path for r in router.routes}
    assert "/issues/{issue_id}/transition" in paths
    assert "/issues/{issue_id}/reopen" in paths
    assert "/issues/{issue_id}/audit" in paths


def test_issues_router_mounted_in_app():
    from app.main import app
    paths = {r.path for r in app.routes}
    assert "/issues" in paths
    assert "/issues/{issue_id}" in paths
    assert "/issues/{issue_id}/transition" in paths
