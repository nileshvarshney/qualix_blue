# Profiling Engine + Profiling UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add asset-level and column-level data profiling so users can run a profile scan on a dataset and inspect profiling results — row count, null ratios, cardinality, min/max, top values — directly in the Asset Registry UI.

**Architecture:** The existing `ProfilingResultPlaceholder` ORM model and `profile_scan_placeholder` job type already exist as stubs. Phase 2 replaces those stubs with a real `ProfilingService` that samples rows via `BaseConnector.sample_rows()`, computes column statistics in Python, persists results back into `profiling_result_placeholders` (setting `is_placeholder=False`), and exposes a new `/profile-results` FastAPI router. The frontend adds a "Profiling" tab inside `AssetDetailPanel` for table/view assets using the existing tab-less panel layout.

**Tech Stack:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, Snowflake (via existing connector), Next.js 15 App Router, React 19, TypeScript 5, Tailwind CSS 4

---

## Audit of Phase 1 Integration Points

| Integration Point | File | Hook for Phase 2 |
|---|---|---|
| `ProfilingResultPlaceholder` model | `app/db/models.py:1257` | Already exists; add `data_type`, `row_count` columns |
| `ColumnProfileHistory` model | `app/db/models.py:614` | Already exists; add `run_id` FK |
| `profile_scan_placeholder` handler | `app/services/scan_orchestrator.py:247` | Replace `_run_placeholder` call with `_run_profile_scan` |
| `BaseConnector.sample_rows()` | `app/connectors/base.py:51` | Already abstract; Snowflake + PostgreSQL adapters have real impl |
| `ConnectorConfig.from_orm()` | `app/connectors/config.py:40` | Builds config from `SnowflakeConnection` ORM record |
| `Asset.latest_profile_score` | `app/db/models.py:156` | Already a nullable Float column |
| `Asset.latest_quality_status` | `app/db/models.py` | Already a nullable String column |
| `AssetSourceMeta` | `app/db/models.py:196` | Provides `sf_database_name`, `sf_schema_name`, `sf_table_name` and generic equivalents |
| `AssetDetailPanel.tsx` | `frontend/src/components/asset-registry/AssetDetailPanel.tsx` | Currently no tabs; add tab bar for Profiling |
| `_JOB_TYPE_RE` regex | `app/schemas/scan_job.py:6` | Must add `profile_scan` to the allowed job types |
| `main.py` router registration | `app/main.py:209` | Add `profile_results.router` |

---

## Profiling Architecture Summary

```
User clicks "Run Profile" in AssetDetailPanel
    ↓
POST /api/scan-jobs → creates ScanJob(job_type="profile_scan", connection_id=...)
POST /api/scan-jobs/{job_id}/trigger → queues ScanJobRun
    ↓
Background: scan_orchestrator._execute_run()
    ↓ dispatch on "profile_scan"
_run_profile_scan(connection_id, run_id, params)
    ↓ for each active table/view in connection
profiling_service.profile_table(connection_id, run_id, asset_id, db, schema, table)
    ↓
connector.sample_rows(db, schema, table, limit=10000) → list[dict]
    ↓ per-column Python stats
write ProfilingResultPlaceholder rows (is_placeholder=False)
update ColumnMetadata stats (null_count, unique_count, cardinality_pct, avg_value, std_dev)
upsert ColumnProfileHistory row
update Asset.latest_profile_score, Asset.latest_quality_status
    ↓
GET /profile-results/assets/{asset_id}/summary  → profile summary card
GET /profile-results/assets/{asset_id}/columns  → column profile table
GET /profile-results/assets/{asset_id}/history  → run history selector
```

---

## Data Model Changes

### Migration 0018 — add 3 columns

Table `profiling_result_placeholders`:
- Add `data_type VARCHAR(100)` (inferred from `ColumnMetadata.data_type`)
- Add `row_count BIGINT` (total rows sampled, same value across all columns for same run/asset)

Table `column_profile_history`:
- Add `run_id VARCHAR(36)` nullable FK → `scan_job_runs.run_id ON DELETE SET NULL`

---

## File Structure

### Create

| File | Responsibility |
|---|---|
| `app/services/profiling_service.py` | Column stat computation + write to DB (one public function: `profile_table`) |
| `app/services/profiling_results_store.py` | Read-side queries for profile results (3 public functions) |
| `app/api/profile_results.py` | FastAPI router with 4 GET endpoints |
| `migrations/versions/0018_profiling_engine.py` | Alembic migration: 3 new columns |
| `frontend/src/components/asset-registry/AssetProfilingTab.tsx` | Profiling tab UI component |
| `frontend/src/app/api/profile-results/assets/[assetId]/summary/route.ts` | Next.js API proxy |
| `frontend/src/app/api/profile-results/assets/[assetId]/columns/route.ts` | Next.js API proxy |
| `frontend/src/app/api/profile-results/assets/[assetId]/history/route.ts` | Next.js API proxy |
| `frontend/src/app/api/profile-results/runs/[runId]/assets/[assetId]/columns/route.ts` | Next.js API proxy |
| `tests/test_profiling_service.py` | Unit tests for stat computation |
| `tests/test_profile_results_api.py` | Integration tests for API endpoints |

### Modify

| File | Change |
|---|---|
| `app/db/models.py` | Add `data_type`, `row_count` to `ProfilingResultPlaceholder`; add `run_id` to `ColumnProfileHistory` |
| `app/schemas/scan_job.py` | Add `profile_scan` to `_JOB_TYPE_RE` |
| `app/services/scan_orchestrator.py` | Add `_run_profile_scan` handler; register `profile_scan` in `_dispatch_handler` |
| `app/main.py` | Import and register `profile_results.router` |
| `frontend/src/components/asset-registry/AssetDetailPanel.tsx` | Add tab bar for Overview / Profiling |

### Not Touched

- `app/connectors/` — `sample_rows()` already implemented for Snowflake and PostgreSQL; no changes needed
- `app/services/discovery_service.py` — already populates `ColumnMetadata`; profiling extends it
- `app/services/results_store.py` — profiling uses a separate store to avoid coupling
- `app/services/metadata_store.py` — profiling writes directly to `ColumnMetadata` via SQLAlchemy
- All existing pages and routes — zero changes to existing UI pages
- `app/core/security.py`, `app/db/database.py` — no changes

---

## Task 1: Alembic Migration 0018

**Files:**
- Create: `migrations/versions/0018_profiling_engine.py`

- [ ] **Step 1: Write the migration file**

```python
# migrations/versions/0018_profiling_engine.py
"""profiling engine: add data_type and row_count to profiling_result_placeholders; add run_id to column_profile_history"""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiling_result_placeholders",
        sa.Column("data_type", sa.String(100), nullable=True),
    )
    op.add_column(
        "profiling_result_placeholders",
        sa.Column("row_count", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "column_profile_history",
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey("scan_job_runs.run_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("column_profile_history", "run_id")
    op.drop_column("profiling_result_placeholders", "row_count")
    op.drop_column("profiling_result_placeholders", "data_type")
```

