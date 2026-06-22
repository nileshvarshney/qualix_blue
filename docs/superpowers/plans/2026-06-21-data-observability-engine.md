# Data Observability Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a continuous, per-connection observability engine that detects freshness breaches, volume anomalies, schema drift, and distribution shifts independently of scheduled rules, firing alerts/issues immediately — and make the existing (currently non-functional) "Continuous Monitoring" frontend panel actually persist and drive it.

**Architecture:** One new APScheduler job (`observability_tick`, every 5 minutes) reads `ContinuousMonitoringConfig` rows; for each enabled connection whose configured interval has elapsed, it runs four independent checks across that connection's active assets and persists findings as `DQAlert` + `Issue` records via the existing alert/notification pipeline. Schema drift reuses the existing `schema_drift_service` (which already self-alerts); the standalone nightly schema-drift job is removed since it's now folded into the continuous tick.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy 2.0 (async) / APScheduler / pytest + pytest-asyncio / httpx (API tests) / Next.js + TypeScript (frontend panel).

## Global Constraints

- No Alembic migrations — new tables are added as SQLAlchemy models in `app/db/models.py` and auto-created by `create_tables()` at startup (idempotent `Base.metadata.sorted_tables` creation). No migration step needed.
- Follow existing model style exactly: `Mapped[...]`/`mapped_column`, `gen_uuid()` for string PKs, `now()`/`datetime.now(timezone.utc).replace(tzinfo=None)` for naive-UTC timestamps (this codebase stores naive UTC datetimes throughout — never use timezone-aware `datetime.now(timezone.utc)` directly in a DB column).
- Test run command: `PYTHONPATH=. pytest tests/ -v` (or scoped to a single file/test as shown per task).
- Async DB tests use `AsyncMock`/`MagicMock` against `db.execute`/`db.add`/`db.commit` — no real database in unit tests (matches `tests/test_monitoring_service.py`, `tests/test_schema_drift_service.py`).
- API tests use `httpx.AsyncClient(transport=ASGITransport(app=app))` with `app.dependency_overrides[get_db]` / `app.dependency_overrides[get_current_user]` (matches `tests/test_api_schema_drift.py`).
- Alert dedup window: 4 hours (matches `app/services/alert_service.DEDUP_WINDOW_HOURS`).
- Severity thresholds (approved in design spec, `docs/superpowers/specs/2026-06-21-data-observability-engine-design.md`): volume drop ≥50%/≥30%/≥15% → critical/high/medium; distribution mean shift ≥0.5×/≥0.25× baseline std dev → high/medium; freshness >24h/>48h → high/critical.
- Frontend field names must exactly match the existing contract in `frontend/src/app/observability/page.tsx`: `connection_id`, `name`, `interval_minutes`, `freshness_enabled`, `volume_enabled`, `next_check_at`, plus the new `is_enabled`, `schema_drift_enabled`, `distribution_enabled`.

---

### Task 1: New DB models — `ContinuousMonitoringConfig`, `VolumeBaseline`, `DistributionBaseline`

**Files:**
- Modify: `app/db/models.py` (insert after the `AssetMonitoringMetric` class, currently ending around line 921)
- Test: `tests/test_observability_models.py` (new)

**Interfaces:**
- Produces: `ContinuousMonitoringConfig` (fields: `config_id, connection_id, interval_minutes, is_enabled, freshness_enabled, volume_enabled, schema_drift_enabled, distribution_enabled, last_run_at, created_at, updated_at`), `VolumeBaseline` (fields: `asset_id, readings, updated_at`), `DistributionBaseline` (fields: `baseline_id, asset_id, column_name, baseline_min, baseline_max, baseline_avg, baseline_std_dev, established_at`). All later tasks import these from `app.db.models`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_observability_models.py`:

```python
from __future__ import annotations


def test_continuous_monitoring_config_columns():
    from app.db.models import ContinuousMonitoringConfig
    cols = set(ContinuousMonitoringConfig.__table__.columns.keys())
    assert cols == {
        "config_id", "connection_id", "interval_minutes", "is_enabled",
        "freshness_enabled", "volume_enabled", "schema_drift_enabled",
        "distribution_enabled", "last_run_at", "created_at", "updated_at",
    }
    assert ContinuousMonitoringConfig.__tablename__ == "continuous_monitoring_configs"


def test_volume_baseline_columns():
    from app.db.models import VolumeBaseline
    cols = set(VolumeBaseline.__table__.columns.keys())
    assert cols == {"asset_id", "readings", "updated_at"}
    assert VolumeBaseline.__tablename__ == "volume_baselines"


def test_distribution_baseline_columns():
    from app.db.models import DistributionBaseline
    cols = set(DistributionBaseline.__table__.columns.keys())
    assert cols == {
        "baseline_id", "asset_id", "column_name",
        "baseline_min", "baseline_max", "baseline_avg", "baseline_std_dev",
        "established_at",
    }
    assert DistributionBaseline.__tablename__ == "distribution_baselines"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. pytest tests/test_observability_models.py -v`
Expected: FAIL with `ImportError: cannot import name 'ContinuousMonitoringConfig'`

- [ ] **Step 3: Write minimal implementation**

In `app/db/models.py`, insert immediately after the `AssetMonitoringMetric` class definition:

```python
class ContinuousMonitoringConfig(Base):
    __tablename__ = "continuous_monitoring_configs"

    config_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    connection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("snowflake_connections.connection_id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    interval_minutes: Mapped[int] = mapped_column(Integer, default=15)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    freshness_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    volume_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    schema_drift_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    distribution_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class VolumeBaseline(Base):
    __tablename__ = "volume_baselines"

    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), primary_key=True
    )
    readings: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class DistributionBaseline(Base):
    __tablename__ = "distribution_baselines"
    __table_args__ = (
        UniqueConstraint("asset_id", "column_name", name="uq_dist_baseline_asset_col"),
    )

    baseline_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False)
    column_name: Mapped[str] = mapped_column(String(255), nullable=False)
    baseline_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baseline_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baseline_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    baseline_std_dev: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    established_at: Mapped[datetime] = mapped_column(DateTime, default=now)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. pytest tests/test_observability_models.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py tests/test_observability_models.py
git commit -m "feat(observability): add ContinuousMonitoringConfig, VolumeBaseline, DistributionBaseline models"
```

---

### Task 2: `observability_engine.py` — freshness, volume, distribution checks

**Files:**
- Create: `app/services/observability_engine.py`
- Test: `tests/test_observability_engine.py` (new)

**Interfaces:**
- Consumes: `ContinuousMonitoringConfig`, `VolumeBaseline`, `DistributionBaseline` (Task 1); `Asset`, `ColumnMetadata` (existing).
- Produces: `check_freshness(asset, last_modified_at, now_dt, max_hours=24.0) -> Optional[dict]`, `async check_volume(asset, current_row_count, db) -> Optional[dict]`, `async check_distribution(asset, db) -> list[dict]`. Each finding dict has keys `alert_type`, `severity`, `message`, and optionally `column_name`. Task 3/4 consume these exact dict shapes and function names.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_observability_engine.py`:

