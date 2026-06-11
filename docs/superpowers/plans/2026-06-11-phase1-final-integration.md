# Phase 1 Final Integration Pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all Phase 1 modules into a coherent, tested end-to-end platform, fix two data-correctness bugs, add one missing query endpoint, and add integration tests covering the full discovery flow, ownership, and RBAC.

**Architecture:** Six modules already exist and are independently tested (393 tests passing). This pass fixes integration seams: a duplicate-key bug in `results_store.record_metrics`, a silent counter bug in `write_run_summary`, a missing per-asset scan history endpoint, and a test gap — no test exercises the full create-source → trigger → discover → metadata stored → results queryable sequence.

**Tech Stack:** FastAPI, SQLAlchemy async, Python 3.11, pytest + pytest-asyncio + AsyncMock

---

## Integration Architecture Summary

### Module Map

```
M1 Source Connector Framework   app/connectors/, app/api/connections.py
M2 Asset Registry               app/services/asset_registry.py, app/services/discovery_service.py
M3 Metadata Store               app/services/metadata_store.py, app/api/metadata.py
M4 Scan Orchestration           app/services/scan_orchestrator.py, app/api/scan_jobs.py
M5 Results Storage              app/services/results_store.py, app/api/scan_results.py
M6 User / Role Model            app/services/rbac.py, app/api/teams.py, app/api/ownership.py
```

### End-to-End Sequence (metadata_discovery flow)

```
Client
  → POST /scan-jobs                            create job (M4)
  → POST /scan-jobs/{id}/trigger               create ScanJobRun, enqueue background task (M4)
  [background]
    → scan_orchestrator._execute_run()         transitions run queued→running (M4)
      → _run_metadata_discovery()              (M4)
        → discovery_service.run_discovery()    (M2)
          → M1 connector: browse tables
          → asset_registry.ensure_hierarchy_assets()     upsert source/db/schema Assets
          → db.add(Asset + AssetSourceMeta + AuditLog)   table asset
          → metadata_store.upsert_column_metadata()      column_metadata rows (M3)
          → metadata_store.record_scan_result()          (M3)
            → results_store.write_asset_summary()        AssetScanSummary row (M5)
            → results_store.record_metrics()             ScanMetricsHistory rows (M5)
        → returns {"result_summary": {"new_assets": N, ...}}
      → run marked succeeded/failed
      → results_store.write_run_summary()       ScanRunSummary row (M5)
  → GET /scan-results/runs/{run_id}             (M5)
  → GET /scan-results/assets/{asset_id}/latest  (M5)
  → GET /metadata/assets/{asset_id}             (M3)
  → PUT /assets/{asset_id}/ownership            RBAC-guarded ownership update (M6)
  → GET /assets/{asset_id}/ownership            ownership query (M6)
```

### Transaction Boundaries

| Boundary | Owner | Commit point |
|----------|-------|--------------|
| Hierarchy assets | `ensure_hierarchy_assets` + caller | `db.commit()` after call in `run_discovery` |
| Table asset + AuditLog | `run_discovery` per-table block | `await db.commit()` after `db.add(asset)` |
| Column metadata | `metadata_store.upsert_column_metadata` | internal `await db.commit()` |
| Scan result + metrics | `metadata_store.record_scan_result` | single `await db.commit()` at end |
| Run summary | `results_store.write_run_summary` | caller commits after calling it |

---

## Bugs Found

### Bug 1 — `record_metrics` IntegrityError on same-day re-scan

**Location:** `app/services/results_store.py:record_metrics`

**Root cause:** Blind INSERT without checking the unique constraint `uq_scan_metrics_asset_metric_date (asset_id, metric_name, metric_date)`. The second discovery run on the same day inserts the same `(asset_id, "row_count", today)` row, which raises `IntegrityError` inside `metadata_store.record_scan_result`'s `await db.commit()`. This causes the entire table asset scan to be marked as error.

**Fix:** Upsert — if the row exists, update `metric_value_num`; else insert.

### Bug 2 — `write_run_summary` always writes `new_assets_count=0`