- [ ] **Step 2: Verify migration file is syntactically valid**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "import ast; ast.parse(open('migrations/versions/0018_profiling_engine.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add migrations/versions/0018_profiling_engine.py
git commit -m "feat(profiling): add migration 0018 for profiling engine columns"
```

---

## Task 2: Update ORM Models

**Files:**
- Modify: `app/db/models.py:1264` (ProfilingResultPlaceholder) and `app/db/models.py:614` (ColumnProfileHistory)

- [ ] **Step 1: Write the failing test for new fields**

```python
# tests/test_profiling_service.py (create this file now as placeholder for later tests)
"""Profiling service and model tests."""
import pytest
from app.db.models import ProfilingResultPlaceholder, ColumnProfileHistory


def test_profiling_result_placeholder_has_data_type():
    p = ProfilingResultPlaceholder(
        run_id="run-1",
        asset_id="asset-1",
        column_name="email",
        data_type="VARCHAR",
        row_count=1000,
    )
    assert p.data_type == "VARCHAR"
    assert p.row_count == 1000
    assert p.is_placeholder is True


def test_column_profile_history_has_run_id():
    h = ColumnProfileHistory(
        asset_id="asset-1",
        column_name="email",
        profile_date=__import__("datetime").date.today(),
        run_id="run-1",
    )
    assert h.run_id == "run-1"
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
pytest tests/test_profiling_service.py::test_profiling_result_placeholder_has_data_type -v
```

Expected: `FAILED` with `TypeError: __init__() got an unexpected keyword argument 'data_type'`

- [ ] **Step 3: Add `data_type` and `row_count` to `ProfilingResultPlaceholder`**

In `app/db/models.py`, find the block starting at line 1280 (`std_dev` field) and add after the existing `top_values` line:

```python
    # After: top_values: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    # After: pattern_frequency: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    # Add these two new lines:
    data_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
```

Find the exact insertion point — the line after `pattern_frequency` and before `is_placeholder`:

Old block in `app/db/models.py` (lines 1280–1283):
```python
    top_values: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    pattern_frequency: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
```

New block:
```python
    top_values: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    pattern_frequency: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    data_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
```

- [ ] **Step 4: Add `run_id` to `ColumnProfileHistory`**

In `app/db/models.py`, find the `ColumnProfileHistory` class (line 614). Find the `top_values` field and add `run_id` after it:

Old block (lines 628–629):
```python
    top_values: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False)
```

New block:
```python
    top_values: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, nullable=False)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
pytest tests/test_profiling_service.py -v
```

Expected: Both tests `PASSED`

- [ ] **Step 6: Commit**

```bash
git add app/db/models.py tests/test_profiling_service.py
git commit -m "feat(profiling): add data_type, row_count to ProfilingResultPlaceholder; run_id to ColumnProfileHistory"
```

---

## Task 3: Update scan_job.py Schema to Allow `profile_scan` Job Type

**Files:**
- Modify: `app/schemas/scan_job.py:6`

- [ ] **Step 1: Write failing test**

Add this test to `tests/test_profiling_service.py`:

```python
def test_scan_job_create_accepts_profile_scan_job_type():
    from app.schemas.scan_job import ScanJobCreate
    job = ScanJobCreate(
        job_name="Profile all tables",
        job_type="profile_scan",
        schedule_frequency="on_demand",
    )
    assert job.job_type == "profile_scan"
```

- [ ] **Step 2: Run test to see it fail**

```bash
pytest tests/test_profiling_service.py::test_scan_job_create_accepts_profile_scan_job_type -v
```

Expected: `FAILED` with `ValidationError` (pattern mismatch)

- [ ] **Step 3: Update `_JOB_TYPE_RE` in `app/schemas/scan_job.py`**

Old value:
```python
_JOB_TYPE_RE = (
    "^(connection_test|metadata_discovery|asset_refresh"
    "|profile_scan_placeholder|rule_scan_placeholder|source_health_check)$"
)
```

New value:
```python
_JOB_TYPE_RE = (
    "^(connection_test|metadata_discovery|asset_refresh"
    "|profile_scan|profile_scan_placeholder|rule_scan_placeholder|source_health_check)$"
)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_profiling_service.py::test_scan_job_create_accepts_profile_scan_job_type -v
```

Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add app/schemas/scan_job.py tests/test_profiling_service.py
git commit -m "feat(profiling): add profile_scan job type to ScanJobCreate schema"
```

---

## Task 4: Create Profiling Service

**Files:**
- Create: `app/services/profiling_service.py`

- [ ] **Step 1: Write unit tests for `_profile_column` stat computation**

Add to `tests/test_profiling_service.py`:

```python
from app.services.profiling_service import _profile_column


def test_profile_column_null_ratio():
    stats = _profile_column("col", [1, None, 3, None], 4)
    assert stats["null_count"] == 2
    assert stats["null_ratio"] == 0.5
    assert stats["distinct_count"] == 2
    assert stats["row_count"] == 4


def test_profile_column_all_nulls():
    stats = _profile_column("col", [None, None], 2)
    assert stats["null_ratio"] == 1.0
    assert stats["distinct_count"] == 0
    assert stats["min_value"] is None
    assert stats["avg_value"] is None


def test_profile_column_numeric_avg():
    stats = _profile_column("amount", [10, 20, 30], 3)
    assert stats["avg_value"] == 20.0
    assert stats["null_ratio"] == 0.0
    assert stats["min_value"] == "10"
    assert stats["max_value"] == "30"


def test_profile_column_top_values():
    stats = _profile_column("status", ["a", "b", "a", "a", "b"], 5)
    assert stats["top_values"]["a"] == 3
    assert stats["top_values"]["b"] == 2


def test_profile_column_distinct_ratio():
    stats = _profile_column("id", [1, 2, 3, 4], 4)
    assert stats["distinct_ratio"] == 1.0
```

- [ ] **Step 2: Run tests to see them fail**

```bash
pytest tests/test_profiling_service.py::test_profile_column_null_ratio -v
```

Expected: `FAILED` with `ImportError: cannot import name '_profile_column' from 'app.services.profiling_service'`

- [ ] **Step 3: Create `app/services/profiling_service.py`**