```python
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone, timedelta


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── check_freshness (pure function) ──────────────────────────────────────────

def test_check_freshness_within_threshold_no_finding():
    from app.services.observability_engine import check_freshness
    asset = MagicMock()
    now_dt = _utcnow()
    last_modified = now_dt - timedelta(hours=5)
    assert check_freshness(asset, last_modified, now_dt) is None


def test_check_freshness_breach_high():
    from app.services.observability_engine import check_freshness
    asset = MagicMock()
    now_dt = _utcnow()
    last_modified = now_dt - timedelta(hours=30)
    finding = check_freshness(asset, last_modified, now_dt)
    assert finding["alert_type"] == "freshness_breach"
    assert finding["severity"] == "high"


def test_check_freshness_breach_critical():
    from app.services.observability_engine import check_freshness
    asset = MagicMock()
    now_dt = _utcnow()
    last_modified = now_dt - timedelta(hours=50)
    finding = check_freshness(asset, last_modified, now_dt)
    assert finding["severity"] == "critical"


def test_check_freshness_no_data_no_finding():
    from app.services.observability_engine import check_freshness
    asset = MagicMock()
    assert check_freshness(asset, None, _utcnow()) is None


# ─── check_volume ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_volume_cold_start_no_finding():
    from app.services.observability_engine import check_volume
    asset = MagicMock(asset_id="asset-1")
    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = None  # no existing baseline
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    finding = await check_volume(asset, 1000, mock_db)
    assert finding is None
    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.readings == [1000]


@pytest.mark.asyncio
async def test_check_volume_drop_triggers_critical():
    from app.services.observability_engine import check_volume
    asset = MagicMock(asset_id="asset-1")
    baseline = MagicMock()
    baseline.readings = [1000, 1000, 1000]
    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = baseline
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    finding = await check_volume(asset, 400, mock_db)  # 60% drop
    assert finding["alert_type"] == "volume_shift"
    assert finding["severity"] == "critical"
    assert baseline.readings == [1000, 1000, 400]


@pytest.mark.asyncio
async def test_check_volume_within_threshold_no_finding():
    from app.services.observability_engine import check_volume
    asset = MagicMock(asset_id="asset-1")
    baseline = MagicMock()
    baseline.readings = [1000, 1000]
    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = baseline
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    finding = await check_volume(asset, 950, mock_db)  # 5% drop
    assert finding is None


# ─── check_distribution ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_distribution_establishes_baseline_no_finding():
    from app.services.observability_engine import check_distribution
    asset = MagicMock(asset_id="asset-1")
    col = MagicMock()
    col.column_name = "amount"
    col.data_type = "NUMBER"
    col.avg_value = 100.0
    col.std_dev = 10.0
    col.min_value = "0"
    col.max_value = "500"

    call_no = [0]

    async def execute(stmt, *a, **kw):
        call_no[0] += 1
        r = MagicMock()
        if call_no[0] == 1:
            r.scalars.return_value.all.return_value = [col]
        else:
            r.scalar_one_or_none.return_value = None  # no baseline yet
        return r

    mock_db = AsyncMock()
    mock_db.execute = execute
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    findings = await check_distribution(asset, mock_db)
    assert findings == []
    mock_db.add.assert_called_once()


@pytest.mark.asyncio
async def test_check_distribution_shift_triggers_high():
    from app.services.observability_engine import check_distribution
    asset = MagicMock(asset_id="asset-1")
    col = MagicMock()
    col.column_name = "amount"
    col.data_type = "NUMBER"
    col.avg_value = 200.0
    col.std_dev = 10.0
    col.min_value = "0"
    col.max_value = "500"

    baseline = MagicMock()
    baseline.baseline_avg = 100.0
    baseline.baseline_std_dev = 10.0

    call_no = [0]

    async def execute(stmt, *a, **kw):
        call_no[0] += 1
        r = MagicMock()
        if call_no[0] == 1:
            r.scalars.return_value.all.return_value = [col]
        else:
            r.scalar_one_or_none.return_value = baseline
        return r

    mock_db = AsyncMock()
    mock_db.execute = execute
    mock_db.commit = AsyncMock()

    findings = await check_distribution(asset, mock_db)
    assert len(findings) == 1
    assert findings[0]["alert_type"] == "distribution_shift"
    assert findings[0]["severity"] == "high"
    assert findings[0]["column_name"] == "amount"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. pytest tests/test_observability_engine.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.observability_engine'`

- [ ] **Step 3: Write minimal implementation**

Create `app/services/observability_engine.py`:

