# Observability & Monitoring Real-Time Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic baseline monitoring, SLA breach prediction, cross-table anomaly correlation, a real-time `/observability` hub page, and a dashboard incident banner — all without requiring user setup for any table.

**Architecture:** A new `monitoring_service.py` owns all monitoring logic (metric collection, SLA prediction, correlation grouping). Two new APScheduler nightly jobs call into it. A new `monitoring.py` FastAPI router exposes the results. The frontend polls all endpoints every 30 seconds via Next.js proxy routes.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2 async, APScheduler 3, Alembic, Snowflake, Next.js 14 App Router (TypeScript), inline styles (no Tailwind/UI libraries).

## Global Constraints

- All new Python files start with `from __future__ import annotations`.
- SQLAlchemy models use `Mapped[T]` / `mapped_column()` syntax (2.0 style). JSON columns use `JSONVariant` (already imported in models.py). UUID PKs use `gen_uuid`. Timestamps use `now()` both as `default=now` callable.
- All API endpoints require `get_current_user` from `app.core.security`.
- Frontend proxy routes follow: `export const dynamic = 'force-dynamic'`; `const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'`; error → return empty array/object.
- Frontend pages are `'use client'` and use inline styles with CSS variables (`var(--background)`, `var(--surface)`, `var(--border)`, `var(--foreground)`, `var(--text-muted)`, `var(--accent)`, `var(--status-error-text)`, `var(--status-error-bg)`, `var(--status-warn-text)`, `var(--status-warn-bg)`, `var(--status-ok-text)`, `var(--status-ok-bg)`).
- No new npm packages. No Tailwind. No external component libraries.
- Alembic migration revision `"0028"`, `down_revision = "0027"`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `migrations/versions/0028_monitoring_tables.py` | Create | Three new DB tables |
| `app/db/models.py` | Modify | Add `AssetMonitoringMetric`, `SLABreachPrediction`, `CorrelatedIncident` models |
| `app/services/monitoring_service.py` | Create | `collect_asset_metrics`, `predict_sla_breaches`, `check_correlation` |
| `app/api/monitoring.py` | Create | 4 REST endpoints for monitoring data |
| `app/services/scheduler_service.py` | Modify | Add 2 nightly jobs + their runner functions |
| `app/api/anomaly.py` | Modify | Call `check_correlation` after anomaly commit |
| `app/main.py` | Modify | Include `monitoring.router` |
| `frontend/src/hooks/useInterval.ts` | Create | Reusable polling interval hook |
| `frontend/src/app/api/observability/freshness-board/route.ts` | Create | Proxy → `/observability/freshness-board` |
| `frontend/src/app/api/observability/quality-heatmap/route.ts` | Create | Proxy → `/observability/quality-heatmap` |
| `frontend/src/app/api/monitoring/sla-predictions/route.ts` | Create | Proxy → `/monitoring/sla-predictions` |
| `frontend/src/app/api/monitoring/correlated-incidents/route.ts` | Create | Proxy → `GET /monitoring/correlated-incidents` |
| `frontend/src/app/api/monitoring/correlated-incidents/[id]/resolve/route.ts` | Create | Proxy → `POST /monitoring/correlated-incidents/{id}/resolve` |
| `frontend/src/app/observability/page.tsx` | Create | 4-section monitoring hub with 30s polling |
| `frontend/src/app/page.tsx` | Modify | Add correlated incident banner with 60s polling |
| `frontend/src/components/Sidebar.tsx` | Modify | Add `/observability` to `SECTION_KEY_MAP` |
| `tests/test_monitoring_service.py` | Create | Unit tests for all three service functions |

---

### Task 1: DB Migration + SQLAlchemy Models

**Files:**
- Create: `migrations/versions/0028_monitoring_tables.py`
- Modify: `app/db/models.py` (add 3 classes after line 910, after `AnomalyDetection`)

**Interfaces:**
- Produces:
  - `AssetMonitoringMetric` model with fields: `metric_id`, `asset_id`, `metric_date`, `row_count`, `freshness_hours`, `null_rate_avg`, `created_at`
  - `SLABreachPrediction` model with fields: `prediction_id`, `asset_id`, `predicted_at`, `horizon_days`, `forecast_scores`, `lower_band`, `upper_band`, `breach_day`, `breach_probability`, `is_at_risk`
  - `CorrelatedIncident` model with fields: `incident_id`, `detected_at`, `window_start`, `window_end`, `asset_ids`, `anomaly_ids`, `asset_count`, `severity`, `status`, `resolved_at`

- [ ] **Step 1: Create migration file**

```python
# migrations/versions/0028_monitoring_tables.py
"""monitoring: add asset_monitoring_metrics, sla_breach_predictions, correlated_incidents"""

from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = "0028"
down_revision = "0027"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    try:
        bind.execute(sa.text(f"SELECT 1 FROM {name} LIMIT 1"))
        return True
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "asset_monitoring_metrics"):
        op.create_table(
            "asset_monitoring_metrics",
            sa.Column("metric_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("metric_date", sa.Date(), nullable=False),
            sa.Column("row_count", sa.BigInteger(), nullable=True),
            sa.Column("freshness_hours", sa.Float(), nullable=True),
            sa.Column("null_rate_avg", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _table_exists(bind, "sla_breach_predictions"):
        op.create_table(
            "sla_breach_predictions",
            sa.Column("prediction_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("predicted_at", sa.DateTime(), nullable=False),
            sa.Column("horizon_days", sa.Integer(), nullable=False, server_default="7"),
            sa.Column("forecast_scores", VARIANT(), nullable=True),
            sa.Column("lower_band", VARIANT(), nullable=True),
            sa.Column("upper_band", VARIANT(), nullable=True),
            sa.Column("breach_day", sa.Integer(), nullable=True),
            sa.Column("breach_probability", sa.Float(), nullable=True),
            sa.Column("is_at_risk", sa.Boolean(), nullable=False, server_default="false"),
        )

    if not _table_exists(bind, "correlated_incidents"):
        op.create_table(
            "correlated_incidents",
            sa.Column("incident_id", sa.String(36), primary_key=True),
            sa.Column("detected_at", sa.DateTime(), nullable=False),
            sa.Column("window_start", sa.DateTime(), nullable=False),
            sa.Column("window_end", sa.DateTime(), nullable=False),
            sa.Column("asset_ids", VARIANT(), nullable=True),
            sa.Column("anomaly_ids", VARIANT(), nullable=True),
            sa.Column("asset_count", sa.Integer(), nullable=False),
            sa.Column("severity", sa.String(20), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="'open'"),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("correlated_incidents")
    op.drop_table("sla_breach_predictions")
    op.drop_table("asset_monitoring_metrics")
```