**Location:** `app/services/results_store.py:write_run_summary` + `app/services/scan_orchestrator.py:_run_metadata_discovery`

**Root cause:** `_run_metadata_discovery` returns `result_summary={"tables_scanned": N, "tables_failed": N, "tables_total": N}`. `write_run_summary` looks for `result_summary.get("new_assets", 0)` — key mismatch means this is always 0.

**Fix:** In `_run_metadata_discovery`, count per-status from `job_tracker` results dict and include `"new_assets"`, `"updated_assets"`, `"removed_assets"` in `result_summary`.

---

## Missing Interface

### Missing: `GET /scan-results/assets/{asset_id}/history`

The existing `GET /scan-results/assets/{asset_id}/latest` returns only the single most-recent `AssetScanSummary`. There is no way to query a paginated scan history per asset. This is needed to answer: "how has this asset's scan status and column count changed over the last N runs?"

**Fix:** Add `get_asset_history` to `results_store` and expose it as a new endpoint.

---

## Final Unified API Map (Phase 1)

```
# Source Connector Framework
POST   /connections                            create connection
GET    /connections                            list connections
GET    /connections/{id}                       get connection
PATCH  /connections/{id}                       update connection
DELETE /connections/{id}                       delete connection
POST   /connections/{id}/test                  test connection
GET    /connections/{id}/databases             browse databases
GET    /connections/{id}/schemas               browse schemas
GET    /connections/{id}/tables                browse tables

# Scan Orchestration
POST   /scan-jobs                              create scan job
GET    /scan-jobs                              list jobs (?connection_id=, ?job_type=)
GET    /scan-jobs/{id}                         get job
PATCH  /scan-jobs/{id}                         update job
DELETE /scan-jobs/{id}                         delete job
POST   /scan-jobs/{id}/trigger                 trigger run → 202
GET    /scan-jobs/{id}/runs                    list runs
GET    /scan-jobs/{id}/runs/{run_id}           get run
GET    /scan-jobs/{id}/runs/{run_id}/logs      get run logs
POST   /scan-jobs/{id}/runs/{run_id}/cancel    cancel run → 202

# Asset Registry
GET    /asset-registry                         list assets
GET    /asset-registry/enriched                list assets with domain/subdomain/connection
GET    /asset-registry/tree                    hierarchical view
GET    /asset-registry/{id}                    get asset
POST   /asset-registry                         create asset manually
PATCH  /asset-registry/{id}                    update asset
DELETE /asset-registry/{id}                    deactivate asset

# Metadata Store
GET    /metadata/assets/{id}                   get current metadata state
GET    /metadata/assets/{id}/history           snapshot history (last 90 days)
GET    /metadata/assets/{id}/columns           column metadata
PATCH  /metadata/assets/{id}/cde               set CDE flag

# Results Storage
GET    /scan-results/runs/{run_id}             run summary
GET    /scan-results/runs/{run_id}/assets      per-asset summaries for run
GET    /scan-results/runs/{run_id}/assets/{id} per-asset summary for run+asset
GET    /scan-results/runs/{run_id}/evidence    evidence log
GET    /scan-results/compare                   diff two runs
GET    /scan-results/assets/{id}/latest        latest asset scan summary
GET    /scan-results/assets/{id}/history       [NEW] all asset scan summaries (paged)
GET    /scan-results/assets/{id}/trend         metric trend over time

# Ownership (M6)
GET    /assets/{id}/ownership                  get ownership
PUT    /assets/{id}/ownership                  set ownership (requires manage_assets)

# Teams + Roles (M6)
POST   /teams                                  create team
GET    /teams                                  list teams
GET    /teams/{id}                             get team
PATCH  /teams/{id}                             update team
DELETE /teams/{id}                             delete team
POST   /teams/{id}/members                     add member
DELETE /teams/{id}/members/{user_id}           remove member
GET    /teams/{id}/members                     list members

# Users + RBAC (M6)
GET    /auth/my-permissions                    effective permissions for caller
POST   /auth/users/{id}/roles                  assign additional role
DELETE /auth/users/{id}/roles/{role}           remove role
```