```python
# app/services/observability_engine.py
from __future__ import annotations

import re
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Asset, ColumnMetadata, VolumeBaseline, DistributionBaseline

logger = logging.getLogger("dq_platform.observability_engine")

_NUMERIC_TYPE_RE = re.compile(r"NUMBER|INT|FLOAT|DECIMAL|DOUBLE|REAL|NUMERIC", re.IGNORECASE)

MAX_VOLUME_READINGS = 7
DEFAULT_FRESHNESS_MAX_HOURS = 24.0


def _to_float(value) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def check_freshness(
    asset: Asset,
    last_modified_at: Optional[datetime],
    now_dt: datetime,
    max_hours: float = DEFAULT_FRESHNESS_MAX_HOURS,
) -> Optional[dict]:
    """Pure function — no DB access. Returns a finding dict or None."""
    if last_modified_at is None:
        return None
    hours = (now_dt - last_modified_at).total_seconds() / 3600
    if hours <= max_hours:
        return None
    severity = "critical" if hours >= max_hours * 2 else "high"
    return {
        "alert_type": "freshness_breach",
        "severity": severity,
        "message": (
            f"Asset not refreshed for {hours:.1f}h (max allowed: {max_hours:.0f}h)"
        ),
    }


async def check_volume(asset: Asset, current_row_count: Optional[int], db: AsyncSession) -> Optional[dict]:
    """Reads/writes VolumeBaseline.readings (rolling window of last 7 samples)."""
    if current_row_count is None:
        return None

    result = await db.execute(
        select(VolumeBaseline).where(VolumeBaseline.asset_id == asset.asset_id)
    )
    baseline = result.scalar_one_or_none()
    prior_readings = list(baseline.readings) if baseline and baseline.readings else []

    finding = None
    if len(prior_readings) >= 2:
        prior_avg = sum(prior_readings) / len(prior_readings)
        if prior_avg > 0:
            drop_pct = (prior_avg - current_row_count) / prior_avg
            severity = None
            if drop_pct >= 0.50:
                severity = "critical"
            elif drop_pct >= 0.30:
                severity = "high"
            elif drop_pct >= 0.15:
                severity = "medium"
            if severity:
                finding = {
                    "alert_type": "volume_shift",
                    "severity": severity,
                    "message": (
                        f"Row count dropped {drop_pct * 100:.0f}% "
                        f"(was ~{prior_avg:.0f}, now {current_row_count})"
                    ),
                }

    new_readings = (prior_readings + [current_row_count])[-MAX_VOLUME_READINGS:]
    if baseline:
        baseline.readings = new_readings
        baseline.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        baseline = VolumeBaseline(
            asset_id=asset.asset_id,
            readings=new_readings,
            updated_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
        db.add(baseline)
    await db.commit()
    return finding


async def check_distribution(asset: Asset, db: AsyncSession) -> list[dict]:
    """Compares current numeric ColumnMetadata stats to DistributionBaseline."""
    result = await db.execute(
        select(ColumnMetadata).where(
            ColumnMetadata.asset_id == asset.asset_id,
            ColumnMetadata.avg_value.isnot(None),
            ColumnMetadata.std_dev.isnot(None),
        )
    )
    columns = result.scalars().all()
    findings: list[dict] = []

    for col in columns:
        if not col.data_type or not _NUMERIC_TYPE_RE.search(col.data_type):
            continue

        baseline_result = await db.execute(
            select(DistributionBaseline).where(
                DistributionBaseline.asset_id == asset.asset_id,
                DistributionBaseline.column_name == col.column_name,
            )
        )
        baseline = baseline_result.scalar_one_or_none()

        if baseline is None:
            db.add(DistributionBaseline(
                asset_id=asset.asset_id,
                column_name=col.column_name,
                baseline_min=_to_float(col.min_value),
                baseline_max=_to_float(col.max_value),
                baseline_avg=col.avg_value,
                baseline_std_dev=col.std_dev,
            ))
            continue

        if not baseline.baseline_std_dev:
            continue

        shift = abs(col.avg_value - baseline.baseline_avg)
        ratio = shift / baseline.baseline_std_dev
        if ratio >= 0.5:
            severity = "high"
        elif ratio >= 0.25:
            severity = "medium"
        else:
            continue

        findings.append({
            "alert_type": "distribution_shift",
            "severity": severity,
            "message": (
                f"Column '{col.column_name}' mean shifted from "
                f"{baseline.baseline_avg:.2f} to {col.avg_value:.2f} "
                f"({ratio:.1f}x baseline std dev)"
            ),
            "column_name": col.column_name,
        })

    await db.commit()
    return findings
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. pytest tests/test_observability_engine.py -v`
Expected: PASS (8 passed)

- [ ] **Step 5: Commit**

```bash
git add app/services/observability_engine.py tests/test_observability_engine.py
git commit -m "feat(observability): add freshness/volume/distribution detection checks"
```

---

### Task 3: `observability_engine.py` — schema drift wrapper + alert/issue creation

**Files:**
- Modify: `app/services/observability_engine.py` (append)
- Modify: `tests/test_observability_engine.py` (append)

