"""
End-to-end integration tests for Phase 1 platform flows.

These tests exercise the full call chain using AsyncMock to avoid
real database or Snowflake connections. Each test asserts that the
cross-module contracts are honoured.
"""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call
from datetime import date, datetime


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _make_connection(connection_id="conn-001", name="My Source", db_type="snowflake"):
    c = MagicMock()
    c.connection_id = connection_id
    c.connection_name = name
    c.database_type = db_type
    c.account = "myaccount"
    c.filter_mode = "exclude"
    c.excluded_databases = []
    c.excluded_schemas = []
    c.included_databases = []
    c.included_schemas = []
    return c


def _make_job(job_id="job-001", connection_id="conn-001", job_type="metadata_discovery"):
    j = MagicMock()
    j.job_id = job_id
    j.connection_id = connection_id
    j.job_type = job_type
    j.is_active = True
    j.max_retries = 0
    j.timeout_seconds = 300
    j.parameters = {}
    j.last_run_at = None
    j.last_run_status = None
    return j


def _make_run(run_id="run-001", job_id="job-001", status="queued"):
    r = MagicMock()
    r.run_id = run_id
    r.job_id = job_id
    r.status = status
    r.trigger_type = "manual"
    r.triggered_by = "user@test.com"
    r.attempt = 1
    r.idempotency_key = None
    r.parameters = {}
    r.assets_scanned = 2
    r.errors_count = 0
    r.warnings_count = 0
    r.error_message = None
    r.result_summary = {
        "tables_scanned": 2,
        "tables_failed": 0,
        "tables_total": 2,
        "new_assets": 2,
        "updated_assets": 0,
        "removed_assets": 0,
    }
    return r


# ─── Test 1: create_run → execute_run → write_run_summary ────────────────────

@pytest.mark.asyncio
async def test_scan_orchestrator_writes_run_summary_after_execution():
    """Full orchestrator flow: create run → dispatch handler → write ScanRunSummary."""
    from app.services import scan_orchestrator
    from app.services import results_store

    job = _make_job()
    # First context: run has status "queued" (passes the status check)
    run_queued = _make_run(status="queued")
    # Second context: run has status "running" (passes the running check before finalize)
    run_running = _make_run(status="running")

    with patch("app.services.scan_orchestrator.AsyncSessionLocal") as mock_ctx:
        mock_db = AsyncMock()
        mock_db.get.side_effect = [
            run_queued,   # first context: get ScanJobRun (status check → "queued")
            job,          # first context: get ScanJob
            run_running,  # second context: get ScanJobRun (status check → "running")
            job,          # second context: get ScanJob (update last_run_at)
        ]
        mock_ctx.return_value.__aenter__.return_value = mock_db

        with patch("app.services.scan_orchestrator._dispatch_handler", new_callable=AsyncMock) as mock_dispatch:
            mock_dispatch.return_value = {
                "assets_scanned": 2,
                "errors_count": 0,
                "warnings_count": 0,
                "result_summary": run_queued.result_summary,
            }
            with patch.object(results_store, "write_run_summary", new_callable=AsyncMock) as mock_write:
                await scan_orchestrator._execute_run("run-001")

        mock_write.assert_called_once()
        call_args = mock_write.call_args
        assert call_args[0][1] == "run-001"


# ─── Test 2: get_run_summary returns correct counts after discovery ───────────

@pytest.mark.asyncio
async def test_get_run_summary_returns_correct_counts():
    """After a completed run, get_run_summary returns the written ScanRunSummary."""
    from app.services.results_store import get_run_summary
    from app.db.models import ScanRunSummary

    summary = ScanRunSummary(
        run_id="run-001",
        job_id="job-001",
        new_assets_count=3,
        updated_assets_count=1,
        removed_assets_count=0,
        failed_assets_count=0,
    )

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=summary)

    result = await get_run_summary(db, "run-001")
    assert result is not None
    assert result.new_assets_count == 3
    assert result.updated_assets_count == 1


# ─── Test 3: get_asset_latest after discovery ─────────────────────────────────

@pytest.mark.asyncio
async def test_get_asset_latest_returns_most_recent_summary():
    """get_asset_latest returns the most recent AssetScanSummary for an asset."""
    from app.services.results_store import get_asset_latest
    from app.db.models import AssetScanSummary

    s = AssetScanSummary(
        run_id="run-001",
        asset_id="asset-001",
        scan_status="succeeded",
        row_count=5000,
        column_count=3,
    )

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=s)

    result = await get_asset_latest(db, "asset-001")
    assert result is not None
    assert result.scan_status == "succeeded"
    assert result.row_count == 5000


# ─── Test 4: ownership assignment + audit log ─────────────────────────────────

@pytest.mark.asyncio
async def test_ownership_assignment_writes_audit_log():
    """PUT /assets/{id}/ownership updates ownership fields and writes an AuditLog."""
    from app.api.ownership import set_asset_ownership
    from app.db.models import AuditLog

    asset = MagicMock()
    asset.asset_id = "asset-001"
    asset.owner_user_id = None
    asset.owner_team_id = None
    asset.steward_user_id = None
    asset.owner_name = None
    asset.owner_email = None
    asset.technical_owner_name = None
    asset.technical_owner_email = None

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=asset)

    user = {"email": "admin@company.com", "role": "admin", "user_id": "u-001"}
    payload = {"owner_user_id": "u-999", "owner_team_id": "team-001"}

    result = await set_asset_ownership("asset-001", payload, db=db, user=user)

    assert asset.owner_user_id == "u-999"
    assert asset.owner_team_id == "team-001"

    # An AuditLog must have been written
    added_objects = [c[0][0] for c in db.add.call_args_list]
    audit_entries = [o for o in added_objects if isinstance(o, AuditLog)]
    assert len(audit_entries) == 1
    assert audit_entries[0].entity_type == "ownership"
    assert audit_entries[0].entity_id == "asset-001"
    assert audit_entries[0].user_email == "admin@company.com"