```python
# app/services/profiling_service.py
from __future__ import annotations

import statistics
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select

from app.connectors.config import from_orm as config_from_orm
from app.connectors.factory import get_connector
from app.db.database import AsyncSessionLocal
from app.db.models import (
    Asset, AssetSourceMeta, ColumnMetadata, ColumnProfileHistory,
    ProfilingResultPlaceholder, SnowflakeConnection, gen_uuid,
)

import logging

logger = logging.getLogger("dq_platform.profiling_service")


def _profile_column(column_name: str, values: list, total_rows: int) -> dict:
    """Compute column statistics from a list of sampled values."""
    non_null = [v for v in values if v is not None]
    null_count = total_rows - len(non_null)
    null_ratio = null_count / total_rows if total_rows > 0 else 0.0
    distinct_count = len(set(str(v) for v in non_null))
    distinct_ratio = distinct_count / total_rows if total_rows > 0 else 0.0

    min_val = max_val = avg_val = std_val = None
    if non_null:
        str_vals = [str(v) for v in non_null]
        min_val = min(str_vals)
        max_val = max(str_vals)
        try:
            nums = [float(v) for v in non_null]
            avg_val = round(sum(nums) / len(nums), 6)
            if len(nums) > 1:
                std_val = round(statistics.stdev(nums), 6)
        except (ValueError, TypeError):
            pass

    top_values = {
        str(k): v
        for k, v in Counter(str(v) for v in non_null).most_common(10)
    }

    return {
        "null_count": null_count,
        "null_ratio": round(null_ratio, 6),
        "distinct_count": distinct_count,
        "distinct_ratio": round(distinct_ratio, 6),
        "min_value": min_val,
        "max_value": max_val,
        "avg_value": avg_val,
        "std_dev": std_val,
        "top_values": top_values,
        "row_count": total_rows,
    }


def _resolve_coords(asset: Asset, meta: Optional[AssetSourceMeta]) -> Optional[tuple[str, str, str]]:
    """Return (database, schema, table) from AssetSourceMeta, or None if not resolvable."""
    if not meta:
        return None
    database = meta.sf_database_name or meta.generic_database_name
    schema = meta.sf_schema_name or meta.generic_schema_name
    table = meta.sf_table_name or meta.generic_object_name or asset.physical_name
    if not all([database, schema, table]):
        return None
    return database, schema, table


async def profile_table(
    connection_id: str,
    run_id: str,
    asset_id: str,
    database: str,
    schema: str,
    table: str,
) -> dict:
    """Profile a single table. Writes per-column results to DB. Returns summary dict."""
    async with AsyncSessionLocal() as db:
        conn_res = await db.execute(
            select(SnowflakeConnection).where(
                SnowflakeConnection.connection_id == connection_id
            )
        )
        conn_record = conn_res.scalar_one_or_none()
        if not conn_record:
            raise ValueError(f"Connection {connection_id} not found")

    config = config_from_orm(conn_record)
    connector = get_connector(config)

    rows = await connector.sample_rows(database, schema, table, limit=10000)

    if not rows:
        return {"columns_profiled": 0, "row_count": 0, "profile_score": None}

    total_rows = len(rows)
    col_names = list(rows[0].keys())
    col_values = {col: [row.get(col) for row in rows] for col in col_names}

    profile_time = datetime.now(timezone.utc).replace(tzinfo=None)
    today = profile_time.date()

    async with AsyncSessionLocal() as db:
        col_types_res = await db.execute(
            select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id)
        )
        col_type_map = {
            cm.column_name.upper(): cm.data_type
            for cm in col_types_res.scalars().all()
        }

        total_null_ratio = 0.0
        col_results: list[tuple[str, str, dict]] = []

        for col in col_names:
            stats = _profile_column(col, col_values[col], total_rows)
            data_type = col_type_map.get(col.upper(), "UNKNOWN")
            total_null_ratio += stats["null_ratio"]
            col_results.append((col, data_type, stats))

        profile_score = (
            round(1.0 - (total_null_ratio / len(col_names)), 4)
            if col_names else 0.0
        )

        for col, data_type, stats in col_results:
            existing_res = await db.execute(
                select(ProfilingResultPlaceholder).where(
                    ProfilingResultPlaceholder.run_id == run_id,
                    ProfilingResultPlaceholder.asset_id == asset_id,
                    ProfilingResultPlaceholder.column_name == col,
                )
            )
            existing = existing_res.scalar_one_or_none()
            if existing:
                for k, v in stats.items():
                    setattr(existing, k, v)
                existing.data_type = data_type
                existing.is_placeholder = False
                existing.profiled_at = profile_time
            else:
                db.add(ProfilingResultPlaceholder(
                    run_id=run_id,
                    asset_id=asset_id,
                    column_name=col,
                    data_type=data_type,
                    is_placeholder=False,
                    profiled_at=profile_time,
                    **stats,
                ))

        for col, data_type, stats in col_results:
            cm_res = await db.execute(
                select(ColumnMetadata).where(
                    ColumnMetadata.asset_id == asset_id,
                    ColumnMetadata.column_name == col,
                )
            )
            cm = cm_res.scalar_one_or_none()
            if cm:
                cm.null_count = stats["null_count"]
                cm.unique_count = stats["distinct_count"]
                cm.cardinality_pct = stats["distinct_ratio"]
                if stats["avg_value"] is not None:
                    cm.avg_value = stats["avg_value"]
                if stats["std_dev"] is not None:
                    cm.std_dev = stats["std_dev"]

        for col, data_type, stats in col_results:
            hist_res = await db.execute(
                select(ColumnProfileHistory).where(
                    ColumnProfileHistory.asset_id == asset_id,
                    ColumnProfileHistory.column_name == col,
                    ColumnProfileHistory.profile_date == today,
                )
            )
            hist = hist_res.scalar_one_or_none()
            import json
            top_str = json.dumps(stats["top_values"])
            if hist:
                hist.null_count = stats["null_count"]
                hist.unique_count = stats["distinct_count"]
                hist.row_count = total_rows
                hist.cardinality_pct = stats["distinct_ratio"]
                hist.top_values = top_str
                hist.run_id = run_id
            else:
                db.add(ColumnProfileHistory(
                    asset_id=asset_id,
                    column_name=col,
                    profile_date=today,
                    null_count=stats["null_count"],
                    unique_count=stats["distinct_count"],
                    row_count=total_rows,
                    cardinality_pct=stats["distinct_ratio"],
                    top_values=top_str,
                    run_id=run_id,
                ))

        asset_res = await db.execute(
            select(Asset).where(Asset.asset_id == asset_id)
        )
        asset = asset_res.scalar_one_or_none()
        if asset:
            asset.latest_profile_score = profile_score
            quality_status = (
                "good" if profile_score >= 0.9
                else "warning" if profile_score >= 0.7
                else "poor"
            )
            asset.latest_quality_status = quality_status

        await db.commit()

    return {
        "columns_profiled": len(col_names),
        "row_count": total_rows,
        "profile_score": profile_score,
    }


async def profile_all_assets(
    connection_id: str,
    run_id: str,
) -> dict:
    """Profile all active table/view assets for a connection. Returns run metrics."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Asset, AssetSourceMeta)
            .join(
                AssetSourceMeta,
                AssetSourceMeta.asset_id == Asset.asset_id,
                isouter=True,
            )
            .where(
                Asset.connection_id == connection_id,
                Asset.asset_type.in_(["table", "view"]),
                Asset.status == "active",
            )
        )
        rows = result.all()

    profiled = 0
    failed = 0

    for asset, meta in rows:
        coords = _resolve_coords(asset, meta)
        if coords is None:
            logger.warning("Skipping asset %s: cannot resolve db/schema/table", asset.asset_id)
            continue

        database, schema, table = coords
        try:
            await profile_table(
                connection_id=connection_id,
                run_id=run_id,
                asset_id=asset.asset_id,
                database=database,
                schema=schema,
                table=table,
            )
            profiled += 1
        except Exception as exc:
            failed += 1
            logger.error("Failed to profile %s.%s.%s: %s", database, schema, table, exc)

    return {"assets_profiled": profiled, "assets_failed": failed}
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
pytest tests/test_profiling_service.py -v -k "profile_column"
```