- [ ] **Step 2: Add three model classes to `app/db/models.py`**

Insert the following after the `AnomalyDetection` class (after line ~910, before `QualityCostConfig`):

```python
class AssetMonitoringMetric(Base):
    __tablename__ = "asset_monitoring_metrics"

    metric_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
    metric_date: Mapped[date] = mapped_column(Date, nullable=False)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    freshness_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    null_rate_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class SLABreachPrediction(Base):
    __tablename__ = "sla_breach_predictions"

    prediction_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=False)
    predicted_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    horizon_days: Mapped[int] = mapped_column(Integer, default=7)
    forecast_scores: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    lower_band: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    upper_band: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    breach_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    breach_probability: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_at_risk: Mapped[bool] = mapped_column(Boolean, default=False)


class CorrelatedIncident(Base):
    __tablename__ = "correlated_incidents"

    incident_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    window_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    window_end: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    asset_ids: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    anomaly_ids: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    asset_count: Mapped[int] = mapped_column(Integer, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 3: Run the migration locally to verify it parses**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "from migrations.versions import 0028_monitoring_tables"
```

Expected: no import error. (Actual DB migration runs in the deployed environment — skip `alembic upgrade head` if Snowflake is not available locally.)

- [ ] **Step 4: Verify models import cleanly**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "from app.db.models import AssetMonitoringMetric, SLABreachPrediction, CorrelatedIncident; print('OK')"
```

Expected output: `OK`

- [ ] **Step 5: Commit**

```bash
git add migrations/versions/0028_monitoring_tables.py app/db/models.py
git commit -m "feat(monitoring): add DB migration and SQLAlchemy models for monitoring tables"
```

---

### Task 2: monitoring_service.py + Unit Tests

**Files:**
- Create: `app/services/monitoring_service.py`
- Create: `tests/test_monitoring_service.py`

**Interfaces:**
- Consumes from Task 1: `AssetMonitoringMetric`, `SLABreachPrediction`, `CorrelatedIncident` models; `Asset`, `DQRuleRun`, `DQQualityScore`, `SLAConfig`, `ColumnMetadata`, `AnomalyDetection` models; `forecast_service.compute_forecast`
- Produces:
  - `async def collect_asset_metrics(db: AsyncSession) -> int` — returns count of metrics written
  - `async def predict_sla_breaches(db: AsyncSession) -> int` — returns count of predictions upserted
  - `async def check_correlation(asset_id: str, detection_id: str, db: AsyncSession) -> Optional[str]` — returns `incident_id` if created, else `None`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_monitoring_service.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, date, timezone, timedelta


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── predict_sla_breaches tests ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_predict_sla_at_risk():
    """lower_band dips below SLA threshold → is_at_risk=True, breach_day set."""
    from app.services.monitoring_service import predict_sla_breaches

    mock_db = AsyncMock()

    # SLAConfig: min_quality_score=90.0
    sla = MagicMock()
    sla.entity_id = "asset-1"
    sla.min_quality_score = 90.0

    # Quality scores: last 10 days all at 91, trending down
    scores = [MagicMock() for _ in range(10)]
    for i, s in enumerate(scores):
        s.quality_score = 91.0 - i * 0.5   # 91, 90.5, 90, 89.5, ...
        s.score_date = date.today() - timedelta(days=i)

    existing_pred = None  # No existing prediction

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "sla_configs" in stmt_str or hasattr(q, '_where_criteria') and "entity_type" in str(q):
            result.scalars.return_value.all.return_value = [sla]
        elif "dq_quality_scores" in stmt_str:
            result.scalars.return_value.all.return_value = scores
        elif "sla_breach_predictions" in stmt_str:
            result.scalar_one_or_none.return_value = existing_pred
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    count = await predict_sla_breaches(mock_db)
    assert count == 1
    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.is_at_risk is True
    assert added.breach_day is not None
    assert 0 <= added.breach_probability <= 1.0


@pytest.mark.asyncio
async def test_predict_sla_safe():
    """All forecast lower_band stays above threshold → is_at_risk=False."""
    from app.services.monitoring_service import predict_sla_breaches

    mock_db = AsyncMock()

    sla = MagicMock()
    sla.entity_id = "asset-2"
    sla.min_quality_score = 70.0

    scores = [MagicMock() for _ in range(10)]
    for i, s in enumerate(scores):
        s.quality_score = 95.0
        s.score_date = date.today() - timedelta(days=i)

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "sla_configs" in stmt_str:
            result.scalars.return_value.all.return_value = [sla]
        elif "dq_quality_scores" in stmt_str:
            result.scalars.return_value.all.return_value = scores
        elif "sla_breach_predictions" in stmt_str:
            result.scalar_one_or_none.return_value = None
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    count = await predict_sla_breaches(mock_db)
    assert count == 1
    added = mock_db.add.call_args[0][0]
    assert added.is_at_risk is False
    assert added.breach_day is None
    assert added.breach_probability == 0.0


@pytest.mark.asyncio
async def test_predict_sla_insufficient_data():
    """Fewer than 3 quality scores → asset is skipped, count=0."""
    from app.services.monitoring_service import predict_sla_breaches

    mock_db = AsyncMock()
    sla = MagicMock()
    sla.entity_id = "asset-3"
    sla.min_quality_score = 90.0

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "sla_configs" in stmt_str:
            result.scalars.return_value.all.return_value = [sla]
        elif "dq_quality_scores" in stmt_str:
            result.scalars.return_value.all.return_value = [MagicMock(quality_score=88.0, score_date=date.today())]
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    count = await predict_sla_breaches(mock_db)
    assert count == 0
    mock_db.add.assert_not_called()


# ─── check_correlation tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_check_correlation_creates_incident():
    """3 distinct assets with anomalies in 15-min window → incident created."""
    from app.services.monitoring_service import check_correlation

    mock_db = AsyncMock()

    detections = [MagicMock() for _ in range(3)]
    for i, d in enumerate(detections):
        d.asset_id = f"asset-{i}"
        d.detection_id = f"det-{i}"
        d.severity = "medium"

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "anomaly_detections" in stmt_str and "correlated" not in stmt_str:
            result.scalars.return_value.all.return_value = detections
        elif "correlated_incidents" in stmt_str:
            result.scalar_one_or_none.return_value = None  # no existing incident
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    incident_id = await check_correlation("asset-0", "det-0", mock_db)
    assert incident_id is not None
    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.asset_count == 3
    assert added.status == "open"


@pytest.mark.asyncio
async def test_check_correlation_too_few_assets():
    """Only 2 distinct assets in window → no incident, returns None."""
    from app.services.monitoring_service import check_correlation

    mock_db = AsyncMock()

    detections = [MagicMock() for _ in range(2)]
    for i, d in enumerate(detections):
        d.asset_id = f"asset-{i}"
        d.detection_id = f"det-{i}"
        d.severity = "medium"

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "anomaly_detections" in stmt_str and "correlated" not in stmt_str:
            result.scalars.return_value.all.return_value = detections
        else:
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    incident_id = await check_correlation("asset-0", "det-0", mock_db)
    assert incident_id is None
    mock_db.add.assert_not_called()


@pytest.mark.asyncio
async def test_check_correlation_existing_open_incident():
    """Open incident already created within 30-min guard window → no new incident."""
    from app.services.monitoring_service import check_correlation

    mock_db = AsyncMock()

    detections = [MagicMock() for _ in range(3)]
    for i, d in enumerate(detections):
        d.asset_id = f"asset-{i}"
        d.detection_id = f"det-{i}"
        d.severity = "high"

    existing = MagicMock()  # existing open incident

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "anomaly_detections" in stmt_str and "correlated" not in stmt_str:
            result.scalars.return_value.all.return_value = detections
        elif "correlated_incidents" in stmt_str:
            result.scalar_one_or_none.return_value = existing
        else:
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    incident_id = await check_correlation("asset-0", "det-0", mock_db)
    assert incident_id is None
    mock_db.add.assert_not_called()


# ─── collect_asset_metrics tests ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_collect_metrics_idempotent():
    """Second call on same day for an asset skips if metric already exists."""
    from app.services.monitoring_service import collect_asset_metrics

    mock_db = AsyncMock()

    asset = MagicMock()
    asset.asset_id = "asset-1"
    asset.connection_id = None
    asset.sf_table_name = None  # no Snowflake table → row_count stays None

    existing_metric = MagicMock()  # already recorded today

    async def _execute_side_effect(q):
        result = MagicMock()
        stmt_str = str(q)
        if "assets" in stmt_str and "is_active" in stmt_str:
            result.scalars.return_value.all.return_value = [asset]
        elif "dq_rule_runs" in stmt_str:
            result.scalar_one_or_none.return_value = None
        elif "asset_monitoring_metrics" in stmt_str:
            result.scalar_one_or_none.return_value = existing_metric
        elif "column_metadata" in stmt_str:
            result.scalars.return_value.all.return_value = []
        else:
            result.scalars.return_value.all.return_value = []
            result.scalar_one_or_none.return_value = None
        return result

    mock_db.execute = _execute_side_effect
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    count = await collect_asset_metrics(mock_db)
    assert count == 0  # skipped — already recorded today
    mock_db.add.assert_not_called()
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_monitoring_service.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'app.services.monitoring_service'` (or similar import error — confirms tests run but code doesn't exist yet).

- [ ] **Step 3: Create `app/services/monitoring_service.py`**

```python
# app/services/monitoring_service.py
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta, date
from typing import Optional

from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("dq_platform.monitoring")

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


# ── collect_asset_metrics ─────────────────────────────────────────────────────

async def collect_asset_metrics(db: AsyncSession) -> int:
    """
    Nightly job: for each active asset, record row_count, freshness_hours,
    null_rate_avg into asset_monitoring_metrics. One row per asset per day.
    Idempotent — skips assets already recorded today.
    Returns count of new rows written.
    """
    from app.core.config import settings
    from app.db.models import Asset, DQRuleRun, ColumnMetadata, AssetMonitoringMetric

    today = date.today()
    sem = asyncio.Semaphore(getattr(settings, "snowflake_pool_max_size", 5))
    written = 0

    assets_res = await db.execute(select(Asset).where(Asset.is_active == True))
    assets = assets_res.scalars().all()

    for asset in assets:
        async with sem:
            try:
                written += await _write_metric_for_asset(asset, today, db)
            except Exception as exc:
                logger.error("Metric collection failed for asset %s: %s", asset.asset_id, exc)

    await db.commit()
    logger.info("Metric collection complete: %d new rows", written)
    return written


async def _write_metric_for_asset(asset, today: date, db: AsyncSession) -> int:
    from app.db.models import DQRuleRun, ColumnMetadata, AssetMonitoringMetric

    # Idempotency check — skip if already recorded today
    existing = await db.execute(
        select(AssetMonitoringMetric).where(
            AssetMonitoringMetric.asset_id == asset.asset_id,
            AssetMonitoringMetric.metric_date == today,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return 0

    now = _utcnow()

    # Freshness: hours since most recent rule run
    latest_run_res = await db.execute(
        select(DQRuleRun.created_at)
        .where(DQRuleRun.asset_id == asset.asset_id)
        .order_by(desc(DQRuleRun.created_at))
        .limit(1)
    )
    latest_run_ts = latest_run_res.scalar_one_or_none()
    freshness_hours: Optional[float] = None
    if latest_run_ts is not None:
        freshness_hours = round((now - latest_run_ts).total_seconds() / 3600, 2)

    # Row count: query Snowflake (best-effort — skip on error)
    row_count: Optional[int] = None
    if asset.sf_table_name and asset.sf_schema_name:
        try:
            from app.services.execution_service import _resolve_executor
            executor = await _resolve_executor(asset, db)
            row_count = await executor.aget_table_row_count(
                asset.sf_database_name or "",
                asset.sf_schema_name,
                asset.sf_table_name,
            )
        except Exception as exc:
            logger.debug("Row count unavailable for %s: %s", asset.asset_id, exc)

    # Null rate: average null proportion across profiled columns
    null_rate_avg: Optional[float] = None
    if row_count and row_count > 0:
        cols_res = await db.execute(
            select(ColumnMetadata).where(
                ColumnMetadata.asset_id == asset.asset_id,
                ColumnMetadata.null_count.isnot(None),
            )
        )
        cols = cols_res.scalars().all()
        if cols:
            rates = [c.null_count / row_count for c in cols if c.null_count is not None]
            if rates:
                null_rate_avg = round(sum(rates) / len(rates), 4)

    metric = AssetMonitoringMetric(
        metric_id=str(uuid.uuid4()),
        asset_id=asset.asset_id,
        metric_date=today,
        row_count=row_count,
        freshness_hours=freshness_hours,
        null_rate_avg=null_rate_avg,
        created_at=now,
    )
    db.add(metric)
    return 1


# ── predict_sla_breaches ──────────────────────────────────────────────────────

async def predict_sla_breaches(db: AsyncSession) -> int:
    """
    Nightly job: for each asset with an active SLAConfig, fetch last 30 days
    of quality scores, run forecast, upsert SLABreachPrediction.
    Returns count of predictions upserted.
    """
    from app.db.models import SLAConfig, DQQualityScore, SLABreachPrediction
    from app.services.forecast_service import compute_forecast

    sla_res = await db.execute(
        select(SLAConfig).where(
            SLAConfig.is_active == True,
            SLAConfig.entity_type == "asset",
        )
    )
    sla_configs = sla_res.scalars().all()

    now = _utcnow()
    upserted = 0

    for sla in sla_configs:
        try:
            cutoff = date.today() - timedelta(days=30)
            scores_res = await db.execute(
                select(DQQualityScore).where(
                    DQQualityScore.asset_id == sla.entity_id,
                    DQQualityScore.score_level == "table",
                    DQQualityScore.score_date >= cutoff,
                ).order_by(DQQualityScore.score_date)
            )
            score_rows = scores_res.scalars().all()

            if len(score_rows) < 3:
                continue  # insufficient history — skip

            scores = [float(r.quality_score) for r in score_rows]
            result = compute_forecast(scores, horizon=7)
            if result is None:
                continue

            # Determine breach
            threshold = sla.min_quality_score
            breach_day: Optional[int] = None
            for i, lb in enumerate(result.lower_band):
                if lb < threshold:
                    breach_day = i
                    break
            days_below = sum(1 for lb in result.lower_band if lb < threshold)
            breach_probability = round(days_below / len(result.lower_band), 2)
            is_at_risk = breach_day is not None

            # Upsert by asset_id
            existing_res = await db.execute(
                select(SLABreachPrediction).where(
                    SLABreachPrediction.asset_id == sla.entity_id
                )
            )
            existing = existing_res.scalar_one_or_none()

            if existing:
                existing.predicted_at = now
                existing.horizon_days = 7
                existing.forecast_scores = result.forecast
                existing.lower_band = result.lower_band
                existing.upper_band = result.upper_band
                existing.breach_day = breach_day
                existing.breach_probability = breach_probability
                existing.is_at_risk = is_at_risk
                db.add(existing)
            else:
                pred = SLABreachPrediction(
                    prediction_id=str(uuid.uuid4()),
                    asset_id=sla.entity_id,
                    predicted_at=now,
                    horizon_days=7,
                    forecast_scores=result.forecast,
                    lower_band=result.lower_band,
                    upper_band=result.upper_band,
                    breach_day=breach_day,
                    breach_probability=breach_probability,
                    is_at_risk=is_at_risk,
                )
                db.add(pred)

            upserted += 1

        except Exception as exc:
            logger.error("SLA prediction failed for asset %s: %s", sla.entity_id, exc)

    await db.commit()
    logger.info("SLA prediction complete: %d predictions upserted", upserted)
    return upserted


# ── check_correlation ─────────────────────────────────────────────────────────

async def check_correlation(asset_id: str, detection_id: str, db: AsyncSession) -> Optional[str]:
    """
    Called after each new AnomalyDetection commit.
    If 3+ distinct assets have detections in the last 15 minutes, and no open
    CorrelatedIncident was created in the last 30 minutes, insert one.
    Returns the new incident_id, or None.
    """
    from app.db.models import AnomalyDetection, CorrelatedIncident

    now = _utcnow()
    window_start = now - timedelta(minutes=15)
    guard_start = now - timedelta(minutes=30)

    # Gather recent detections
    dets_res = await db.execute(
        select(AnomalyDetection).where(
            AnomalyDetection.detected_at > window_start
        )
    )
    recent = dets_res.scalars().all()

    distinct_assets = list({d.asset_id for d in recent})
    if len(distinct_assets) < 3:
        return None

    # Guard: no open incident in last 30 min
    existing_res = await db.execute(
        select(CorrelatedIncident).where(
            CorrelatedIncident.status == "open",
            CorrelatedIncident.detected_at > guard_start,
        )
    )
    if existing_res.scalar_one_or_none() is not None:
        return None

    # Determine severity: high if any detection is high/critical
    severities = {d.severity for d in recent if d.severity}
    severity = "high" if severities & {"high", "critical"} else "medium"

    incident = CorrelatedIncident(
        incident_id=str(uuid.uuid4()),
        detected_at=now,
        window_start=window_start,
        window_end=now,
        asset_ids=distinct_assets,
        anomaly_ids=[d.detection_id for d in recent],
        asset_count=len(distinct_assets),
        severity=severity,
        status="open",
    )
    db.add(incident)
    await db.commit()
    logger.info(
        "Correlated incident %s created: %d assets, severity=%s",
        incident.incident_id, len(distinct_assets), severity,
    )
    return incident.incident_id
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_monitoring_service.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/monitoring_service.py tests/test_monitoring_service.py
git commit -m "feat(monitoring): add monitoring_service with metric collection, SLA prediction, correlation"
```

---

### Task 3: monitoring.py API Router + main.py Wiring

**Files:**
- Create: `app/api/monitoring.py`
- Modify: `app/main.py` (add `from app.api import monitoring` to imports + `app.include_router(monitoring.router)`)

**Interfaces:**
- Consumes from Task 1: `AssetMonitoringMetric`, `SLABreachPrediction`, `CorrelatedIncident` models
- Produces REST endpoints:
  - `GET /monitoring/metrics?asset_id=<str>&days=<int>` → list of metric dicts
  - `GET /monitoring/sla-predictions?is_at_risk=<bool>` → list of prediction dicts
  - `GET /monitoring/correlated-incidents` → list of open incident dicts
  - `POST /monitoring/correlated-incidents/{incident_id}/resolve` → `{"message": "Resolved"}`

- [ ] **Step 1: Create `app/api/monitoring.py`**

```python
# app/api/monitoring.py
from __future__ import annotations

from datetime import date, datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import AssetMonitoringMetric, SLABreachPrediction, CorrelatedIncident, Asset

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt_metric(m: AssetMonitoringMetric) -> dict:
    return {
        "metric_id": m.metric_id,
        "asset_id": m.asset_id,
        "metric_date": m.metric_date.isoformat() if hasattr(m.metric_date, "isoformat") else str(m.metric_date),
        "row_count": m.row_count,
        "freshness_hours": m.freshness_hours,
        "null_rate_avg": m.null_rate_avg,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _fmt_prediction(p: SLABreachPrediction) -> dict:
    return {
        "prediction_id": p.prediction_id,
        "asset_id": p.asset_id,
        "predicted_at": p.predicted_at.isoformat() if p.predicted_at else None,
        "horizon_days": p.horizon_days,
        "forecast_scores": p.forecast_scores,
        "lower_band": p.lower_band,
        "upper_band": p.upper_band,
        "breach_day": p.breach_day,
        "breach_probability": p.breach_probability,
        "is_at_risk": p.is_at_risk,
    }


def _fmt_incident(i: CorrelatedIncident) -> dict:
    return {
        "incident_id": i.incident_id,
        "detected_at": i.detected_at.isoformat() if i.detected_at else None,
        "window_start": i.window_start.isoformat() if i.window_start else None,
        "window_end": i.window_end.isoformat() if i.window_end else None,
        "asset_ids": i.asset_ids or [],
        "anomaly_ids": i.anomaly_ids or [],
        "asset_count": i.asset_count,
        "severity": i.severity,
        "status": i.status,
        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
    }


@router.get("/metrics")
async def get_metrics(
    asset_id: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    cutoff = date.today() - __import__("datetime").timedelta(days=days)
    q = select(AssetMonitoringMetric).where(AssetMonitoringMetric.metric_date >= cutoff)
    if asset_id:
        q = q.where(AssetMonitoringMetric.asset_id == asset_id)
    q = q.order_by(desc(AssetMonitoringMetric.metric_date)).limit(500)
    result = await db.execute(q)
    return [_fmt_metric(m) for m in result.scalars().all()]


@router.get("/sla-predictions")
async def get_sla_predictions(
    is_at_risk: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(SLABreachPrediction)
    if is_at_risk is not None:
        q = q.where(SLABreachPrediction.is_at_risk == is_at_risk)
    q = q.order_by(desc(SLABreachPrediction.predicted_at)).limit(200)
    result = await db.execute(q)
    return [_fmt_prediction(p) for p in result.scalars().all()]


@router.get("/correlated-incidents")
async def get_correlated_incidents(
    status: Optional[str] = Query("open"),
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    q = select(CorrelatedIncident)
    if status:
        q = q.where(CorrelatedIncident.status == status)
    q = q.order_by(desc(CorrelatedIncident.detected_at)).limit(100)
    result = await db.execute(q)
    return [_fmt_incident(i) for i in result.scalars().all()]


@router.post("/correlated-incidents/{incident_id}/resolve")
async def resolve_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    result = await db.execute(
        select(CorrelatedIncident).where(CorrelatedIncident.incident_id == incident_id)
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.status = "resolved"
    incident.resolved_at = _utcnow()
    await db.commit()
    return {"message": "Resolved", "incident_id": incident_id}
```

- [ ] **Step 2: Wire into `app/main.py`**

In `app/main.py`, add `monitoring` to the import block (around line 29–40):

```python
# In the existing import block, add:
from app.api import (
    ...existing imports...,
    monitoring,
)
```

Then add after `app.include_router(issues.router)` (around line 234):

```python
app.include_router(monitoring.router)
```

- [ ] **Step 3: Verify the router registers cleanly**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "from app.api.monitoring import router; print('Routes:', [r.path for r in router.routes])"
```

Expected output:
```
Routes: ['/monitoring/metrics', '/monitoring/sla-predictions', '/monitoring/correlated-incidents', '/monitoring/correlated-incidents/{incident_id}/resolve']
```

- [ ] **Step 4: Commit**

```bash
git add app/api/monitoring.py app/main.py
git commit -m "feat(monitoring): add monitoring API router and wire into FastAPI app"
```

---

### Task 4: Scheduler Jobs + Anomaly Hook

**Files:**
- Modify: `app/services/scheduler_service.py` (add two async job functions + two `scheduler.add_job()` calls in `start_scheduler()`)
- Modify: `app/api/anomaly.py` (call `check_correlation` in `run_detector` when anomaly found)

**Interfaces:**
- Consumes from Task 2: `monitoring_service.collect_asset_metrics`, `monitoring_service.predict_sla_breaches`, `monitoring_service.check_correlation`

- [ ] **Step 1: Add job runner functions to `scheduler_service.py`**

Add the following two functions before `start_scheduler()` (around line 679):

```python
async def _nightly_collect_metrics() -> None:
    """Nightly job: collect row_count, freshness, null_rate for all active assets."""
    from app.db.database import AsyncSessionLocal
    from app.services.monitoring_service import collect_asset_metrics
    logger.info("Nightly metric collection starting")
    async with AsyncSessionLocal() as db:
        count = await collect_asset_metrics(db)
    logger.info("Nightly metric collection complete: %d rows written", count)


async def _nightly_predict_sla() -> None:
    """Nightly job: compute SLA breach forecasts for all assets with SLAConfig."""
    from app.db.database import AsyncSessionLocal
    from app.services.monitoring_service import predict_sla_breaches
    logger.info("Nightly SLA prediction starting")
    async with AsyncSessionLocal() as db:
        count = await predict_sla_breaches(db)
    logger.info("Nightly SLA prediction complete: %d predictions upserted", count)
```

- [ ] **Step 2: Register jobs in `start_scheduler()`**

In `start_scheduler()`, after the existing `scheduler.add_job(_nightly_auto_discovery, ...)` call, add:

```python
        scheduler.add_job(
            _nightly_predict_sla,
            trigger=CronTrigger(hour=0, minute=10, timezone="UTC"),
            id="nightly_predict_sla",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        scheduler.add_job(
            _nightly_collect_metrics,
            trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
            id="nightly_collect_metrics",
            replace_existing=True,
            misfire_grace_time=3600,
        )
```

- [ ] **Step 3: Add correlation check to `anomaly.py`**

In `app/api/anomaly.py`, in the `run_detector` endpoint, after the block that commits the detection (`await db.commit()` around line 95–96), add correlation check:

```python
        # Trigger correlation check (best-effort — never blocks the response)
        try:
            from app.services.monitoring_service import check_correlation
            await check_correlation(detector.asset_id, detection.detection_id, db)
        except Exception as _corr_err:
            logger.warning("Correlation check failed: %s", _corr_err)
```

The full patched block in `run_detector` (after `db.commit()`) should look like:

```python
        db.add(detection)
        detector.last_trained_at = _now()
        await db.commit()
        # Trigger correlation check (best-effort — never blocks the response)
        try:
            from app.services.monitoring_service import check_correlation
            await check_correlation(detector.asset_id, detection.detection_id, db)
        except Exception as _corr_err:
            logger.warning("Correlation check failed: %s", _corr_err)
        return {"anomaly_found": True, "detection_id": detection.detection_id,
                "z_score": round(z_score, 2), "observed": latest, "mean": round(mean, 2)}
```

Note: the `logger` import is already present in `anomaly.py` (add `import logging; logger = logging.getLogger("dq_platform.anomaly")` at top if missing).

- [ ] **Step 4: Verify scheduler imports cleanly**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "from app.services.scheduler_service import _nightly_collect_metrics, _nightly_predict_sla; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add app/services/scheduler_service.py app/api/anomaly.py
git commit -m "feat(monitoring): wire nightly scheduler jobs and anomaly correlation hook"
```

---

### Task 5: Frontend — useInterval Hook + Proxy Routes

**Files:**
- Create: `frontend/src/hooks/useInterval.ts`
- Create: `frontend/src/app/api/observability/freshness-board/route.ts`
- Create: `frontend/src/app/api/observability/quality-heatmap/route.ts`
- Create: `frontend/src/app/api/monitoring/sla-predictions/route.ts`
- Create: `frontend/src/app/api/monitoring/correlated-incidents/route.ts`
- Create: `frontend/src/app/api/monitoring/correlated-incidents/[id]/resolve/route.ts`

**Interfaces:**
- Produces `useInterval(callback: () => void, delay: number | null): void` — exported from `@/hooks/useInterval`

- [ ] **Step 1: Create `frontend/src/hooks/useInterval.ts`**

```typescript
// frontend/src/hooks/useInterval.ts
import { useEffect, useRef } from 'react'

export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null) return
    const id = setInterval(() => savedCallback.current(), delay)
    return () => clearInterval(id)
  }, [delay])
}
```

- [ ] **Step 2: Create `frontend/src/app/api/observability/freshness-board/route.ts`**

```typescript
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/observability/freshness-board`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json([])
  }
}
```

- [ ] **Step 3: Create `frontend/src/app/api/observability/quality-heatmap/route.ts`**

```typescript
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/observability/quality-heatmap`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ domains: [], dates: [], matrix: [] })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ domains: [], dates: [], matrix: [] })
  }
}
```