---

## Phase 2 Extension Points

Phase 2 will add profiling and rule evaluation. The following placeholder tables and hooks are already in place:

| Placeholder | Table | Phase 2 action |
|-------------|-------|----------------|
| Profiling results | `profiling_result_placeholders` | Replace with real `ProfileResult`; flip `is_placeholder=False` |
| Rule results | `rule_result_placeholders` | Connect to rule execution engine; write actual pass/fail |
| Failed samples | `failed_sample_record_placeholders` | Write actual failed rows with retention TTL |
| Quality score | `Asset.latest_profile_score`, `Asset.latest_quality_status` | Written by `metadata_store.update_quality_placeholders()` — already wired |
| Asset scan summary | `AssetScanSummary.quality_score`, `.null_ratio_avg`, etc. | Written by profiling engine post-scan |
| Scan run summary | `ScanRunSummary.quality_score_avg` | Aggregated from per-asset quality scores |
| Rule count | `Asset.attached_rule_count` | Maintained by `metadata_store.increment_rule_count()` on rule CRUD |

**Phase 2 scan job types to add:**
- `profile_scan` — executes profiling per asset, writes `ProfilingResultPlaceholder` with real data
- `rule_scan` — evaluates `DQRule` attached to assets, writes `RuleResultPlaceholder` with real data

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `app/services/results_store.py` | Modify | Fix `record_metrics` upsert + add `get_asset_history` |
| `app/services/scan_orchestrator.py` | Modify | Fix `_run_metadata_discovery` result_summary keys |
| `app/api/scan_results.py` | Modify | Add `GET /scan-results/assets/{id}/history` endpoint |
| `tests/test_integration_e2e.py` | Create | End-to-end integration tests for full flow + ownership + RBAC |

---

## Task 1: Fix `record_metrics` to upsert

**Files:**
- Modify: `app/services/results_store.py`
- Test: `tests/test_results_store.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_results_store.py`:

```python
@pytest.mark.asyncio
async def test_record_metrics_upserts_on_duplicate_date():
    """Calling record_metrics twice on the same (asset, metric, date) must update, not raise."""
    from app.services.results_store import record_metrics
    from datetime import date

    today = date(2026, 6, 11)
    calls = []
    existing_metric = MagicMock()
    existing_metric.metric_value_num = 100.0
    existing_metric.run_id = "run-001"

    db = AsyncMock()
    # First call: no existing row → insert
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    await record_metrics(db, "asset-001", today, {"row_count": 100.0}, run_id="run-001")
    assert db.add.call_count == 1

    # Second call (same day): existing row → update, no second add
    db.add.reset_mock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=existing_metric)

    await record_metrics(db, "asset-001", today, {"row_count": 200.0}, run_id="run-002")
    db.add.assert_not_called()
    assert existing_metric.metric_value_num == 200.0
    assert existing_metric.run_id == "run-002"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_results_store.py::test_record_metrics_upserts_on_duplicate_date -v
```

Expected: FAIL with `AssertionError` (current code adds unconditionally, so `db.add.assert_not_called()` fails)

- [ ] **Step 3: Fix `record_metrics` in `app/services/results_store.py`**

Replace the current `record_metrics` body:

```python
async def record_metrics(
    db: AsyncSession,
    asset_id: str,
    metric_date: date_t,
    metrics: dict[str, Optional[float]],
    run_id: Optional[str] = None,
) -> None:
    """Upsert metric points for an asset. Skips None values. Caller must commit."""
    for name, value in metrics.items():
        if value is None:
            continue
        result = await db.execute(
            select(ScanMetricsHistory).where(
                ScanMetricsHistory.asset_id == asset_id,
                ScanMetricsHistory.metric_name == name,
                ScanMetricsHistory.metric_date == metric_date,
            )
        )
        existing = await _scalar(result)
        if existing:
            existing.metric_value_num = float(value)
            existing.run_id = run_id
        else:
            db.add(ScanMetricsHistory(
                asset_id=asset_id,
                run_id=run_id,
                metric_date=metric_date,
                metric_name=name,
                metric_value_num=float(value),
            ))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_results_store.py::test_record_metrics_upserts_on_duplicate_date -v
```