Expected: All 5 `test_profile_column_*` tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add app/services/profiling_service.py tests/test_profiling_service.py
git commit -m "feat(profiling): add profiling_service with _profile_column and profile_table"
```

---

## Task 5: Update Scan Orchestrator to Handle `profile_scan`

**Files:**
- Modify: `app/services/scan_orchestrator.py`

- [ ] **Step 1: Write failing test**

Add to `tests/test_profiling_service.py`:

```python
@pytest.mark.asyncio
async def test_dispatch_profile_scan_calls_profile_all_assets():
    from unittest.mock import AsyncMock, patch
    from app.services.scan_orchestrator import _dispatch_handler

    with patch("app.services.scan_orchestrator.profiling_service") as mock_ps:
        mock_ps.profile_all_assets = AsyncMock(return_value={"assets_profiled": 3, "assets_failed": 0})
        result = await _dispatch_handler("profile_scan", "job-1", "run-1", "conn-1", {})

    assert result["assets_scanned"] == 3
    assert result["errors_count"] == 0
    mock_ps.profile_all_assets.assert_called_once_with(
        connection_id="conn-1", run_id="run-1"
    )
```

- [ ] **Step 2: Run to see it fail**

```bash
pytest tests/test_profiling_service.py::test_dispatch_profile_scan_calls_profile_all_assets -v
```

Expected: `FAILED` with `ValueError: Unknown job_type: profile_scan`

- [ ] **Step 3: Add import and handler in `app/services/scan_orchestrator.py`**

At the top of the file (after existing imports), add:

```python
from app.services import profiling_service
```

- [ ] **Step 4: Add `_run_profile_scan` function in `app/services/scan_orchestrator.py`**

Add this function after `_run_placeholder` (after line 390):

```python
async def _run_profile_scan(
    connection_id: Optional[str], run_id: str, params: dict
) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for profile_scan")

    await append_log(run_id, "INFO", "Starting profile scan")
    try:
        metrics = await profiling_service.profile_all_assets(
            connection_id=connection_id,
            run_id=run_id,
        )
    except Exception as exc:
        await append_log(run_id, "ERROR", f"Profile scan failed: {str(exc)[:500]}")
        raise

    profiled = metrics.get("assets_profiled", 0)
    failed = metrics.get("assets_failed", 0)
    await append_log(
        run_id, "INFO",
        f"Profile scan complete: {profiled} profiled, {failed} failed",
    )
    return {
        "assets_scanned": profiled,
        "errors_count": failed,
        "warnings_count": 0,
        "result_summary": {
            "tables_profiled": profiled,
            "tables_failed": failed,
        },
    }
```

- [ ] **Step 5: Update `_dispatch_handler` to route `profile_scan`**

Find the existing dispatch block in `app/services/scan_orchestrator.py` (lines 239–249):

```python
    if job_type in ("profile_scan_placeholder", "rule_scan_placeholder"):
        return await _run_placeholder(job_type, run_id)
    raise ValueError(f"Unknown job_type: {job_type}")