- [ ] **Step 4: Create `frontend/src/app/api/monitoring/sla-predictions/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const isAtRisk = searchParams.get('is_at_risk')
    let url = `${BACKEND}/monitoring/sla-predictions`
    if (isAtRisk !== null) url += `?is_at_risk=${isAtRisk}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json([])
  }
}
```

- [ ] **Step 5: Create `frontend/src/app/api/monitoring/correlated-incidents/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const status = searchParams.get('status') ?? 'open'
    const res = await fetch(`${BACKEND}/monitoring/correlated-incidents?status=${encodeURIComponent(status)}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json([])
  }
}
```

- [ ] **Step 6: Create `frontend/src/app/api/monitoring/correlated-incidents/[id]/resolve/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${BACKEND}/monitoring/correlated-incidents/${params.id}/resolve`, {
      method: 'POST',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | grep -E "hooks/useInterval|api/observability|api/monitoring" | head -20
```

Expected: no errors for the new files.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useInterval.ts \
  frontend/src/app/api/observability/freshness-board/route.ts \
  frontend/src/app/api/observability/quality-heatmap/route.ts \
  frontend/src/app/api/monitoring/sla-predictions/route.ts \
  frontend/src/app/api/monitoring/correlated-incidents/route.ts \
  "frontend/src/app/api/monitoring/correlated-incidents/[id]/resolve/route.ts"
git commit -m "feat(monitoring): add useInterval hook and frontend proxy routes for monitoring endpoints"
```

---

### Task 6: /observability Page

**Files:**
- Create: `frontend/src/app/observability/page.tsx`

**Interfaces:**
- Consumes from Task 5: proxy routes at `/api/observability/freshness-board`, `/api/observability/quality-heatmap`, `/api/monitoring/sla-predictions`, `/api/monitoring/correlated-incidents`
- Consumes from Task 5: `useInterval` from `@/hooks/useInterval`

- [ ] **Step 1: Create `frontend/src/app/observability/page.tsx`**

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useInterval } from '@/hooks/useInterval'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FreshnessEntry {
  rule_id: string
  rule_name: string
  asset_id: string
  last_run_time: string | null
  hours_since_last_run: number | null
  sla_threshold_hours: number
  status: 'on_time' | 'at_risk' | 'breached' | 'unknown'
}

interface SLAPrediction {
  prediction_id: string
  asset_id: string
  predicted_at: string
  breach_day: number | null
  breach_probability: number
  is_at_risk: boolean
  forecast_scores: number[] | null
}

interface HeatmapData {
  domains: { domain_id: string; domain_name: string }[]
  dates: string[]
  matrix: (number | null)[][]
}

interface CorrelatedIncident {
  incident_id: string
  detected_at: string
  window_start: string
  window_end: string
  asset_ids: string[]
  asset_count: number
  severity: string
  status: string
  resolved_at: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const POLL_MS = 30_000

function statusColor(status: FreshnessEntry['status']) {
  if (status === 'on_time')  return { bg: 'var(--status-ok-bg)',   text: 'var(--status-ok-text)',   border: '#86efac' }
  if (status === 'at_risk')  return { bg: 'var(--status-warn-bg)', text: 'var(--status-warn-text)', border: '#fde68a' }
  if (status === 'breached') return { bg: 'var(--status-error-bg)', text: 'var(--status-error-text)', border: '#fca5a5' }
  return { bg: 'var(--surface)', text: 'var(--text-muted)', border: 'var(--border)' }
}

function heatColor(score: number | null): string {
  if (score === null) return 'var(--surface-muted)'
  if (score >= 90) return '#bbf7d0'
  if (score >= 75) return '#fef08a'
  if (score >= 60) return '#fed7aa'
  return '#fecaca'
}

function severityStyle(s: string) {
  if (s === 'high' || s === 'critical') return { bg: 'var(--status-error-bg)', text: 'var(--status-error-text)' }
  return { bg: 'var(--status-warn-bg)', text: 'var(--status-warn-text)' }
}

function fmtTime(iso: string) {
  return iso.replace('T', ' ').slice(0, 16)
}

// ── Sections ───────────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, lastUpdated }: { title: string; subtitle?: string; lastUpdated: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
      <div>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--foreground)' }}>{title}</span>
        {subtitle && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginLeft: '8px' }}>{subtitle}</span>}
      </div>
      {lastUpdated && (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Updated {lastUpdated}</span>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const [freshness, setFreshness]       = useState<FreshnessEntry[]>([])
  const [predictions, setPredictions]   = useState<SLAPrediction[]>([])
  const [heatmap, setHeatmap]           = useState<HeatmapData>({ domains: [], dates: [], matrix: [] })
  const [incidents, setIncidents]       = useState<CorrelatedIncident[]>([])
  const [freshnessUpdated, setFreshnessUpdated] = useState<string | null>(null)
  const [predictionsUpdated, setPredictionsUpdated] = useState<string | null>(null)
  const [heatmapUpdated, setHeatmapUpdated] = useState<string | null>(null)
  const [incidentsUpdated, setIncidentsUpdated] = useState<string | null>(null)
  const [resolvingId, setResolvingId]   = useState<string | null>(null)

  const now = () => new Date().toLocaleTimeString()

  const loadFreshness = useCallback(() => {
    fetch('/api/observability/freshness-board', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((d: FreshnessEntry[]) => { setFreshness(d); setFreshnessUpdated(now()) })
      .catch(() => {})
  }, [])

  const loadPredictions = useCallback(() => {
    fetch('/api/monitoring/sla-predictions?is_at_risk=true', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((d: SLAPrediction[]) => { setPredictions(d); setPredictionsUpdated(now()) })
      .catch(() => {})
  }, [])

  const loadHeatmap = useCallback(() => {
    fetch('/api/observability/quality-heatmap', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { domains: [], dates: [], matrix: [] })
      .then((d: HeatmapData) => { setHeatmap(d); setHeatmapUpdated(now()) })
      .catch(() => {})
  }, [])

  const loadIncidents = useCallback(() => {
    fetch('/api/monitoring/correlated-incidents', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((d: CorrelatedIncident[]) => { setIncidents(d); setIncidentsUpdated(now()) })
      .catch(() => {})
  }, [])

  // Initial load
  useEffect(() => {
    loadFreshness(); loadPredictions(); loadHeatmap(); loadIncidents()
  }, [loadFreshness, loadPredictions, loadHeatmap, loadIncidents])

  // 30s polling
  useInterval(loadFreshness,   POLL_MS)
  useInterval(loadPredictions, POLL_MS)
  useInterval(loadHeatmap,     POLL_MS)
  useInterval(loadIncidents,   POLL_MS)

  async function resolveIncident(id: string) {
    setResolvingId(id)
    try {
      await fetch(`/api/monitoring/correlated-incidents/${id}/resolve`, { method: 'POST' })
      loadIncidents()
    } catch {}
    setResolvingId(null)
  }

  const breachedCount = freshness.filter(f => f.status === 'breached').length
  const atRiskCount   = freshness.filter(f => f.status === 'at_risk').length

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'var(--background)', minHeight: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--foreground)' }}>Observability</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
          {freshness.length} assets monitored · {breachedCount} breached · {atRiskCount} at risk · polls every 30s
        </div>
      </div>

      {/* ── Section 1: Freshness Board ── */}
      <div>
        <SectionHeader
          title="Freshness Board"
          subtitle={`${freshness.length} rules`}
          lastUpdated={freshnessUpdated}
        />
        {freshness.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: '20px 0' }}>
            No freshness rules configured — create <code>freshness_check</code> rules on assets to monitor them.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
            {freshness.map(f => {
              const c = statusColor(f.status)
              return (
                <div key={f.rule_id} style={{
                  background: c.bg, border: `1px solid ${c.border}`, borderRadius: '8px',
                  padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '4px',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: c.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {f.status.replace('_', ' ')}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.rule_name}>
                    {f.rule_name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {f.hours_since_last_run !== null
                      ? `${f.hours_since_last_run}h ago / ${f.sla_threshold_hours}h SLA`
                      : 'Never run'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 2: SLA Breach Forecast ── */}
      <div>
        <SectionHeader
          title="SLA Breach Forecast"
          subtitle="next 7 days"
          lastUpdated={predictionsUpdated}
        />
        {predictions.length === 0 ? (
          <div style={{ color: 'var(--status-ok-text)', background: 'var(--status-ok-bg)', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)' }}>
            All assets on track for the next 7 days.
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px', gap: '0 8px', padding: '6px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              {['Asset', 'Breach Day', 'Probability', 'Forecast'].map(h => (
                <span key={h} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
              ))}
            </div>
            {predictions.map(p => (
              <div key={p.prediction_id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px', gap: '0 8px', padding: '8px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.asset_id}</span>
                <span style={{ fontSize: '11px', color: 'var(--status-error-text)', fontWeight: 600 }}>
                  {p.breach_day !== null ? `Day ${p.breach_day + 1}` : '—'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--foreground)' }}>
                  {Math.round((p.breach_probability ?? 0) * 100)}%
                </span>
                <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                  {(p.forecast_scores ?? []).slice(0, 7).map((s, i) => (
                    <div key={i} title={`Day ${i + 1}: ${s}`} style={{
                      width: '10px', height: `${Math.max(4, Math.round(s / 10))}px`,
                      background: s >= 90 ? '#86efac' : s >= 75 ? '#fde68a' : '#fca5a5',
                      borderRadius: '1px',
                    }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: Quality Heatmap ── */}
      <div>
        <SectionHeader
          title="Quality Heatmap"
          subtitle="7-day domain × date"
          lastUpdated={heatmapUpdated}
        />
        {heatmap.domains.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', padding: '20px 0' }}>No domain quality data available.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>Domain</th>
                  {heatmap.dates.map(d => (
                    <th key={d} style={{ padding: '4px 6px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)', minWidth: '44px' }}>
                      {d.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.domains.map((dom, ri) => (
                  <tr key={dom.domain_id}>
                    <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>
                      {dom.domain_name}
                    </td>
                    {(heatmap.matrix[ri] ?? []).map((score, ci) => (
                      <td key={ci} style={{
                        padding: '4px 6px', textAlign: 'center', background: heatColor(score),
                        borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)',
                        color: score !== null ? '#374151' : 'var(--text-muted)', fontWeight: 600,
                      }}>
                        {score !== null ? score : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 4: Correlated Incidents ── */}
      <div>
        <SectionHeader
          title="Correlated Incidents"
          subtitle="open incidents"
          lastUpdated={incidentsUpdated}
        />
        {incidents.length === 0 ? (
          <div style={{ color: 'var(--status-ok-text)', background: 'var(--status-ok-bg)', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)' }}>
            No correlated incidents detected.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {incidents.map(inc => {
              const sc = severityStyle(inc.severity)
              return (
                <div key={inc.incident_id} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                  <span style={{ background: sc.bg, color: sc.text, padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
                    {inc.severity}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)' }}>
                      {inc.asset_count} tables degraded simultaneously
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {fmtTime(inc.detected_at)} · window {fmtTime(inc.window_start)} – {fmtTime(inc.window_end)}
                    </div>
                  </div>
                  <button
                    onClick={() => resolveIncident(inc.incident_id)}
                    disabled={resolvingId === inc.incident_id}
                    style={{
                      background: 'var(--surface-muted)', border: '1px solid var(--border)',
                      borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                      color: 'var(--foreground)', opacity: resolvingId === inc.incident_id ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {resolvingId === inc.incident_id ? 'Resolving…' : 'Resolve'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | grep "observability/page" | head -10
```

Expected: no errors for `observability/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/observability/page.tsx
git commit -m "feat(monitoring): add /observability monitoring hub page with 30s polling"
```

---

### Task 7: Dashboard Banner + Sidebar Entry

**Files:**
- Modify: `frontend/src/app/page.tsx` (add correlated incident banner with 60s polling)
- Modify: `frontend/src/components/Sidebar.tsx` (add `/observability` to `SECTION_KEY_MAP`)

**Interfaces:**
- Consumes from Task 5: `/api/monitoring/correlated-incidents` proxy route
- Consumes from Task 5: `useInterval` from `@/hooks/useInterval`

- [ ] **Step 1: Update `frontend/src/app/page.tsx` to add the incident banner**

Replace the entire file contents with:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Dashboard from '@/components/dashboard/Dashboard'
import { useInterval } from '@/hooks/useInterval'
import type { DashboardStats } from '@/lib/types'

const EMPTY: DashboardStats = {
  overallScore:      null,
  totalAssets:       0,
  totalRules:        0,
  openAlerts:        0,
  criticalAlerts:    0,
  mediumAlerts:      0,
  passed:            0,
  failed:            0,
  trend:             [],
  dimensions:        { completeness: null, accuracy: null, uniqueness: null, validity: null, timeliness: null, consistency: null },
  failingRules:      [],
  atRiskTables:      [],
  activeConnections: 0,
  recentChecks:      [],
}

interface CorrelatedIncident {
  incident_id: string
  asset_count: number
  severity: string
}

export default function HomePage() {
  const [stats, setStats]             = useState<DashboardStats>(EMPTY)
  const [incidents, setIncidents]     = useState<CorrelatedIncident[]>([])
  const [dismissed, setDismissed]     = useState(false)

  useEffect(() => {
    fetch('/api/dashboard', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data: Partial<DashboardStats>) => setStats({ ...EMPTY, ...data }))
      .catch(err => console.error('Dashboard fetch failed:', err))
  }, [])

  const loadIncidents = useCallback(() => {
    fetch('/api/monitoring/correlated-incidents', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((d: CorrelatedIncident[]) => {
        setIncidents(Array.isArray(d) ? d : [])
        // Reset dismissed state when new incidents arrive (count changed)
        if (Array.isArray(d) && d.length > 0) setDismissed(false)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { loadIncidents() }, [loadIncidents])
  useInterval(loadIncidents, 60_000)

  const showBanner = incidents.length > 0 && !dismissed
  const highSeverity = incidents.some(i => i.severity === 'high' || i.severity === 'critical')

  return (
    <>
      {showBanner && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: highSeverity ? 'var(--status-error-bg)' : 'var(--status-warn-bg)',
          borderBottom: `1px solid ${highSeverity ? '#fca5a5' : '#fde68a'}`,
          padding: '8px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
        }}>
          <span style={{ fontSize: '12.5px', fontWeight: 600, color: highSeverity ? 'var(--status-error-text)' : 'var(--status-warn-text)' }}>
            ⚡ {incidents.length === 1
              ? `${incidents[0].asset_count} tables degraded simultaneously`
              : `${incidents.length} correlated incidents detected`} — possible upstream failure.
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            <Link href="/observability" style={{
              fontSize: '12px', fontWeight: 700,
              color: highSeverity ? 'var(--status-error-text)' : 'var(--status-warn-text)',
              textDecoration: 'underline',
            }}>
              View Observability →
            </Link>
            <button
              onClick={() => setDismissed(true)}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: '14px', color: highSeverity ? 'var(--status-error-text)' : 'var(--status-warn-text)',
                lineHeight: 1, padding: '0 2px',
              }}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <Dashboard stats={stats} />
    </>
  )
}
```

- [ ] **Step 2: Update `SECTION_KEY_MAP` in `frontend/src/components/Sidebar.tsx`**

Find the line (around line 354):
```typescript
  '/alerts': 'operations', '/incidents': 'operations', '/audit-logs': 'operations',
```

Change it to:
```typescript
  '/alerts': 'operations', '/incidents': 'operations', '/audit-logs': 'operations', '/observability': 'operations',
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npx tsc --noEmit 2>&1 | grep -E "page\.tsx|Sidebar" | head -10
```

Expected: no errors for the modified files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat(monitoring): add correlated incident banner to dashboard and sidebar navigation entry"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Nightly metric collection job (row count, freshness, null rate) | Tasks 1, 2, 4 |
| SLA breach prediction via forecast_service, nightly, DB-stored | Tasks 1, 2, 4 |
| Cross-table correlation: 3+ assets in 15-min window | Tasks 1, 2, 4 |
| 30-second polling in frontend | Tasks 5, 6 |
| `/observability` page with 4 sections | Task 6 |
| Correlated incident banner on main dashboard, 60s poll | Task 7 |
| Sidebar navigation entry | Task 7 |
| useInterval hook | Task 5 |
| 5 frontend proxy routes | Task 5 |
| monitoring.py router with 4 endpoints | Task 3 |
| main.py wiring | Task 3 |

All requirements covered.

### Type consistency check

- `collect_asset_metrics(db: AsyncSession) -> int` — defined Task 2, used Task 4 ✓
- `predict_sla_breaches(db: AsyncSession) -> int` — defined Task 2, used Task 4 ✓
- `check_correlation(asset_id: str, detection_id: str, db: AsyncSession) -> Optional[str]` — defined Task 2, used Task 4 ✓
- `useInterval(callback: () => void, delay: number | null): void` — defined Task 5, used Tasks 6, 7 ✓
- Proxy routes match endpoint paths — verified Task 3 vs Task 5 ✓
- `CorrelatedIncident` TypeScript type uses `incident_id`, `asset_count`, `severity` — matches `_fmt_incident` dict keys in Task 3 ✓