Expected: PASS

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
python -m pytest tests/test_results_store.py -v
```

Expected: All tests in file pass

- [ ] **Step 6: Commit**

```bash
git add app/services/results_store.py tests/test_results_store.py
git commit -m "fix(results-store): upsert record_metrics to prevent IntegrityError on same-day re-scan"
```

---

## Task 2: Fix `write_run_summary` asset count mapping

**Files:**
- Modify: `app/services/scan_orchestrator.py`
- Test: `tests/test_scan_orchestrator.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_scan_orchestrator.py`:

```python
@pytest.mark.asyncio
async def test_run_metadata_discovery_surfaces_new_assets_count():
    """_run_metadata_discovery must include new_assets/updated_assets in result_summary."""
    from app.services.scan_orchestrator import _run_metadata_discovery
    from app.services import job_tracker as jt

    with patch("app.services.scan_orchestrator.append_log", new_callable=AsyncMock):
        with patch("app.services.scan_orchestrator._jt") as mock_jt:
            with patch("app.services.scan_orchestrator.run_discovery", new_callable=AsyncMock):
                mock_jt.create_job.return_value = "tmp-job-id"
                mock_jt.get_job.return_value = {
                    "completed": 3,
                    "failed": 1,
                    "total": 4,
                    "results": [
                        {"status": "imported", "table_name": "T1"},
                        {"status": "imported", "table_name": "T2"},
                        {"status": "skipped", "table_name": "T3"},
                        {"status": "error", "table_name": "T4"},
                    ],
                }

                result = await _run_metadata_discovery("conn-001", "run-001", {})

    summary = result["result_summary"]
    assert summary["new_assets"] == 2
    assert summary["updated_assets"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_run_metadata_discovery_surfaces_new_assets_count -v
```

Expected: FAIL — the current code doesn't set `new_assets` key in result_summary

- [ ] **Step 3: Fix `_run_metadata_discovery` in `app/services/scan_orchestrator.py`**

Replace:

```python
async def _run_metadata_discovery(
    connection_id: Optional[str], run_id: str, params: dict
) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for metadata_discovery")

    from app.services import job_tracker as _jt
    from app.services.discovery_service import run_discovery

    await append_log(run_id, "INFO", "Starting metadata discovery")
    tmp_job_id = _jt.create_job("metadata_discovery", total=0, meta={"scan_run_id": run_id})

    payload = {"connection_id": connection_id, "triggered_by": "scan_orchestrator", "scan_run_id": run_id, **params}
    await run_discovery(tmp_job_id, payload)

    jt_job = _jt.get_job(tmp_job_id)
    completed = jt_job.get("completed", 0) if jt_job else 0
    failed = jt_job.get("failed", 0) if jt_job else 0

    await append_log(run_id, "INFO", f"Discovery done: {completed} succeeded, {failed} failed")
    return {
        "assets_scanned": completed,
        "errors_count": failed,
        "warnings_count": 0,
        "result_summary": {
            "tables_scanned": completed,
            "tables_failed": failed,
            "tables_total": jt_job.get("total", 0) if jt_job else 0,
        },
    }
```

With:

```python
async def _run_metadata_discovery(
    connection_id: Optional[str], run_id: str, params: dict
) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for metadata_discovery")

    from app.services import job_tracker as _jt
    from app.services.discovery_service import run_discovery

    await append_log(run_id, "INFO", "Starting metadata discovery")
    tmp_job_id = _jt.create_job("metadata_discovery", total=0, meta={"scan_run_id": run_id})

    payload = {"connection_id": connection_id, "triggered_by": "scan_orchestrator", "scan_run_id": run_id, **params}
    await run_discovery(tmp_job_id, payload)

    jt_job = _jt.get_job(tmp_job_id)
    completed = jt_job.get("completed", 0) if jt_job else 0
    failed = jt_job.get("failed", 0) if jt_job else 0
    results = jt_job.get("results", []) if jt_job else []
    new_assets = sum(1 for r in results if r.get("status") == "imported")
    updated_assets = sum(1 for r in results if r.get("status") == "skipped")

    await append_log(run_id, "INFO", f"Discovery done: {new_assets} new, {updated_assets} updated, {failed} failed")
    return {
        "assets_scanned": completed,
        "errors_count": failed,
        "warnings_count": 0,
        "result_summary": {
            "tables_scanned": completed,
            "tables_failed": failed,
            "tables_total": jt_job.get("total", 0) if jt_job else 0,
            "new_assets": new_assets,
            "updated_assets": updated_assets,
            "removed_assets": 0,
        },
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_run_metadata_discovery_surfaces_new_assets_count -v
```

Expected: PASS

- [ ] **Step 5: Update `write_run_summary` to consume the new keys**

In `app/services/results_store.py`, change `write_run_summary` so the summary uses the corrected keys. Replace:

```python
    result_summary = run.result_summary or {}
    failed = result_summary.get("tables_failed", run.errors_count)

    summary = ScanRunSummary(
        run_id=run_id,
        job_id=run.job_id,
        connection_id=connection_id,
        scan_type=scan_type,
        new_assets_count=result_summary.get("new_assets", 0),
        updated_assets_count=result_summary.get("updated_assets", max(0, run.assets_scanned - failed)),
        removed_assets_count=result_summary.get("removed_assets", 0),
        failed_assets_count=failed,
        schema_changes_count=result_summary.get("schema_changes", 0),
        scan_parameters=run.parameters,
    )
```

With:

```python
    result_summary = run.result_summary or {}
    failed = result_summary.get("tables_failed", run.errors_count)
    new_assets = result_summary.get("new_assets", 0)
    updated_assets = result_summary.get("updated_assets", max(0, run.assets_scanned - failed - new_assets))

    summary = ScanRunSummary(
        run_id=run_id,
        job_id=run.job_id,
        connection_id=connection_id,
        scan_type=scan_type,
        new_assets_count=new_assets,
        updated_assets_count=updated_assets,
        removed_assets_count=result_summary.get("removed_assets", 0),
        failed_assets_count=failed,
        schema_changes_count=result_summary.get("schema_changes", 0),
        scan_parameters=run.parameters,
    )
```

- [ ] **Step 6: Write a test for the corrected `write_run_summary` new_assets_count mapping**

Add to `tests/test_results_store.py`:

```python
@pytest.mark.asyncio
async def test_write_run_summary_maps_new_assets_count():
    """write_run_summary must read new_assets from result_summary, not default to 0."""
    from app.services.results_store import write_run_summary

    mock_run = MagicMock()
    mock_run.run_id = "run-001"
    mock_run.job_id = "job-001"
    mock_run.assets_scanned = 5
    mock_run.errors_count = 1
    mock_run.warnings_count = 0
    mock_run.error_message = None
    mock_run.result_summary = {
        "tables_scanned": 4,
        "tables_failed": 1,
        "tables_total": 5,
        "new_assets": 3,
        "updated_assets": 1,
        "removed_assets": 0,
    }
    mock_run.parameters = None

    mock_job = MagicMock()
    mock_job.connection_id = "conn-001"
    mock_job.job_type = "metadata_discovery"

    db = AsyncMock()
    db.get.side_effect = [mock_run, mock_job]
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    await write_run_summary(db, "run-001")

    added = db.add.call_args[0][0]
    assert added.new_assets_count == 3
    assert added.updated_assets_count == 1
    assert added.failed_assets_count == 1
```

- [ ] **Step 7: Run test to verify it passes**

```bash
python -m pytest tests/test_results_store.py::test_write_run_summary_maps_new_assets_count -v
```

Expected: PASS

- [ ] **Step 8: Run full test suite**

```bash
python -m pytest tests/test_scan_orchestrator.py tests/test_results_store.py -v
```

Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add app/services/scan_orchestrator.py app/services/results_store.py \
        tests/test_scan_orchestrator.py tests/test_results_store.py
git commit -m "fix(orchestrator): surface new_assets/updated_assets counts in run summary"
```

---

## Task 3: Add `GET /scan-results/assets/{asset_id}/history` endpoint

**Files:**
- Modify: `app/services/results_store.py` — add `get_asset_history`
- Modify: `app/api/scan_results.py` — expose new endpoint
- Test: `tests/test_scan_results_api.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_scan_results_api.py`:

```python
@pytest.mark.asyncio
async def test_get_asset_scan_history():
    """GET /scan-results/assets/{id}/history returns paginated AssetScanSummary rows."""
    from app.services.results_store import get_asset_history
    from unittest.mock import AsyncMock, MagicMock

    summary1 = MagicMock()
    summary1.asset_summary_id = "s1"
    summary1.run_id = "run-001"
    summary1.asset_id = "asset-001"
    summary1.job_id = "job-001"
    summary1.scan_status = "succeeded"
    summary1.scan_duration_ms = 150
    summary1.row_count = 1000
    summary1.bytes = 50000
    summary1.column_count = 5
    summary1.schema_hash = "abc123"
    summary1.columns_added = 0
    summary1.columns_removed = 0
    summary1.columns_changed = 0
    summary1.schema_drift_detected = False
    summary1.error_message = None
    summary1.quality_score = None
    summary1.null_ratio_avg = None
    summary1.distinct_ratio_avg = None
    summary1.volume_change_pct = None
    summary1.freshness_hours = None
    from datetime import datetime
    summary1.created_at = datetime(2026, 6, 11, 10, 0, 0)

    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = [summary1]

    results = await get_asset_history(db, "asset-001", limit=50)
    assert len(results) == 1
    assert results[0].asset_id == "asset-001"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_scan_results_api.py::test_get_asset_scan_history -v
```

Expected: FAIL — `get_asset_history` not yet defined in `results_store`

- [ ] **Step 3: Add `get_asset_history` to `app/services/results_store.py`**

Add after the existing `get_asset_latest` function:

```python
async def get_asset_history(
    db: AsyncSession,
    asset_id: str,
    limit: int = 50,
) -> list[AssetScanSummary]:
    """Return all AssetScanSummary rows for an asset, newest-first. Max 500."""
    limit = min(limit, 500)
    result = await db.execute(
        select(AssetScanSummary)
        .where(AssetScanSummary.asset_id == asset_id)
        .order_by(desc(AssetScanSummary.created_at))
        .limit(limit)
    )
    return await _scalars_all(result)
```

- [ ] **Step 4: Add the endpoint to `app/api/scan_results.py`**

Add after the existing `get_asset_latest_endpoint`:

```python
@router.get("/assets/{asset_id}/history")
async def get_asset_scan_history_endpoint(
    asset_id: str,
    limit: int = Query(50, ge=1, le=500),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    summaries = await results_store.get_asset_history(db, asset_id, limit=limit)
    return [_asset_summary_dict(s) for s in summaries]
```

- [ ] **Step 5: Run test to verify it passes**

```bash
python -m pytest tests/test_scan_results_api.py::test_get_asset_scan_history -v
```

Expected: PASS

- [ ] **Step 6: Run all scan-results tests**

```bash
python -m pytest tests/test_scan_results_api.py -v
```

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add app/services/results_store.py app/api/scan_results.py tests/test_scan_results_api.py
git commit -m "feat(scan-results): add GET /scan-results/assets/{id}/history endpoint"
```

---

## Task 4: End-to-end integration tests

**Files:**
- Create: `tests/test_integration_e2e.py`

This task tests the core Phase 1 flows using mocks (no real DB or Snowflake connection needed).

- [ ] **Step 1: Create `tests/test_integration_e2e.py`**

```python
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
    run = _make_run()

    with patch("app.services.scan_orchestrator.AsyncSessionLocal") as mock_ctx:
        mock_db = AsyncMock()
        mock_db.get.side_effect = [
            run,   # _execute_run: get ScanJobRun
            job,   # _execute_run: get ScanJob
            run,   # finalize run
            job,   # update job.last_run_at
        ]
        mock_ctx.return_value.__aenter__.return_value = mock_db

        with patch("app.services.scan_orchestrator._dispatch_handler", new_callable=AsyncMock) as mock_dispatch:
            mock_dispatch.return_value = {
                "assets_scanned": 2,
                "errors_count": 0,
                "warnings_count": 0,
                "result_summary": run.result_summary,
            }
            with patch.object(results_store, "write_run_summary", new_callable=AsyncMock) as mock_write:
                await scan_orchestrator._execute_run("run-001")

        mock_write.assert_called_once()
        call_args = mock_write.call_args
        assert call_args[0][1] == "run-001"


# ─── Test 2: discovery → asset registry → metadata store → results store ─────

@pytest.mark.asyncio
async def test_discovery_flow_calls_metadata_store_and_results_store():
    """Run discovery with one table → verify metadata_store and results_store are called."""
    from app.services import metadata_store, results_store
    from app.services import job_tracker as jt

    # Minimal: one database, one schema, one table
    payload = {
        "connection_id": "conn-001",
        "triggered_by": "test",
        "scan_run_id": "run-001",
        "selections": [{"database": "DEMO_DB", "schema": "PUBLIC"}],
    }

    job_id = jt.create_job("metadata_discovery", total=1)

    # Patch all external I/O
    with patch("app.services.discovery_service.AsyncSessionLocal") as mock_ctx, \
         patch("app.services.discovery_service._browse_tables_sync") as mock_browse, \
         patch("app.services.discovery_service._browse_columns_sync") as mock_cols, \
         patch("app.services.discovery_service.classify_table", new_callable=AsyncMock) as mock_classify, \
         patch("app.services.discovery_service._meta_store") as mock_meta_store, \
         patch("app.services.discovery_service.asyncio.create_task"), \
         patch("app.services.discovery_service.ensure_hierarchy_assets", new_callable=AsyncMock) as mock_hier:

        from app.db.models import Domain, Subdomain

        domain = MagicMock(spec=Domain)
        domain.domain_id = "dom-001"
        domain.domain_name = "Sales"
        domain.is_active = True

        subdomain = MagicMock(spec=Subdomain)
        subdomain.subdomain_id = "sub-001"
        subdomain.subdomain_name = "Revenue"
        subdomain.domain_id = "dom-001"
        subdomain.is_active = True

        mock_db = AsyncMock()
        # domain + subdomain queries
        mock_db.execute.return_value.scalars.return_value.all.side_effect = [
            [domain],    # domain_rows
            [subdomain], # subdomain_rows
        ]
        mock_db.execute.return_value.scalar_one_or_none.return_value = _make_connection()
        mock_ctx.return_value.__aenter__.return_value = mock_db

        mock_browse.return_value = [
            {"table_name": "ORDERS", "table_type": "TABLE", "row_count": 5000, "bytes": 102400, "comment": "", "last_altered": None}
        ]
        mock_cols.return_value = [
            {"column_name": "order_id", "data_type": "INTEGER", "is_nullable": "NO", "ordinal_position": 1, "comment": ""}
        ]
        mock_classify.return_value = {"domain": "Sales", "subdomain": "Revenue", "reason": "test"}
        mock_hier.return_value = ("src-001", "db-001", "sch-001")

        mock_meta_store.upsert_column_metadata = AsyncMock()
        mock_meta_store.compute_schema_hash = MagicMock(return_value="hash123")
        mock_meta_store.record_scan_result = AsyncMock()

        from app.services.discovery_service import run_discovery
        await run_discovery(job_id, payload)

    job = jt.get_job(job_id)
    assert job is not None
    # At least one table was processed (imported or skipped)
    assert job["completed"] + job["failed"] > 0 or job["status"] in ("completed", "failed")


# ─── Test 3: results_store read-back after discovery ─────────────────────────

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
    from fastapi import Request

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
    added_objects = [call[0][0] for call in db.add.call_args_list]
    from app.db.models import AuditLog
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
    db.execute.return_value.scalars.return_value.all.side_effect = [
        [],  # no extra user_roles
        [],  # no team memberships
    ]

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

    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.side_effect = [
        [],             # no direct user_roles
        [membership],   # team memberships
        [team_role],    # team roles for team-001
    ]

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
```

- [ ] **Step 2: Run test file to verify all pass first time**

```bash
python -m pytest tests/test_integration_e2e.py -v
```

Expected: All tests PASS (no implementation changes needed — these test correct behavior that already works)

- [ ] **Step 3: Commit**

```bash
git add tests/test_integration_e2e.py
git commit -m "test(integration): add end-to-end integration tests for Phase 1 flows"
```

---

## Task 5: Full regression check and cleanup

- [ ] **Step 1: Run the complete test suite**

```bash
python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: All existing tests + new tests pass. Count should be ≥ 410.

- [ ] **Step 2: Verify no import errors on app startup**

```bash
python -c "from app.main import app; print('Import OK')"
```

Expected: `Import OK`

- [ ] **Step 3: Commit if any cleanup was needed**

```bash
git add -p
git commit -m "fix(integration): cleanup from final integration pass"
```

---

## Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `record_metrics` fix adds an extra SELECT per metric per asset per scan — N+1 for multi-column tables | Low | Metrics writes happen once per asset per run (2 metrics: `row_count`, `column_count`). The extra SELECT is negligible. Phase 2 can batch if needed. |
| `result_summary` structure depends on job_tracker `results` list being populated before `get_job` is called in `_run_metadata_discovery` | Medium | `run_discovery` is awaited (not fire-and-forget) before `get_job`, so the results list is fully populated at read time. |
| `write_run_summary` called before per-asset `AssetScanSummary` rows are committed | Low | `record_scan_result` commits each asset row within the per-asset `_meta_store.record_scan_result` call, which happens before `execute_run` finishes. The `write_run_summary` call comes after, in a new session. Ordering is guaranteed. |
| Single long-lived `AsyncSession` in `run_discovery` for-loop | Low | Each iteration either commits or rolls back. SQLAlchemy recycles the connection after rollback. Works for now; Phase 2 should move to per-table sessions for larger scans. |
| `job_tracker` is in-process memory — won't work in multi-replica deployments | Medium | Already documented in `job_tracker.py`. Phase 2 should replace with Redis-backed store. |

---

## Phase 2 Extension Points (Code Hooks)

All hooks are already stubbed. Phase 2 implementors should look for these:

```python
# 1. Profiling hook in metadata_store.py
async def update_quality_placeholders(db, asset_id, profile_score, quality_status)
# → Phase 2: call this from profiling engine after scoring

# 2. Profiling placeholder table
# app/db/models.py: ProfilingResultPlaceholder (is_placeholder=True initially)
# → Phase 2: write real profile stats; flip is_placeholder=False

# 3. Rule results placeholder
# app/db/models.py: RuleResultPlaceholder (status="pending" initially)
# → Phase 2: write rule evaluation results

# 4. AssetScanSummary.quality_score, null_ratio_avg, distinct_ratio_avg, volume_change_pct, freshness_hours
# → Phase 2: populate from profiling engine output

# 5. ScanRunSummary.quality_score_avg
# → Phase 2: aggregate from per-asset AssetScanSummary.quality_score

# 6. scan_orchestrator._run_placeholder("profile_scan_placeholder", run_id)
# → Phase 2: implement _run_profile_scan() as a real handler

# 7. increment_rule_count() in metadata_store — called by rule CRUD APIs
# → Phase 2: rules engine can query Asset.attached_rule_count for rule-enabled assets

# 8. ScanEvidenceLog — append diagnostic evidence during scan
# → Phase 2: write evidence for failed rows, schema drift events, anomalies
```