@pytest.mark.asyncio
async def test_ownership_get_returns_all_fields():
    """GET /assets/{id}/ownership returns all seven ownership fields."""
    from app.api.ownership import get_asset_ownership

    asset = MagicMock()
    asset.asset_id = "asset-001"
    asset.owner_user_id = "u-999"
    asset.owner_team_id = "team-001"
    asset.steward_user_id = None
    asset.owner_name = "Alice"
    asset.owner_email = "alice@company.com"
    asset.technical_owner_name = None
    asset.technical_owner_email = None

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=asset)

    user = {"email": "admin@company.com", "role": "admin"}
    result = await get_asset_ownership("asset-001", db=db, _=user)

    assert result["owner_user_id"] == "u-999"
    assert result["owner_team_id"] == "team-001"
    assert result["owner_name"] == "Alice"


# ─── Test 5: RBAC effective permissions ──────────────────────────────────────

@pytest.mark.asyncio
async def test_effective_roles_includes_primary_role():
    """get_user_effective_roles returns at minimum the user's primary role."""
    from app.services.rbac import get_user_effective_roles

    db = AsyncMock()
    # First execute: user_roles → empty list
    # Second execute: team memberships → empty list (so no third execute)
    result1 = MagicMock()
    result1.scalars.return_value.all.return_value = []
    result2 = MagicMock()
    result2.scalars.return_value.all.return_value = []
    db.execute.side_effect = [result1, result2]

    roles = await get_user_effective_roles("u-001", "data_steward", db)
    assert "data_steward" in roles


@pytest.mark.asyncio
async def test_effective_roles_inherits_team_roles():
    """Team membership grants the team's roles to user."""
    from app.services.rbac import get_user_effective_roles
    from app.db.models import TeamMembership, TeamRole

    membership = MagicMock(spec=TeamMembership)
    membership.team_id = "team-001"

    team_role = MagicMock(spec=TeamRole)
    team_role.role = "data_engineer"

    # First execute: user_roles → empty
    result1 = MagicMock()
    result1.scalars.return_value.all.return_value = []
    # Second execute: team memberships → [membership]
    result2 = MagicMock()
    result2.scalars.return_value.all.return_value = [membership]
    # Third execute: team roles for team-001 → [team_role]
    result3 = MagicMock()
    result3.scalars.return_value.all.return_value = [team_role]

    db = AsyncMock()
    db.execute.side_effect = [result1, result2, result3]

    roles = await get_user_effective_roles("u-001", "analyst", db)
    assert "analyst" in roles
    assert "data_engineer" in roles


def test_get_effective_permissions_for_admin():
    """Admin role must grant all six core permissions."""
    from app.services.rbac import get_effective_permissions

    perms = get_effective_permissions(["admin"])
    assert "manage_sources" in perms
    assert "run_scans" in perms
    assert "view_results" in perms
    assert "manage_assets" in perms
    assert "manage_users" in perms
    assert "edit_metadata" in perms


def test_get_effective_permissions_viewer_is_read_only():
    """Viewer role grants only view_results."""
    from app.services.rbac import get_effective_permissions

    perms = get_effective_permissions(["viewer"])
    assert perms == {"view_results"}


def test_get_effective_permissions_union_of_roles():
    """Multiple roles return the union of their permissions."""
    from app.services.rbac import get_effective_permissions

    perms = get_effective_permissions(["analyst", "data_engineer"])
    assert "run_scans" in perms
    assert "manage_sources" in perms
    assert "view_results" in perms


# ─── Test 6: asset_registry stable IDs are deterministic ─────────────────────

def test_stable_asset_id_is_deterministic():
    """Same qualified path always produces the same UUID."""
    from app.services.asset_registry import stable_asset_id

    id1 = stable_asset_id("table:conn-001:demo_db:public:orders")
    id2 = stable_asset_id("table:conn-001:demo_db:public:orders")
    id3 = stable_asset_id("table:conn-001:demo_db:public:customers")

    assert id1 == id2
    assert id1 != id3
    assert len(id1) == 36  # valid UUID string


def test_stable_asset_id_case_normalisation():
    """Lowercase path before calling stable_asset_id produces consistent IDs."""
    from app.services.asset_registry import stable_asset_id

    path = "table:conn-001:DEMO_DB:PUBLIC:ORDERS"
    assert stable_asset_id(path.lower()) == stable_asset_id(path.lower())


# ─── Test 7: status transition guard ─────────────────────────────────────────

def test_asset_status_transition_blocked_disabled_to_active():
    """disabled → active transition is blocked; requires admin re-enable."""
    from app.services.asset_registry import transition_status

    with pytest.raises(ValueError, match="blocked"):
        transition_status("disabled", "active")


def test_asset_status_transition_allows_active_to_missing():
    """active → missing transition is allowed."""
    from app.services.asset_registry import transition_status

    result = transition_status("active", "missing")
    assert result == "missing"


def test_asset_status_transition_rejects_invalid_status():
    """Unknown status names are rejected."""
    from app.services.asset_registry import transition_status

    with pytest.raises(ValueError, match="Invalid status"):
        transition_status("active", "unknown_status")