```

Replace with:

```python
    if job_type in ("profile_scan", "profile_scan_placeholder"):
        return await _run_profile_scan(connection_id, run_id, params)
    if job_type == "rule_scan_placeholder":
        return await _run_placeholder(job_type, run_id)
    raise ValueError(f"Unknown job_type: {job_type}")
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
pytest tests/test_profiling_service.py::test_dispatch_profile_scan_calls_profile_all_assets -v
```

Expected: `PASSED`

- [ ] **Step 7: Run existing orchestrator tests to confirm no regression**

```bash
pytest tests/test_scan_orchestrator.py -v
```

Expected: All tests `PASSED`

- [ ] **Step 8: Commit**

```bash
git add app/services/scan_orchestrator.py tests/test_profiling_service.py
git commit -m "feat(profiling): wire profile_scan job type to profiling_service in orchestrator"
```

---

## Task 6: Create Profiling Results Store

**Files:**
- Create: `app/services/profiling_results_store.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_profile_results_api.py`:

```python
"""Tests for profiling results store and API endpoints."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_get_asset_profile_summary_returns_none_when_no_results():
    from app.services.profiling_results_store import get_asset_profile_summary

    db = AsyncMock()
    # Simulate empty scalar result (no run_id found)
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=scalar_result)

    result = await get_asset_profile_summary(db, "asset-1")
    assert result is None


@pytest.mark.asyncio
async def test_get_column_profiles_returns_empty_list_when_no_results():
    from app.services.profiling_results_store import get_column_profiles

    db = AsyncMock()
    scalar_result = MagicMock()
    scalar_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=scalar_result)

    result = await get_column_profiles(db, "asset-1")
    assert result == []


@pytest.mark.asyncio
async def test_get_profile_run_history_returns_empty_when_no_runs():
    from app.services.profiling_results_store import get_profile_run_history

    db = AsyncMock()
    rows_result = MagicMock()
    rows_result.all.return_value = []
    db.execute = AsyncMock(return_value=rows_result)

    result = await get_profile_run_history(db, "asset-1")
    assert result == []
```

- [ ] **Step 2: Run to see failures**

```bash
pytest tests/test_profile_results_api.py -v
```

Expected: 3 `FAILED` with `ImportError`

- [ ] **Step 3: Create `app/services/profiling_results_store.py`**

```python
# app/services/profiling_results_store.py
from __future__ import annotations

from typing import Optional

from sqlalchemy import select, desc, func

from app.db.models import Asset, ColumnProfileHistory, ProfilingResultPlaceholder, ScanJobRun


async def get_asset_profile_summary(
    db, asset_id: str, run_id: Optional[str] = None
) -> Optional[dict]:
    """Return asset-level profile summary. Uses latest run when run_id is None."""
    if run_id is None:
        run_res = await db.execute(
            select(ProfilingResultPlaceholder.run_id)
            .where(
                ProfilingResultPlaceholder.asset_id == asset_id,
                ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
            )
            .order_by(desc(ProfilingResultPlaceholder.profiled_at))
            .limit(1)
        )
        run_id = run_res.scalar_one_or_none()
        if not run_id:
            return None

    stats_res = await db.execute(
        select(
            func.count(ProfilingResultPlaceholder.column_name).label("column_count"),
            func.avg(ProfilingResultPlaceholder.null_ratio).label("avg_null_ratio"),
            func.max(ProfilingResultPlaceholder.row_count).label("row_count"),
            func.max(ProfilingResultPlaceholder.profiled_at).label("profiled_at"),
        ).where(
            ProfilingResultPlaceholder.asset_id == asset_id,
            ProfilingResultPlaceholder.run_id == run_id,
            ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
        )
    )
    row = stats_res.one()

    if row.column_count == 0:
        return None

    asset_res = await db.execute(
        select(Asset).where(Asset.asset_id == asset_id)
    )
    asset = asset_res.scalar_one_or_none()

    return {
        "asset_id": asset_id,
        "run_id": run_id,
        "column_count": row.column_count,
        "avg_null_ratio": round(float(row.avg_null_ratio or 0), 4),
        "row_count": int(row.row_count) if row.row_count else None,
        "profiled_at": row.profiled_at.isoformat() if row.profiled_at else None,
        "profile_score": (
            round(float(asset.latest_profile_score), 4)
            if asset and asset.latest_profile_score is not None
            else None
        ),
        "quality_status": asset.latest_quality_status if asset else None,
    }


async def get_column_profiles(
    db, asset_id: str, run_id: Optional[str] = None
) -> list[dict]:
    """Return per-column profile results. Uses latest run when run_id is None."""
    if run_id is None:
        run_res = await db.execute(
            select(ProfilingResultPlaceholder.run_id)
            .where(
                ProfilingResultPlaceholder.asset_id == asset_id,
                ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
            )
            .order_by(desc(ProfilingResultPlaceholder.profiled_at))
            .limit(1)
        )
        run_id = run_res.scalar_one_or_none()
        if not run_id:
            return []

    cols_res = await db.execute(
        select(ProfilingResultPlaceholder)
        .where(
            ProfilingResultPlaceholder.asset_id == asset_id,
            ProfilingResultPlaceholder.run_id == run_id,
            ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
        )
        .order_by(ProfilingResultPlaceholder.column_name)
    )
    return [_col_dict(c) for c in cols_res.scalars().all()]


async def get_profile_run_history(
    db, asset_id: str, limit: int = 20
) -> list[dict]:
    """Return list of profile runs for an asset, most recent first."""
    runs_res = await db.execute(
        select(
            ProfilingResultPlaceholder.run_id,
            func.max(ProfilingResultPlaceholder.profiled_at).label("profiled_at"),
            func.count(ProfilingResultPlaceholder.column_name).label("column_count"),
        )
        .where(
            ProfilingResultPlaceholder.asset_id == asset_id,
            ProfilingResultPlaceholder.is_placeholder == False,  # noqa: E712
        )
        .group_by(ProfilingResultPlaceholder.run_id)
        .order_by(desc(func.max(ProfilingResultPlaceholder.profiled_at)))
        .limit(limit)
    )
    rows = runs_res.all()

    result = []
    for row in rows:
        run_res = await db.execute(
            select(ScanJobRun).where(ScanJobRun.run_id == row.run_id)
        )
        run = run_res.scalar_one_or_none()
        result.append({
            "run_id": row.run_id,
            "profiled_at": row.profiled_at.isoformat() if row.profiled_at else None,
            "column_count": row.column_count,
            "status": run.status if run else "unknown",
            "trigger_type": run.trigger_type if run else None,
        })
    return result


def _col_dict(c: ProfilingResultPlaceholder) -> dict:
    return {
        "profiling_id": c.profiling_id,
        "column_name": c.column_name,
        "data_type": c.data_type,
        "null_count": c.null_count,
        "null_ratio": round(float(c.null_ratio or 0), 4),
        "distinct_count": c.distinct_count,
        "distinct_ratio": round(float(c.distinct_ratio or 0), 4),
        "min_value": c.min_value,
        "max_value": c.max_value,
        "avg_value": float(c.avg_value) if c.avg_value is not None else None,
        "std_dev": float(c.std_dev) if c.std_dev is not None else None,
        "top_values": c.top_values or {},
        "row_count": c.row_count,
        "profiled_at": c.profiled_at.isoformat() if c.profiled_at else None,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_profile_results_api.py -v
```

Expected: All 3 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add app/services/profiling_results_store.py tests/test_profile_results_api.py
git commit -m "feat(profiling): add profiling_results_store with summary, columns, and history queries"
```

---

## Task 7: Create Profile Results API

**Files:**
- Create: `app/api/profile_results.py`

- [ ] **Step 1: Write failing API tests**

Add to `tests/test_profile_results_api.py`:

```python
@pytest.mark.asyncio
async def test_get_asset_profile_summary_404_when_not_found():
    from fastapi import HTTPException
    from unittest.mock import AsyncMock, patch

    with patch("app.api.profile_results.profiling_results_store") as mock_store:
        mock_store.get_asset_profile_summary = AsyncMock(return_value=None)

        from app.api.profile_results import get_asset_profile_summary_endpoint
        with pytest.raises(HTTPException) as exc_info:
            await get_asset_profile_summary_endpoint(
                asset_id="asset-1",
                run_id=None,
                db=AsyncMock(),
                user={},
            )

        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_column_profiles_returns_list():
    from unittest.mock import AsyncMock, patch

    with patch("app.api.profile_results.profiling_results_store") as mock_store:
        mock_store.get_column_profiles = AsyncMock(return_value=[
            {"column_name": "email", "null_ratio": 0.0}
        ])

        from app.api.profile_results import get_column_profiles_endpoint
        result = await get_column_profiles_endpoint(
            asset_id="asset-1",
            run_id=None,
            db=AsyncMock(),
            user={},
        )

        assert len(result) == 1
        assert result[0]["column_name"] == "email"
```

- [ ] **Step 2: Run to see failures**

```bash
pytest tests/test_profile_results_api.py::test_get_asset_profile_summary_404_when_not_found -v
```

Expected: `FAILED` with `ImportError`

- [ ] **Step 3: Create `app/api/profile_results.py`**

```python
# app/api/profile_results.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.db.database import get_db
from app.services import profiling_results_store

router = APIRouter(prefix="/profile-results", tags=["Profile Results"])


@router.get("/assets/{asset_id}/summary")
async def get_asset_profile_summary_endpoint(
    asset_id: str,
    run_id: Optional[str] = Query(None),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    result = await profiling_results_store.get_asset_profile_summary(
        db, asset_id, run_id=run_id
    )
    if not result:
        raise HTTPException(404, "No profile results found for this asset")
    return result


@router.get("/assets/{asset_id}/columns")
async def get_column_profiles_endpoint(
    asset_id: str,
    run_id: Optional[str] = Query(None),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await profiling_results_store.get_column_profiles(
        db, asset_id, run_id=run_id
    )


@router.get("/assets/{asset_id}/history")
async def get_profile_run_history_endpoint(
    asset_id: str,
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await profiling_results_store.get_profile_run_history(
        db, asset_id, limit=limit
    )


@router.get("/runs/{run_id}/assets/{asset_id}/columns")
async def get_run_column_profiles_endpoint(
    run_id: str,
    asset_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    results = await profiling_results_store.get_column_profiles(
        db, asset_id, run_id=run_id
    )
    if not results:
        raise HTTPException(
            404, "No column profile results found for this run and asset"
        )
    return results
```

- [ ] **Step 4: Run API tests to verify they pass**

```bash
pytest tests/test_profile_results_api.py -v
```

Expected: All 5 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add app/api/profile_results.py tests/test_profile_results_api.py
git commit -m "feat(profiling): add profile_results FastAPI router with 4 endpoints"
```

---

## Task 8: Register Router in `main.py`

**Files:**
- Modify: `app/main.py`

- [ ] **Step 1: Add import and router registration**

Find the existing imports block in `app/main.py` (around line 31):

```python
    metadata,
    scan_jobs,
    ...
    scan_results,
```

Add `profile_results` to the imports block. Find where the scan_results import is and add after it:

```python
from app.api import (
    ...
    scan_results,
    profile_results,  # ADD THIS
    ...
)
```

Then find where `scan_results.router` is registered (line ~211):

```python
app.include_router(scan_results.router)
```

Add after it:

```python
app.include_router(profile_results.router)
```

- [ ] **Step 2: Verify the app starts without import error**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "from app.main import app; print('OK')"
```

Expected: `OK` with no errors

- [ ] **Step 3: Commit**

```bash
git add app/main.py
git commit -m "feat(profiling): register profile_results router in main.py"
```

---

## Task 9: Create Next.js API Proxy Routes

**Files:**
- Create: 4 Next.js route handler files

- [ ] **Step 1: Create summary proxy**

```typescript
// frontend/src/app/api/profile-results/assets/[assetId]/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: { assetId: string } }
) {
  try {
    const runId = req.nextUrl.searchParams.get('run_id')
    const url = runId
      ? `${BACKEND}/profile-results/assets/${params.assetId}/summary?run_id=${runId}`
      : `${BACKEND}/profile-results/assets/${params.assetId}/summary`
    const res = await fetch(url, { cache: 'no-store' })
    if (res.status === 404) return NextResponse.json(null, { status: 404 })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(null, { status: 500 })
  }
}
```

- [ ] **Step 2: Create columns proxy**

```typescript
// frontend/src/app/api/profile-results/assets/[assetId]/columns/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: { assetId: string } }
) {
  try {
    const runId = req.nextUrl.searchParams.get('run_id')
    const url = runId
      ? `${BACKEND}/profile-results/assets/${params.assetId}/columns?run_id=${runId}`
      : `${BACKEND}/profile-results/assets/${params.assetId}/columns`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
```

- [ ] **Step 3: Create history proxy**

```typescript
// frontend/src/app/api/profile-results/assets/[assetId]/history/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  _req: NextRequest,
  { params }: { params: { assetId: string } }
) {
  try {
    const res = await fetch(
      `${BACKEND}/profile-results/assets/${params.assetId}/history?limit=20`,
      { cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
```

- [ ] **Step 4: Create run-specific columns proxy**

```typescript
// frontend/src/app/api/profile-results/runs/[runId]/assets/[assetId]/columns/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string; assetId: string } }
) {
  try {
    const res = await fetch(
      `${BACKEND}/profile-results/runs/${params.runId}/assets/${params.assetId}/columns`,
      { cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
```

- [ ] **Step 5: Verify Next.js TypeScript compiles cleanly for the new routes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20
```

Expected: No errors in the 4 new files (any pre-existing errors are not regressions)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/profile-results/
git commit -m "feat(profiling): add Next.js proxy routes for profile-results API"
```

---

## Task 10: Create `AssetProfilingTab` Component

**Files:**
- Create: `frontend/src/components/asset-registry/AssetProfilingTab.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/asset-registry/AssetProfilingTab.tsx
'use client'
import { useState, useEffect, useCallback } from 'react'

interface ProfileSummary {
  asset_id: string
  run_id: string
  column_count: number
  avg_null_ratio: number
  row_count: number | null
  profiled_at: string | null
  profile_score: number | null
  quality_status: string | null
}

interface ColumnProfile {
  profiling_id: string
  column_name: string
  data_type: string | null
  null_count: number | null
  null_ratio: number
  distinct_count: number | null
  distinct_ratio: number
  min_value: string | null
  max_value: string | null
  avg_value: number | null
  std_dev: number | null
  top_values: Record<string, number>
  row_count: number | null
}

interface RunHistory {
  run_id: string
  profiled_at: string | null
  column_count: number
  status: string
  trigger_type: string | null
}

const SCORE_COLOR = (score: number | null) => {
  if (score === null) return 'var(--text-muted)'
  if (score >= 0.9) return '#16a34a'
  if (score >= 0.7) return '#d97706'
  return '#dc2626'
}

const NULL_BAR_COLOR = (ratio: number) => {
  if (ratio <= 0.05) return '#16a34a'
  if (ratio <= 0.2) return '#d97706'
  return '#dc2626'
}

function NullBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '6px', background: 'var(--surface-muted)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: NULL_BAR_COLOR(ratio), borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '32px' }}>{pct}%</span>
    </div>
  )
}

function TopValuesChip({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values).slice(0, 5)
  if (entries.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
      {entries.map(([val, count]) => (
        <span key={val} style={{ fontSize: '10px', padding: '1px 5px', background: 'var(--surface-muted)', borderRadius: '3px', color: 'var(--text-secondary)' }}>
          {String(val).slice(0, 20)}{String(val).length > 20 ? '…' : ''} ({count})
        </span>
      ))}
    </div>
  )
}

export default function AssetProfilingTab({
  assetId,
  connectionId,
}: {
  assetId: string
  connectionId: string | undefined
}) {
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [columns, setColumns] = useState<ColumnProfile[]>([])
  const [history, setHistory] = useState<RunHistory[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null)
  const [expandedCol, setExpandedCol] = useState<string | null>(null)

  const loadSummary = useCallback(async (runId?: string | null) => {
    setLoading(true)
    try {
      const url = runId
        ? `/api/profile-results/assets/${assetId}/summary?run_id=${runId}`
        : `/api/profile-results/assets/${assetId}/summary`
      const res = await fetch(url)
      setSummary(res.ok ? await res.json() : null)
    } finally {
      setLoading(false)
    }
  }, [assetId])

  const loadColumns = useCallback(async (runId?: string | null) => {
    setColumnsLoading(true)
    try {
      const url = runId
        ? `/api/profile-results/assets/${assetId}/columns?run_id=${runId}`
        : `/api/profile-results/assets/${assetId}/columns`
      const res = await fetch(url)
      setColumns(res.ok ? await res.json() : [])
    } finally {
      setColumnsLoading(false)
    }
  }, [assetId])

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/profile-results/assets/${assetId}/history`)
    setHistory(res.ok ? await res.json() : [])
  }, [assetId])

  useEffect(() => {
    loadSummary(null)
    loadColumns(null)
    loadHistory()
  }, [assetId, loadSummary, loadColumns, loadHistory])

  async function runProfile() {
    if (!connectionId) {
      setTriggerMsg('Cannot trigger profile: asset has no connection')
      return
    }
    setTriggering(true)
    setTriggerMsg(null)
    try {
      // Create (or find existing) profile_scan job for this connection
      const createRes = await fetch('/api/scan-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_name: `Profile Scan — ${connectionId}`,
          job_type: 'profile_scan',
          connection_id: connectionId,
          schedule_frequency: 'on_demand',
        }),
      })
      const job = await createRes.json()
      if (!job.job_id) {
        setTriggerMsg('Failed to create profile scan job')
        return
      }
      // Trigger the job
      await fetch(`/api/scan-jobs/${job.job_id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      setTriggerMsg('Profile scan queued — results will appear once the run completes')
    } catch {
      setTriggerMsg('Failed to trigger profile scan')
    } finally {
      setTriggering(false)
    }
  }

  function handleRunSelect(runId: string) {
    setSelectedRunId(runId)
    loadSummary(runId)
    loadColumns(runId)
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Loading profile…
      </div>
    )
  }

  const score = summary?.profile_score ?? null
  const statusColor = SCORE_COLOR(score)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>

      {/* Summary card */}
      {summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {[
            { label: 'Profile Score', value: score !== null ? `${Math.round(score * 100)}%` : '—', color: statusColor },
            { label: 'Columns Profiled', value: summary.column_count },
            { label: 'Rows Sampled', value: summary.row_count?.toLocaleString() ?? '—' },
            { label: 'Avg Null Ratio', value: `${Math.round(summary.avg_null_ratio * 100)}%` },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: color ?? 'var(--foreground)' }}>{String(value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '8px', padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--foreground)', marginBottom: '6px' }}>No profile data yet</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Run a profile scan to see column statistics, null ratios, and value distributions.
          </div>
          <button
            onClick={runProfile}
            disabled={triggering}
            style={{ padding: '8px 18px', borderRadius: '6px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600, opacity: triggering ? 0.6 : 1 }}
          >
            {triggering ? 'Queuing…' : 'Run First Profile'}
          </button>
          {triggerMsg && <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>{triggerMsg}</div>}
        </div>
      )}

      {summary && (
        <>
          {/* Header row: Last profiled + action */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Last profiled:{' '}
              <span style={{ color: 'var(--foreground)' }}>
                {summary.profiled_at ? new Date(summary.profiled_at).toLocaleString() : '—'}
              </span>
              {summary.quality_status && (
                <span style={{
                  marginLeft: '10px', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                  background: summary.quality_status === 'good' ? '#f0fdf4' : summary.quality_status === 'warning' ? '#fef3c7' : '#fee2e2',
                  color: summary.quality_status === 'good' ? '#16a34a' : summary.quality_status === 'warning' ? '#d97706' : '#dc2626',
                }}>
                  {summary.quality_status.toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {history.length > 1 && (
                <select
                  value={selectedRunId ?? ''}
                  onChange={e => handleRunSelect(e.target.value)}
                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}
                >
                  <option value="">Latest run</option>
                  {history.map(h => (
                    <option key={h.run_id} value={h.run_id}>
                      {h.profiled_at ? new Date(h.profiled_at).toLocaleString() : h.run_id.slice(0, 8)}
                      {' '}({h.status})
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={runProfile}
                disabled={triggering}
                style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', opacity: triggering ? 0.6 : 1 }}
              >
                {triggering ? 'Queuing…' : 'Run Profile'}
              </button>
            </div>
          </div>

          {triggerMsg && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 8px', background: 'var(--surface-muted)', borderRadius: '4px' }}>
              {triggerMsg}
            </div>
          )}

          {/* Column profile table */}
          {columnsLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading columns…</div>
          ) : columns.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No column profiles found for this run.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                    {['Column', 'Type', 'Null %', 'Distinct', 'Min', 'Max', 'Top Values'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <>
                      <tr
                        key={col.column_name}
                        onClick={() => setExpandedCol(expandedCol === col.column_name ? null : col.column_name)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)', transition: 'background 0.1s' }}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--foreground)' }}>{col.column_name}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10px' }}>{col.data_type ?? '—'}</td>
                        <td style={{ padding: '8px 10px', minWidth: '100px' }}><NullBar ratio={col.null_ratio} /></td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{col.distinct_count?.toLocaleString() ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '10px', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.min_value ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '10px', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.max_value ?? '—'}</td>
                        <td style={{ padding: '8px 10px' }}><TopValuesChip values={col.top_values} /></td>
                      </tr>
                      {expandedCol === col.column_name && (
                        <tr key={`${col.column_name}-detail`} style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={7} style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 16px', fontSize: '11px' }}>
                              {[
                                ['Null Count', col.null_count?.toLocaleString()],
                                ['Distinct Count', col.distinct_count?.toLocaleString()],
                                ['Distinct Ratio', col.distinct_ratio !== undefined ? `${Math.round(col.distinct_ratio * 100)}%` : '—'],
                                ['Rows Sampled', col.row_count?.toLocaleString()],
                                ['Avg Value', col.avg_value !== null ? col.avg_value?.toFixed(4) : '—'],
                                ['Std Dev', col.std_dev !== null ? col.std_dev?.toFixed(4) : '—'],
                              ].map(([label, val]) => (
                                <div key={label}>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                                  <div style={{ color: 'var(--foreground)', marginTop: '2px' }}>{val ?? '—'}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | grep "AssetProfilingTab" | head -10
```

Expected: No errors mentioning `AssetProfilingTab`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/asset-registry/AssetProfilingTab.tsx
git commit -m "feat(profiling): add AssetProfilingTab component with column stats table and trigger flow"
```

---

## Task 11: Add Profiling Tab to `AssetDetailPanel`

**Files:**
- Modify: `frontend/src/components/asset-registry/AssetDetailPanel.tsx`

- [ ] **Step 1: Read current file**

```bash
cat /Users/laxmansrigiri/git_repo/DataGuard/frontend/src/components/asset-registry/AssetDetailPanel.tsx
```

(Already read above — confirmed the file is 141 lines with no tabs)

- [ ] **Step 2: Apply the tab changes**

Replace the entire file content with the tabbed version:

```tsx
// frontend/src/components/asset-registry/AssetDetailPanel.tsx
'use client'
import { useState } from 'react'
import AssetDescriptionField from './AssetDescriptionField'
import AssetColumnsSection from './AssetColumnsSection'
import AssetProfilingTab from './AssetProfilingTab'

interface AssetMeta {
  sf_table_name?: string
  sf_schema_name?: string
  sf_database_name?: string
  row_count?: number
  bytes?: number
}

interface Asset {
  asset_id: string
  asset_type: string
  display_name?: string
  physical_name?: string
  qualified_name?: string
  description?: string
  status: string
  criticality: string
  sensitivity?: string
  owner_user_id?: string
  owner_team_id?: string
  steward_user_id?: string
  domain?: string
  discovered_at?: string
  last_seen_at?: string
  connection_id?: string
  connection_name?: string
  source_meta?: AssetMeta
}

type Tab = 'overview' | 'profiling'

const TYPE_COLOR: Record<string, string> = {
  source: '#7c3aed', database: '#1d4ed8', schema: '#0369a1', table: '#065f46', view: '#0d9488',
  column: '#9a3412', file: '#92400e', dataset: '#374151', logical_dataset: '#4b5563',
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  active:      { background: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)' },
  missing:     { background: 'var(--status-warn-bg)',     color: 'var(--status-warn-text)' },
  deprecated:  { background: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
  scan_failed: { background: 'var(--status-error-bg)',   color: 'var(--status-error-text)' },
  disabled:    { background: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-sm)', color: value != null ? 'var(--foreground)' : 'var(--text-muted)' }}>
        {value != null ? String(value) : '—'}
      </div>
    </div>
  )
}

export default function AssetDetailPanel({
  asset,
  onDescriptionSaved,
}: {
  asset: Asset | null
  onDescriptionSaved: (desc: string) => void
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  if (!asset) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Select an asset from the tree
      </div>
    )
  }

  const label = asset.display_name || asset.physical_name || asset.asset_id
  const typeBg = TYPE_COLOR[asset.asset_type] ?? '#64748b'
  const statusStyle = STATUS_STYLE[asset.status] ?? STATUS_STYLE.disabled
  const isLeaf = asset.asset_type === 'table' || asset.asset_type === 'view'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Asset header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ background: typeBg, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {asset.asset_type}
        </span>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--foreground)' }}>{label}</span>
        <span style={{ ...statusStyle, fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginLeft: 'auto' }}>
          {asset.status}
        </span>
      </div>

      {/* Tab bar — only show for tables/views */}
      {isLeaf && (
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--border)' }}>
          {(['overview', 'profiling'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? 'var(--foreground)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer',
                textTransform: 'capitalize',
                marginBottom: '-1px',
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Overview tab content — non-leaf assets always show overview, leaf assets only when tab is 'overview' */}
      {(!isLeaf || activeTab === 'overview') && (
        <>
          {isLeaf ? (
            <>
              <AssetDescriptionField
                assetId={asset.asset_id}
                description={asset.description ?? null}
                inheritedFrom={null}
                onSave={onDescriptionSaved}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px' }}>
                <Field label="Criticality" value={asset.criticality} />
                <Field label="Sensitivity" value={asset.sensitivity} />
                <Field label="Domain" value={asset.domain} />
                <Field label="Owner" value={asset.owner_user_id} />
                <Field label="Team" value={asset.owner_team_id} />
                <Field label="Steward" value={asset.steward_user_id} />
                <Field label="Discovered" value={asset.discovered_at ? new Date(asset.discovered_at).toLocaleDateString() : null} />
                <Field label="Last Seen" value={asset.last_seen_at ? new Date(asset.last_seen_at).toLocaleDateString() : null} />
                <Field label="Connection" value={asset.connection_name} />
              </div>
            </>
          ) : null}

          {asset.source_meta && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <Field label="Database" value={asset.source_meta.sf_database_name} />
              <Field label="Schema" value={asset.source_meta.sf_schema_name} />
              <Field label="Table" value={asset.source_meta.sf_table_name} />
              {asset.source_meta.row_count != null && (
                <Field label="Rows" value={asset.source_meta.row_count.toLocaleString()} />
              )}
            </div>
          )}

          {(asset.asset_type === 'table' || asset.asset_type === 'view') && (
            <AssetColumnsSection
              assetId={asset.asset_id}
              connectionId={asset.connection_id}
              sourceMeta={asset.source_meta}
            />
          )}

          {isLeaf && (
            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <a href={`/rules?asset_id=${asset.asset_id}`}
                style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--border)', color: 'var(--text-secondary)', textDecoration: 'none', background: 'var(--surface)' }}>
                Run Rules
              </a>
            </div>
          )}
        </>
      )}

      {/* Profiling tab content */}
      {isLeaf && activeTab === 'profiling' && (
        <AssetProfilingTab
          assetId={asset.asset_id}
          connectionId={asset.connection_id}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | grep "AssetDetailPanel\|AssetProfilingTab" | head -10
```

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/asset-registry/AssetDetailPanel.tsx
git commit -m "feat(profiling): add Profiling tab to AssetDetailPanel for table/view assets"
```

---

## Task 12: Final Tests and Regression Run

**Files:**
- No new files

- [ ] **Step 1: Run all profiling tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
pytest tests/test_profiling_service.py tests/test_profile_results_api.py -v
```

Expected: All tests `PASSED`

- [ ] **Step 2: Run full test suite to check for regressions**

```bash
pytest tests/ -v --tb=short
```

Expected: All existing tests `PASSED`; no failures introduced

- [ ] **Step 3: Verify all backend imports resolve**

```bash
python -c "
from app.services.profiling_service import profile_table, profile_all_assets
from app.services.profiling_results_store import get_asset_profile_summary, get_column_profiles, get_profile_run_history
from app.api.profile_results import router
print('All imports OK')
"
```

Expected: `All imports OK`

- [ ] **Step 4: TypeScript full compile check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | grep -v "^$" | head -20
```

Expected: Any errors shown are pre-existing (not introduced by this plan)

- [ ] **Step 5: Final commit**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
git add -A
git commit -m "feat(profiling): Phase 2 Module 1 — Profiling Engine + UI complete"
```

---

## Regression Checklist

After implementation, verify the following existing pages still work:

| Page / Feature | What to Check |
|---|---|
| `/asset-registry` | Assets still load; tree still renders; clicking a non-table asset shows Overview without tabs |
| `/asset-registry` → select a table | Overview tab shows all existing fields; Profiling tab appears; switching tabs doesn't break layout |
| `/scan-jobs` | `profile_scan_placeholder` jobs still listed; `profile_scan` new job type creates successfully |
| `/scan-jobs/{job_id}/trigger` | Still triggers normally; `profile_scan_placeholder` jobs now run real profiling (not placeholder) |
| `/scan-results/runs/{run_id}` | Existing scan results still return correctly |
| `/scan-results/assets/{asset_id}/latest` | Still returns correctly |
| `/rules` | Rule engine unaffected |
| `/dashboard` | Dashboard metrics unaffected |
| All existing tests | `pytest tests/ -v` — 100% green |

---

## Final Screens That Should Appear

### 1. Asset Detail — Overview Tab (unchanged from Phase 1)
```
[TABLE] orders                                    [active]

[Overview] [Profiling]          ← NEW tab bar

Description: ...
Criticality: high   Sensitivity: pii   Domain: finance
Owner: alice@co     Team: data-eng     Steward: bob@co
Discovered: Jun 1   Last Seen: Jun 11  Connection: prod-sf

Schema / Columns (existing section)
[Run Rules]
```

### 2. Asset Detail — Profiling Tab (empty state)
```
[TABLE] orders                                    [active]

[Overview] [Profiling]

┌──────────────────────────────────────────────────┐
│  No profile data yet                             │
│  Run a profile scan to see column statistics,    │
│  null ratios, and value distributions.           │
│                                                  │
│          [Run First Profile]                     │
└──────────────────────────────────────────────────┘
```

### 3. Asset Detail — Profiling Tab (with data)
```
[TABLE] orders                                    [active]

[Overview] [Profiling]

╔══════════╦══════════════════╦══════════════╦═══════════╗
║ Profile  ║ Columns Profiled ║ Rows Sampled ║ Avg Null  ║
║   Score  ║                  ║              ║   Ratio   ║
║    94%   ║       12         ║  10,000      ║     2%    ║
╚══════════╩══════════════════╩══════════════╩═══════════╝

Last profiled: Jun 11, 2026 14:30:22   GOOD     [Run Profile ▸]  [History ▼]

┌─ Column ─────────┬─ Type ──┬─ Null % ──────────┬─ Distinct ┬─ Min ──┬─ Max ──┬─ Top Values ────────────────┐
│ customer_id      │ NUMBER  │ ████░░░░░  0%      │ 10,000    │ 1001   │ 99999  │ (all unique)                │
│ status           │ VARCHAR │ ░░░░░░░░░  0%      │ 4         │ active │ void   │ active(4200) pending(3100)  │
│ amount           │ FLOAT   │ ██░░░░░░░  4%      │ 8,742     │ 0.01   │ 9999.0 │ 0.0(42)                     │
│ email            │ VARCHAR │ ████████░ 18%      │ 7,623     │ a@b.c  │ z@z.zz │ null(1800)                  │
│ created_at       │ DATE    │ ░░░░░░░░░  0%      │ 365       │ 2025.. │ 2026.. │ 2026-01-01(128)             │
└──────────────────┴─────────┴────────────────────┴───────────┴────────┴────────┴─────────────────────────────┘

  ↕ Click any row to expand: Null Count / Distinct Count / Distinct Ratio / Rows Sampled / Avg / Std Dev
```