**Interfaces:**
- Consumes: `schema_drift_service.get_active_baseline/initialize_baseline/detect_drift` (existing, unchanged); `DQAlert`, `Issue`, `notification_service.dispatch_alert` (existing).
- Produces: `async check_schema_drift(asset, db) -> list[dict]` (same finding-dict shape as Task 2's checks, plus `column_name`); `async create_observability_alert(asset, finding, db) -> None` (creates `DQAlert` + dispatches notification + creates `Issue`, with 4h dedup); `async create_observability_issue(asset, finding, db) -> None` (creates only an `Issue`, dedup on open issue with the same title — used for schema drift, since `detect_drift()` already creates its own `DQAlert`). Task 4 calls all three.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_observability_engine.py`:

```python
# ─── check_schema_drift ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_schema_drift_no_baseline_initializes_no_finding():
    from app.services.observability_engine import check_schema_drift
    asset = MagicMock(asset_id="asset-1")

    with patch("app.services.schema_drift_service.get_active_baseline", new=AsyncMock(return_value=None)), \
         patch("app.services.schema_drift_service.initialize_baseline", new=AsyncMock()) as mock_init:
        mock_db = AsyncMock()
        findings = await check_schema_drift(asset, mock_db)
        assert findings == []
        mock_init.assert_called_once_with("asset-1", mock_db)


@pytest.mark.asyncio
async def test_check_schema_drift_with_events_returns_findings():
    from app.services.observability_engine import check_schema_drift
    asset = MagicMock(asset_id="asset-1")
    baseline = MagicMock()
    event = MagicMock(change_type="column_deleted", column_name="legacy_col")

    with patch("app.services.schema_drift_service.get_active_baseline", new=AsyncMock(return_value=baseline)), \
         patch("app.services.schema_drift_service.detect_drift", new=AsyncMock(return_value=[event])):
        mock_db = AsyncMock()
        findings = await check_schema_drift(asset, mock_db)
        assert len(findings) == 1
        assert findings[0]["alert_type"] == "schema_drift"
        assert findings[0]["severity"] == "high"
        assert findings[0]["column_name"] == "legacy_col"


# ─── create_observability_alert ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_observability_alert_dedup_skips_when_open_alert_exists():
    from app.services.observability_engine import create_observability_alert
    asset = MagicMock(asset_id="asset-1", domain_id="dom-1", subdomain_id="sub-1")
    finding = {"alert_type": "volume_shift", "severity": "high", "message": "dropped"}

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = MagicMock()  # an open alert already exists
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.add = MagicMock()

    await create_observability_alert(asset, finding, mock_db)
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_create_observability_alert_creates_alert_and_issue():
    from app.services.observability_engine import create_observability_alert
    asset = MagicMock(asset_id="asset-1", domain_id="dom-1", subdomain_id="sub-1", sf_table_name="orders")

    call_no = [0]

    async def execute(stmt, *a, **kw):
        call_no[0] += 1
        r = MagicMock()
        r.scalar_one_or_none.return_value = None  # no existing open alert, no existing open issue
        return r

    mock_db = AsyncMock()
    mock_db.execute = execute
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    finding = {"alert_type": "volume_shift", "severity": "high", "message": "dropped 40%"}

    with patch("asyncio.create_task") as mock_task:
        await create_observability_alert(asset, finding, mock_db)

    assert mock_db.add.call_count == 2  # DQAlert + Issue
    added_types = {type(c.args[0]).__name__ for c in mock_db.add.call_args_list}
    assert added_types == {"DQAlert", "Issue"}
    mock_task.assert_called_once()


# ─── create_observability_issue ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_observability_issue_dedup_skips_when_open_issue_exists():
    from app.services.observability_engine import create_observability_issue
    asset = MagicMock(asset_id="asset-1", domain_id="dom-1", subdomain_id="sub-1", sf_table_name="orders")
    finding = {"alert_type": "schema_drift", "severity": "high", "message": "col dropped"}

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalar_one_or_none.return_value = MagicMock()  # open issue already exists
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.add = MagicMock()

    await create_observability_issue(asset, finding, mock_db)
    mock_db.add.assert_not_called()
```

Add `from unittest.mock import patch` to the existing `from unittest.mock import AsyncMock, MagicMock` import line at the top of `tests/test_observability_engine.py`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. pytest tests/test_observability_engine.py -v`
Expected: FAIL — `ImportError: cannot import name 'check_schema_drift'`

- [ ] **Step 3: Write minimal implementation**

Append to `app/services/observability_engine.py`:

```python
import asyncio
import uuid
from datetime import timedelta

from app.db.models import DQAlert, Issue

DEDUP_WINDOW_HOURS = 4


async def check_schema_drift(asset: Asset, db: AsyncSession) -> list[dict]:
    """Thin wrapper around schema_drift_service. Establishes the baseline on first
    sighting (no finding); thereafter returns one finding per open drift event.
    Note: detect_drift() already creates its own DQAlert — callers must route
    schema_drift findings through create_observability_issue(), not
    create_observability_alert(), to avoid double-alerting."""
    from app.services import schema_drift_service

    baseline = await schema_drift_service.get_active_baseline(asset.asset_id, db)
    if baseline is None:
        await schema_drift_service.initialize_baseline(asset.asset_id, db)
        return []

    events = await schema_drift_service.detect_drift(asset.asset_id, db)
    high_types = {"column_deleted", "type_changed"}
    return [
        {
            "alert_type": "schema_drift",
            "severity": "high" if ev.change_type in high_types else "medium",
            "message": f"Schema drift: {ev.change_type} on column '{ev.column_name}'",
            "column_name": ev.column_name,
        }
        for ev in events
    ]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def create_observability_issue(asset: Asset, finding: dict, db: AsyncSession) -> None:
    """Creates an Issue for a finding, deduped on an open issue with the same title."""
    label = finding["alert_type"]
    title = f"[Observability] {label} on {asset.sf_table_name or asset.asset_id}"

    existing = await db.execute(
        select(Issue).where(
            Issue.asset_id == asset.asset_id,
            Issue.title == title,
            Issue.status.not_in(["closed", "resolved"]),
        )
    )
    if existing.scalar_one_or_none():
        logger.debug("Observability issue dedup: open issue exists for %s", title)
        return

    issue = Issue(
        issue_id=str(uuid.uuid4()),
        title=title,
        description=finding["message"],
        issue_type="data_quality",
        status="new",
        severity=finding["severity"],
        domain_id=asset.domain_id,
        subdomain_id=asset.subdomain_id,
        asset_id=asset.asset_id,
        created_by="system",
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(issue)
    await db.commit()
    logger.info("Observability issue created: %s", title)


async def create_observability_alert(asset: Asset, finding: dict, db: AsyncSession) -> None:
    """Creates a DQAlert + dispatches notification + creates an Issue, deduped
    4h per (asset_id, alert_type). Use for freshness/volume/distribution findings
    only — schema_drift findings already get their own alert from
    schema_drift_service.detect_drift() and should use create_observability_issue()."""
    window_start = _utcnow() - timedelta(hours=DEDUP_WINDOW_HOURS)
    existing = await db.execute(
        select(DQAlert).where(
            DQAlert.asset_id == asset.asset_id,
            DQAlert.alert_type == finding["alert_type"],
            DQAlert.alert_status == "open",
            DQAlert.created_at >= window_start,
        )
    )
    if existing.scalar_one_or_none():
        logger.debug(
            "Observability alert dedup: open alert exists for %s/%s",
            asset.asset_id, finding["alert_type"],
        )
        return

    alert = DQAlert(
        alert_id=str(uuid.uuid4()),
        domain_id=asset.domain_id,
        subdomain_id=asset.subdomain_id,
        asset_id=asset.asset_id,
        alert_type=finding["alert_type"],
        severity=finding["severity"],
        alert_status="open",
        alert_message=finding["message"],
        notification_channel="multi",
        notification_sent=False,
        created_at=_utcnow(),
    )
    db.add(alert)

    await create_observability_issue(asset, finding, db)
    await db.commit()
    logger.info(
        "Observability alert created: type=%s severity=%s asset=%s",
        finding["alert_type"], finding["severity"], asset.asset_id,
    )

    asyncio.create_task(_dispatch_observability_notification(alert, asset, db))


async def _dispatch_observability_notification(alert: DQAlert, asset: Asset, db: AsyncSession) -> None:
    """Fire-and-forget notification dispatch, mirrors alert_service._dispatch_notification
    but without a DQRule (observability findings aren't rule-driven)."""
    try:
        from app.db.database import AsyncSessionLocal
        from app.services.notification_service import dispatch_alert
        from app.db.models import Domain

        async with AsyncSessionLocal() as session:
            extra_emails: list[str] = []
            domain_name = ""
            domain_res = await session.execute(
                select(Domain).where(Domain.domain_id == asset.domain_id)
            )
            domain = domain_res.scalar_one_or_none()
            if domain:
                domain_name = domain.domain_name
                if domain.owner_email:
                    extra_emails.append(domain.owner_email)
            if getattr(asset, "owner_email", None):
                extra_emails.append(asset.owner_email)

            asset_name = f"{asset.sf_schema_name}.{asset.sf_table_name}" if asset.sf_table_name else ""

            results = await dispatch_alert(
                rule_name=alert.alert_type,
                severity=alert.severity,
                alert_message=alert.alert_message or "",
                domain_name=domain_name,
                asset_name=asset_name,
                extra_emails=list(set(extra_emails)),
            )

            alert_res = await session.execute(
                select(DQAlert).where(DQAlert.alert_id == alert.alert_id)
            )
            stored = alert_res.scalar_one_or_none()
            if stored:
                stored.notification_sent = any(results.values())
                stored.notification_sent_at = _utcnow()
                stored.notified_to = ", ".join(extra_emails) if extra_emails else None
                await session.commit()
    except Exception as e:
        logger.error("Observability notification dispatch failed for alert %s: %s", alert.alert_id, e)
```

Replace the `from datetime import datetime, timezone` import near the top of the file with `from datetime import datetime, timezone, timedelta`, and the `from typing import Optional` stays as-is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. pytest tests/test_observability_engine.py -v`
Expected: PASS (13 passed)

- [ ] **Step 5: Commit**

```bash
git add app/services/observability_engine.py tests/test_observability_engine.py
git commit -m "feat(observability): add schema drift wrapper and alert/issue creation with dedup"
```

---

### Task 4: `observability_engine.py` — connector helpers + `run_due_connections` orchestrator

**Files:**
- Modify: `app/services/observability_engine.py` (append)
- Modify: `tests/test_observability_engine.py` (append)

**Interfaces:**
- Consumes: `ContinuousMonitoringConfig` (Task 1), all `check_*`/`create_observability_*` functions (Tasks 2-3), `app.connectors.config.from_orm`, `app.connectors.factory.get_connector`, `app.api.connections._decrypt_password` (existing).
- Produces: `async run_due_connections(db: AsyncSession) -> int` (returns count of connections processed this tick) — Task 5's scheduler job calls this exact function.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_observability_engine.py`:

```python
# ─── run_due_connections ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_due_connections_skips_not_due():
    from app.services.observability_engine import run_due_connections
    config = MagicMock()
    config.is_enabled = True
    config.interval_minutes = 15
    config.last_run_at = _utcnow()  # just ran — not due yet
    config.connection_id = "conn-1"

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [config]
    mock_db.execute = AsyncMock(return_value=r)

    with patch("app.services.observability_engine._run_connection_checks", new=AsyncMock()) as mock_run:
        processed = await run_due_connections(mock_db)

    assert processed == 0
    mock_run.assert_not_called()


@pytest.mark.asyncio
async def test_run_due_connections_processes_due_connection_and_updates_last_run():
    from app.services.observability_engine import run_due_connections
    config = MagicMock()
    config.is_enabled = True
    config.interval_minutes = 15
    config.last_run_at = _utcnow() - timedelta(minutes=20)
    config.connection_id = "conn-1"

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [config]
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    with patch("app.services.observability_engine._run_connection_checks", new=AsyncMock()) as mock_run:
        processed = await run_due_connections(mock_db)

    assert processed == 1
    mock_run.assert_called_once_with(config, mock_db)
    assert config.last_run_at is not None


@pytest.mark.asyncio
async def test_run_due_connections_first_run_when_last_run_at_is_none():
    from app.services.observability_engine import run_due_connections
    config = MagicMock()
    config.is_enabled = True
    config.interval_minutes = 15
    config.last_run_at = None
    config.connection_id = "conn-1"

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [config]
    mock_db.execute = AsyncMock(return_value=r)
    mock_db.commit = AsyncMock()

    with patch("app.services.observability_engine._run_connection_checks", new=AsyncMock()) as mock_run:
        processed = await run_due_connections(mock_db)

    assert processed == 1
    mock_run.assert_called_once()


# ─── _run_connection_checks ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_connection_checks_dispatches_enabled_checks_only():
    from app.services.observability_engine import _run_connection_checks
    config = MagicMock()
    config.connection_id = "conn-1"
    config.freshness_enabled = False
    config.volume_enabled = False
    config.schema_drift_enabled = True
    config.distribution_enabled = False

    asset = MagicMock(asset_id="asset-1", sf_database_name="DB", sf_schema_name="SCH", sf_table_name="TBL")

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [asset]
    mock_db.execute = AsyncMock(return_value=r)

    with patch("app.services.observability_engine._get_connector_for_connection", new=AsyncMock(return_value=None)), \
         patch("app.services.observability_engine.check_schema_drift", new=AsyncMock(return_value=[{"alert_type": "schema_drift", "severity": "high", "message": "x", "column_name": "c"}])) as mock_drift, \
         patch("app.services.observability_engine.create_observability_issue", new=AsyncMock()) as mock_issue, \
         patch("app.services.observability_engine.create_observability_alert", new=AsyncMock()) as mock_alert:
        await _run_connection_checks(config, mock_db)

    mock_drift.assert_called_once()
    mock_issue.assert_called_once()
    mock_alert.assert_not_called()


@pytest.mark.asyncio
async def test_run_connection_checks_continues_after_one_asset_fails():
    from app.services.observability_engine import _run_connection_checks
    config = MagicMock()
    config.connection_id = "conn-1"
    config.freshness_enabled = False
    config.volume_enabled = False
    config.schema_drift_enabled = True
    config.distribution_enabled = False

    bad_asset = MagicMock(asset_id="asset-bad")
    good_asset = MagicMock(asset_id="asset-good")

    mock_db = AsyncMock()
    r = MagicMock()
    r.scalars.return_value.all.return_value = [bad_asset, good_asset]
    mock_db.execute = AsyncMock(return_value=r)

    async def flaky_check(asset, db):
        if asset.asset_id == "asset-bad":
            raise RuntimeError("boom")
        return []

    with patch("app.services.observability_engine._get_connector_for_connection", new=AsyncMock(return_value=None)), \
         patch("app.services.observability_engine.check_schema_drift", new=flaky_check):
        await _run_connection_checks(config, mock_db)  # must not raise
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. pytest tests/test_observability_engine.py -v`
Expected: FAIL — `ImportError: cannot import name 'run_due_connections'`

- [ ] **Step 3: Write minimal implementation**

Append to `app/services/observability_engine.py`:

```python
from app.db.models import ContinuousMonitoringConfig, SnowflakeConnection


async def _get_connector_for_connection(connection_id: str, db: AsyncSession):
    """Returns a connector instance for the connection, or None if unresolvable."""
    from app.connectors.config import from_orm as config_from_orm
    from app.connectors.factory import get_connector
    from app.api.connections import _decrypt_password

    result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == connection_id)
    )
    conn_record = result.scalar_one_or_none()
    if conn_record is None or not conn_record.password:
        return None

    config = config_from_orm(conn_record)
    config.password = _decrypt_password(conn_record)
    try:
        return get_connector(config)
    except Exception as exc:
        logger.warning("Could not build connector for connection %s: %s", connection_id, exc)
        return None


async def _fetch_table_meta(asset: Asset, connector):
    """Returns the connector's TableMetadataSchema for this asset, or None."""
    if connector is None or not (asset.sf_database_name and asset.sf_schema_name and asset.sf_table_name):
        return None
    try:
        return await connector.get_table_metadata(
            asset.sf_database_name, asset.sf_schema_name, asset.sf_table_name
        )
    except Exception as exc:
        logger.warning("Could not fetch table metadata for asset %s: %s", asset.asset_id, exc)
        return None


async def _run_connection_checks(config: ContinuousMonitoringConfig, db: AsyncSession) -> None:
    """Runs every enabled check against every active asset on this connection.
    Per-asset failures are logged and skipped — they never abort the connection's run."""
    assets_result = await db.execute(
        select(Asset).where(Asset.connection_id == config.connection_id, Asset.is_active == True)
    )
    assets = assets_result.scalars().all()

    connector = None
    if config.freshness_enabled or config.volume_enabled:
        connector = await _get_connector_for_connection(config.connection_id, db)

    for asset in assets:
        try:
            table_meta = await _fetch_table_meta(asset, connector) if connector else None

            if config.freshness_enabled and table_meta is not None:
                finding = check_freshness(asset, table_meta.last_modified_at, _utcnow())
                if finding:
                    await create_observability_alert(asset, finding, db)

            if config.volume_enabled and table_meta is not None:
                finding = await check_volume(asset, table_meta.row_count, db)
                if finding:
                    await create_observability_alert(asset, finding, db)

            if config.schema_drift_enabled:
                for finding in await check_schema_drift(asset, db):
                    await create_observability_issue(asset, finding, db)

            if config.distribution_enabled:
                for finding in await check_distribution(asset, db):
                    await create_observability_alert(asset, finding, db)
        except Exception as exc:
            logger.error("Observability check failed for asset %s: %s", asset.asset_id, exc)
            continue


async def run_due_connections(db: AsyncSession) -> int:
    """Entry point called by the observability_tick scheduler job. Returns the
    number of connections processed this tick."""
    result = await db.execute(
        select(ContinuousMonitoringConfig).where(ContinuousMonitoringConfig.is_enabled == True)
    )
    configs = result.scalars().all()

    processed = 0
    now_dt = _utcnow()
    for config in configs:
        if config.last_run_at is not None:
            elapsed_minutes = (now_dt - config.last_run_at).total_seconds() / 60
            if elapsed_minutes < config.interval_minutes:
                continue
        await _run_connection_checks(config, db)
        config.last_run_at = now_dt
        await db.commit()
        processed += 1
    return processed
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. pytest tests/test_observability_engine.py -v`
Expected: PASS (18 passed)

- [ ] **Step 5: Commit**

```bash
git add app/services/observability_engine.py tests/test_observability_engine.py
git commit -m "feat(observability): add connector resolution and run_due_connections orchestrator"
```

---

### Task 5: Scheduler wiring — register `observability_tick`, remove nightly schema-drift job

**Files:**
- Modify: `app/services/scheduler_service.py`
- Test: `tests/test_observability_scheduler.py` (new)

**Interfaces:**
- Consumes: `observability_engine.run_due_connections` (Task 4).
- Produces: `_observability_tick()` async function registered as APScheduler job id `observability_tick` with a 5-minute `IntervalTrigger`, wired into `start_scheduler()`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_observability_scheduler.py`:

```python
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_observability_tick_calls_run_due_connections():
    from app.services.scheduler_service import _observability_tick

    with patch("app.db.database.AsyncSessionLocal") as mock_session_local, \
         patch("app.services.observability_engine.run_due_connections", new=AsyncMock(return_value=2)) as mock_run:
        mock_db = AsyncMock()
        mock_session_local.return_value.__aenter__.return_value = mock_db

        await _observability_tick()

        mock_run.assert_called_once_with(mock_db)


def test_nightly_drift_detect_job_removed():
    import app.services.scheduler_service as sched
    assert not hasattr(sched, "_nightly_drift_detect")
    assert not hasattr(sched, "_schedule_drift_detect_job")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. pytest tests/test_observability_scheduler.py -v`
Expected: FAIL — `ImportError: cannot import name '_observability_tick'`

- [ ] **Step 3: Write minimal implementation**

In `app/services/scheduler_service.py`:

1. Add the import at the top, alongside the existing trigger import:

```python
from apscheduler.triggers.interval import IntervalTrigger
```

2. Delete the `_nightly_drift_detect` function (currently lines 224-244, the function starting `async def _nightly_drift_detect():`) and the `_schedule_drift_detect_job` function (currently lines 301-316, starting `def _schedule_drift_detect_job(...)`).

3. In `_register_nightly_aggregation()`, delete the line `_schedule_drift_detect_job()         # default 04:00`.

4. Add the new tick function near the other nightly job functions (e.g. right after where `_nightly_collect_metrics` was, or in the same area the deleted drift function occupied):

```python
async def _observability_tick() -> None:
    """Runs every 5 minutes: processes any continuous-monitoring connection
    whose configured interval has elapsed."""
    from app.db.database import AsyncSessionLocal
    from app.services.observability_engine import run_due_connections

    async with AsyncSessionLocal() as db:
        processed = await run_due_connections(db)
    if processed:
        logger.info("Observability tick: processed %d connection(s)", processed)
```

5. In `start_scheduler()`, add the job registration right after the `nightly_collect_metrics` job block:

```python
        scheduler.add_job(
            _observability_tick,
            trigger=IntervalTrigger(minutes=5),
            id="observability_tick",
            replace_existing=True,
            misfire_grace_time=120,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. pytest tests/test_observability_scheduler.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Run the full existing scheduler-adjacent test suite to confirm nothing else referenced the removed job**

Run: `PYTHONPATH=. pytest tests/ -v -k "schedul"`
Expected: PASS (no failures — confirms no other test depended on `_nightly_drift_detect`/`_schedule_drift_detect_job`)

- [ ] **Step 6: Commit**

```bash
git add app/services/scheduler_service.py tests/test_observability_scheduler.py
git commit -m "feat(observability): register observability_tick job, fold nightly drift-detect into it"
```

---

### Task 6: API endpoints — `GET`/`POST /observability/continuous-config`

**Files:**
- Modify: `app/api/observability.py`
- Test: `tests/test_api_observability_continuous_config.py` (new)

**Interfaces:**
- Consumes: `ContinuousMonitoringConfig`, `SnowflakeConnection` (existing/Task 1).
- Produces: `GET /observability/continuous-config` and `POST /observability/continuous-config`, both returning `{"connections": [...]}` with entries shaped `{connection_id, name, interval_minutes, is_enabled, freshness_enabled, volume_enabled, schema_drift_enabled, distribution_enabled, next_check_at}`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_api_observability_continuous_config.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

_MOCK_USER = {"email": "admin@example.com", "role": "admin", "user_id": "system", "full_name": "System Admin"}


async def _mock_current_user():
    return _MOCK_USER


@pytest.mark.asyncio
async def test_get_continuous_config_empty():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    async def mock_db():
        db = AsyncMock()
        r = MagicMock()
        r.all.return_value = []
        db.execute = AsyncMock(return_value=r)
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/observability/continuous-config")
        assert resp.status_code == 200
        assert resp.json() == {"connections": []}
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_get_continuous_config_with_rows():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    config = MagicMock()
    config.connection_id = "conn-1"
    config.interval_minutes = 15
    config.is_enabled = True
    config.freshness_enabled = True
    config.volume_enabled = True
    config.schema_drift_enabled = True
    config.distribution_enabled = True
    config.last_run_at = datetime(2026, 6, 21, 10, 0, 0)

    conn = MagicMock()
    conn.connection_id = "conn-1"
    conn.connection_name = "snowflake-prod"

    async def mock_db():
        db = AsyncMock()
        r = MagicMock()
        r.all.return_value = [(config, conn)]
        db.execute = AsyncMock(return_value=r)
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/observability/continuous-config")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["connections"]) == 1
        entry = data["connections"][0]
        assert entry["connection_id"] == "conn-1"
        assert entry["name"] == "snowflake-prod"
        assert entry["interval_minutes"] == 15
        assert entry["next_check_at"] == "2026-06-21T10:15:00"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_post_continuous_config_creates_new_row():
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    call_no = [0]

    async def mock_db():
        db = AsyncMock()

        async def execute(stmt, *a, **kw):
            call_no[0] += 1
            r = MagicMock()
            if call_no[0] == 1:
                r.scalar_one_or_none.return_value = None  # no existing config row
            else:
                r.all.return_value = []  # final re-fetch for response
            return r

        db.execute = execute
        db.add = MagicMock()
        db.commit = AsyncMock()
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user
    try:
        body = {
            "connection_id": "conn-2",
            "interval_minutes": 30,
            "is_enabled": True,
            "freshness_enabled": True,
            "volume_enabled": False,
            "schema_drift_enabled": True,
            "distribution_enabled": False,
        }
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/observability/continuous-config", json=body)
        assert resp.status_code == 200
        assert resp.json() == {"connections": []}
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. pytest tests/test_api_observability_continuous_config.py -v`
Expected: FAIL — 404 Not Found (routes don't exist yet)

- [ ] **Step 3: Write minimal implementation**

In `app/api/observability.py`, add the import and two new routes (append to the file):

```python
from pydantic import BaseModel
from app.db.models import ContinuousMonitoringConfig, SnowflakeConnection


class ContinuousConfigUpdate(BaseModel):
    connection_id: str
    interval_minutes: int = 15
    is_enabled: bool = True
    freshness_enabled: bool = True
    volume_enabled: bool = True
    schema_drift_enabled: bool = True
    distribution_enabled: bool = True


async def _serialize_connections(db: AsyncSession) -> dict:
    result = await db.execute(
        select(ContinuousMonitoringConfig, SnowflakeConnection)
        .join(SnowflakeConnection, SnowflakeConnection.connection_id == ContinuousMonitoringConfig.connection_id)
    )
    rows = result.all()
    connections = []
    for config, conn in rows:
        next_check_at = None
        if config.last_run_at is not None:
            next_check_at = (config.last_run_at + timedelta(minutes=config.interval_minutes)).isoformat()
        connections.append({
            "connection_id": config.connection_id,
            "name": conn.connection_name,
            "interval_minutes": config.interval_minutes,
            "is_enabled": config.is_enabled,
            "freshness_enabled": config.freshness_enabled,
            "volume_enabled": config.volume_enabled,
            "schema_drift_enabled": config.schema_drift_enabled,
            "distribution_enabled": config.distribution_enabled,
            "next_check_at": next_check_at,
        })
    return {"connections": connections}


@router.get("/continuous-config")
async def get_continuous_config(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    return await _serialize_connections(db)


@router.post("/continuous-config")
async def update_continuous_config(
    body: ContinuousConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await db.execute(
        select(ContinuousMonitoringConfig).where(
            ContinuousMonitoringConfig.connection_id == body.connection_id
        )
    )
    config = result.scalar_one_or_none()
    if config is None:
        config = ContinuousMonitoringConfig(connection_id=body.connection_id)
        db.add(config)

    config.interval_minutes = body.interval_minutes
    config.is_enabled = body.is_enabled
    config.freshness_enabled = body.freshness_enabled
    config.volume_enabled = body.volume_enabled
    config.schema_drift_enabled = body.schema_drift_enabled
    config.distribution_enabled = body.distribution_enabled

    await db.commit()
    return await _serialize_connections(db)
```

Note: `timedelta` must be imported — `from datetime import datetime, timezone, date, timedelta` already exists at the top of `app/api/observability.py` per the existing file; if `timedelta` isn't already in that import line, add it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. pytest tests/test_api_observability_continuous_config.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add app/api/observability.py tests/test_api_observability_continuous_config.py
git commit -m "feat(observability): add GET/POST /observability/continuous-config endpoints"
```

---

### Task 7: Frontend — pause toggle and schema-drift/distribution checkboxes

**Files:**
- Modify: `frontend/src/app/observability/page.tsx`

**Interfaces:**
- Consumes: `GET`/`POST /api/observability/continuous-config` (Task 6, already proxied unchanged by the existing `frontend/src/app/api/observability/continuous-config/route.ts`).
- Produces: no new exports — this is a leaf UI change. No automated test (this codebase has no frontend test suite for this page); verify manually per Step 3.

- [ ] **Step 1: Update the `ContinuousConfig` interface and `contDraft` state**

In `frontend/src/app/observability/page.tsx`, replace:

```tsx
interface ContinuousConfig {
  connection_id: string; name: string; interval_minutes: number
  freshness_enabled: boolean; volume_enabled: boolean; next_check_at: string | null
}
```

with:

```tsx
interface ContinuousConfig {
  connection_id: string; name: string; interval_minutes: number; is_enabled: boolean
  freshness_enabled: boolean; volume_enabled: boolean
  schema_drift_enabled: boolean; distribution_enabled: boolean
  next_check_at: string | null
}
```

And replace:

```tsx
  const [contDraft, setContDraft] = useState({ connection_id: '', interval_minutes: 15, freshness_enabled: true, volume_enabled: true })
```

with:

```tsx
  const [contDraft, setContDraft] = useState({
    connection_id: '', interval_minutes: 15, is_enabled: true,
    freshness_enabled: true, volume_enabled: true,
    schema_drift_enabled: true, distribution_enabled: true,
  })
```

- [ ] **Step 2: Add the pause badge/pills to the connection list and the two checkboxes + toggle to the form**

Replace the connection-list row block:

```tsx
              {contConfigs.map(c => (
                <div key={c.connection_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>{c.name || c.connection_id}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>every {c.interval_minutes}m</span>
                  {c.freshness_enabled && <span style={{ fontSize: '10px', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>freshness</span>}
                  {c.volume_enabled && <span style={{ fontSize: '10px', background: 'var(--status-info-bg)', color: 'var(--status-info-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>volume</span>}
                  {c.next_check_at && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>next: {c.next_check_at.slice(11, 16)}</span>}
                </div>
              ))}
```

with:

```tsx
              {contConfigs.map(c => (
                <div key={c.connection_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: '6px', opacity: c.is_enabled ? 1 : 0.55 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>{c.name || c.connection_id}</span>
                  {!c.is_enabled && <span style={{ fontSize: '10px', background: 'var(--surface)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>paused</span>}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>every {c.interval_minutes}m</span>
                  {c.freshness_enabled && <span style={{ fontSize: '10px', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>freshness</span>}
                  {c.volume_enabled && <span style={{ fontSize: '10px', background: 'var(--status-info-bg)', color: 'var(--status-info-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>volume</span>}
                  {c.schema_drift_enabled && <span style={{ fontSize: '10px', background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>schema drift</span>}
                  {c.distribution_enabled && <span style={{ fontSize: '10px', background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>distribution</span>}
                  {c.next_check_at && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>next: {c.next_check_at.slice(11, 16)}</span>}
                </div>
              ))}
```

Replace the form's checkbox block (the two `<label>` checkboxes for Freshness/Volume) plus the Save button:

```tsx
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.freshness_enabled} onChange={e => setContDraft(d => ({ ...d, freshness_enabled: e.target.checked }))} />
                Freshness
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.volume_enabled} onChange={e => setContDraft(d => ({ ...d, volume_enabled: e.target.checked }))} />
                Volume
              </label>
              <button onClick={saveContConfig} disabled={contSaving || !contDraft.connection_id}
                style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: contDraft.connection_id ? 'pointer' : 'not-allowed', opacity: (!contDraft.connection_id || contSaving) ? 0.6 : 1 }}>
                {contSaving ? 'Saving…' : contSaved ? 'Saved ✓' : 'Save'}
              </button>
```

with:

```tsx
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.freshness_enabled} onChange={e => setContDraft(d => ({ ...d, freshness_enabled: e.target.checked }))} />
                Freshness
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.volume_enabled} onChange={e => setContDraft(d => ({ ...d, volume_enabled: e.target.checked }))} />
                Volume
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.schema_drift_enabled} onChange={e => setContDraft(d => ({ ...d, schema_drift_enabled: e.target.checked }))} />
                Schema Drift
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.distribution_enabled} onChange={e => setContDraft(d => ({ ...d, distribution_enabled: e.target.checked }))} />
                Distribution
              </label>
              <button onClick={() => setContDraft(d => ({ ...d, is_enabled: !d.is_enabled }))}
                style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', background: contDraft.is_enabled ? '#16a34a' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                title={contDraft.is_enabled ? 'Enabled — click to pause' : 'Paused — click to resume'}>
                <span style={{ position: 'absolute', top: '2px', left: contDraft.is_enabled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
              <button onClick={saveContConfig} disabled={contSaving || !contDraft.connection_id}
                style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: contDraft.connection_id ? 'pointer' : 'not-allowed', opacity: (!contDraft.connection_id || contSaving) ? 0.6 : 1 }}>
                {contSaving ? 'Saving…' : contSaved ? 'Saved ✓' : 'Save'}
              </button>
```

- [ ] **Step 3: Manually verify in the browser**

Run the frontend dev server (`cd frontend && npm run dev`), sign in, navigate to `/observability`, scroll to "Continuous Monitoring". Confirm:
- Entering a `connection_id`, toggling all four checkboxes and the pause switch, and clicking Save round-trips without a console error.
- After saving, the connection appears in the list above with the correct pills (`freshness`, `volume`, `schema drift`, `distribution`) and, if paused, the `paused` badge with dimmed row.
- Re-saving with a different `interval_minutes` updates the displayed `every Xm` text.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/observability/page.tsx
git commit -m "feat(observability): add pause toggle and schema-drift/distribution controls to continuous-monitoring panel"
```

---

### Task 8: Update the "Under Development" status on the Settings page

**Files:**
- Modify: `frontend/src/app/settings/page.tsx` (the `Data Observability Engine` entry, around line 712-716, identified during design)

**Interfaces:**
- None — this is a documentation/status string update, no behavior change.

- [ ] **Step 1: Update the capability entry**

Find the object literal with `name: 'Data Observability Engine'` (around line 712) in `frontend/src/app/settings/page.tsx`. Change its `status` field from:

```tsx
status: 'Not built — rules fire on schedule, no automatic detection',
```

to:

```tsx
status: 'Built — continuous per-connection checks for freshness, volume, schema drift, and distribution shift, independent of scheduled rules',
```

Leave the `desc` field as-is (it still accurately describes what the feature does now that it exists), or, if the surrounding code has a `gaps`/`exists` field pattern matching other entries on that page (check neighboring capability objects for the exact field names used), add an `exists:` field describing what was built, mirroring the style of nearby entries (e.g. the Observability entry's `exists` string seen earlier at line 934 of this same file). Match whatever field name pattern the immediately neighboring object literals use — inspect 2-3 entries above/below line 712 before editing, since this page's schema may vary slightly between sections.

- [ ] **Step 2: Manually verify**

Run the frontend dev server, navigate to Settings → Under Development, confirm the Data Observability Engine entry now shows as built/implemented.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/settings/page.tsx
git commit -m "docs(settings): mark Data Observability Engine as implemented"
```

---

## Self-Review Notes

- **Spec coverage:** freshness (Task 2/4), volume (Task 2/4), schema drift (Task 3/4, reusing existing service), distribution shift (Task 2/4) — all four checks covered. Scheduling/pause/interval-change (Task 5 + Task 7) covered. Alert+Issue creation for all severities (Task 3) covered. Continuous-config API matching real frontend contract (Task 6) covered. Settings page status update (Task 8) covered as the original ask ("implement the under-development item") implies closing out its status, not just the backend.
- **Placeholder scan:** no TBD/TODO; Task 8's instruction to "inspect neighboring entries" is a one-line lookup the implementer performs before a 1-line edit, not an unresolved requirement — the diff itself (status string) is fully specified.
- **Type consistency:** `check_freshness`/`check_volume`/`check_distribution`/`check_schema_drift` all return the same finding-dict shape (`alert_type`, `severity`, `message`, optional `column_name`) used consistently by `create_observability_alert`/`create_observability_issue` in Task 3 and `_run_connection_checks` in Task 4. Frontend field names (`interval_minutes`, `is_enabled`, `*_enabled`, `next_check_at`) match exactly between Task 6's API response and Task 7's TypeScript interface.
