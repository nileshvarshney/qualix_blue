# Results Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a results storage layer for scan runs that supports latest-result lookup, historical trend queries, run comparison, and evidence links — all tied to existing scan job runs and assets.

**Architecture:** Seven new DB tables extend the existing scan infrastructure (`scan_job_runs`, `assets`, `asset_metadata_snapshots`) without touching them. A `results_store` service provides all write and read operations. A `scan_results` API router exposes the queries. The scan orchestrator and metadata store are minimally wired to populate results on each run.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy ORM (sync + SnowflakeAsyncSession wrapper), Snowflake VARIANT for JSON columns, Pydantic v2, pytest + AsyncMock for tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Modify** | `app/db/models.py` | Append 7 new ORM models |
| **Create** | `migrations/versions/0016_results_storage.py` | DDL for the 7 new tables |
| **Create** | `app/schemas/scan_result.py` | Pydantic response schemas |
| **Create** | `app/services/results_store.py` | All read/write for results layer |
| **Modify** | `app/services/metadata_store.py` | Accept optional `scan_run_id` in `record_scan_result` |
| **Modify** | `app/services/discovery_service.py` | Extract `scan_run_id` from payload; forward to `record_scan_result` |
| **Modify** | `app/services/scan_orchestrator.py` | Call `results_store.write_run_summary` after execution |
| **Create** | `app/api/scan_results.py` | 8-endpoint REST router |
| **Modify** | `app/main.py` | Register `scan_results` router |
| **Create** | `tests/test_results_store.py` | Service-layer unit tests |
| **Create** | `tests/test_scan_results_api.py` | Schema + API-layer unit tests |

---

## Entity Relationships

```
scan_jobs ─────────────┐
                        │ job_id
scan_job_runs ──────────┤
    │ run_id             │
    │                   ▼
    ├──► scan_run_summaries          (1:1 per run)
    │
    ├──► asset_scan_summaries        (1:N, one per asset touched in run)
    │        │ asset_id ──► assets
    │
    ├──► scan_metrics_history        (N per run — one row per (asset, metric))
    │        │ asset_id ──► assets
    │
    ├──► scan_evidence_logs          (N per run — diagnostics/evidence)
    │        │ asset_id ──► assets (nullable)
    │
    ├──► profiling_result_placeholders   (Phase 2 — per column)
    │        │ asset_id ──► assets
    │
    ├──► rule_result_placeholders        (Phase 2 — per rule)
    │        │ asset_id ──► assets
    │
    └──► failed_sample_record_placeholders  (Phase 2 — per sample)
             │ asset_id ──► assets
```

---

## Task 1: ORM Models

**Files:**
- Modify: `app/db/models.py` (append after `ScanJobRunLog` class, line ~1118)

- [ ] **Step 1: Write the model tests**

Create `tests/test_results_store.py` with the model smoke tests (the file will grow in Task 10; start it now):

```python
# tests/test_results_store.py
from __future__ import annotations


def test_scan_run_summary_model():
    from app.db.models import ScanRunSummary
    s = ScanRunSummary(run_id="run-001", job_id="job-001")
    assert s.summary_id is not None
    assert len(s.summary_id) == 36
    assert s.new_assets_count == 0
    assert s.updated_assets_count == 0
    assert s.failed_assets_count == 0
    assert s.schema_changes_count == 0


def test_asset_scan_summary_model():
    from app.db.models import AssetScanSummary
    a = AssetScanSummary(run_id="run-001", asset_id="asset-001", job_id="job-001")
    assert a.asset_summary_id is not None
    assert a.scan_status == "succeeded"


def test_scan_metrics_history_model():
    from app.db.models import ScanMetricsHistory
    m = ScanMetricsHistory(asset_id="asset-001", metric_name="row_count", metric_value_num=1000.0)
    assert m.metric_id is not None
    assert m.metric_name == "row_count"


def test_scan_evidence_log_model():
    from app.db.models import ScanEvidenceLog
    e = ScanEvidenceLog(run_id="run-001", evidence_type="schema_drift", severity="warning", message="col dropped")
    assert e.evidence_id is not None
    assert e.severity == "warning"


def test_profiling_result_placeholder_model():
    from app.db.models import ProfilingResultPlaceholder
    p = ProfilingResultPlaceholder(run_id="run-001", asset_id="asset-001", column_name="email")
    assert p.profiling_id is not None
    assert p.is_placeholder is True


def test_rule_result_placeholder_model():
    from app.db.models import RuleResultPlaceholder
    r = RuleResultPlaceholder(run_id="run-001", asset_id="asset-001", rule_name="not_null", rule_type="completeness")
    assert r.result_id is not None
    assert r.status == "pending"


def test_failed_sample_placeholder_model():
    from app.db.models import FailedSampleRecordPlaceholder
    f = FailedSampleRecordPlaceholder(run_id="run-001", asset_id="asset-001")
    assert f.sample_id is not None
    assert f.is_placeholder is True
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd /Users/laxmansrigiri/git_repo/DataGuard
pytest tests/test_results_store.py -v
```

Expected: `ImportError` or `AttributeError` — models don't exist yet.

- [ ] **Step 3: Append models to `app/db/models.py`**

Open `app/db/models.py` and append after the last line (after `ScanJobRunLog.__init__`):

```python
# ---------------------------------------------------------------------------
# §M5  Results Storage
# ---------------------------------------------------------------------------

class ScanRunSummary(Base):
    """Enriched summary for a completed scan run. One row per ScanJobRun."""
    __tablename__ = "scan_run_summaries"

    summary_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"),
        nullable=False, unique=True,
    )
    job_id: Mapped[str] = mapped_column(String(36), nullable=False)
    connection_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    scan_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_assets_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_assets_count: Mapped[int] = mapped_column(Integer, default=0)
    removed_assets_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_assets_count: Mapped[int] = mapped_column(Integer, default=0)
    schema_changes_count: Mapped[int] = mapped_column(Integer, default=0)
    quality_score_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    scan_parameters: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    run: Mapped["ScanJobRun"] = relationship("ScanJobRun")

    def __init__(self, **kwargs):
        kwargs.setdefault("summary_id", gen_uuid())
        super().__init__(**kwargs)


class AssetScanSummary(Base):
    """Per-asset outcome for a specific run. Written by metadata_store.record_scan_result."""
    __tablename__ = "asset_scan_summaries"

    asset_summary_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    scan_status: Mapped[str] = mapped_column(String(20), nullable=False, default="succeeded")
    scan_duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    column_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    schema_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    columns_added: Mapped[int] = mapped_column(Integer, default=0)
    columns_removed: Mapped[int] = mapped_column(Integer, default=0)
    columns_changed: Mapped[int] = mapped_column(Integer, default=0)
    schema_drift_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Phase 2 placeholders — NULL until profiling/rule engines run
    quality_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    null_ratio_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distinct_ratio_avg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volume_change_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    freshness_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("asset_summary_id", gen_uuid())
        super().__init__(**kwargs)


class ScanMetricsHistory(Base):
    """One row per (asset, run, metric_name). Supports trend queries."""
    __tablename__ = "scan_metrics_history"

    metric_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False
    )
    run_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="SET NULL"), nullable=True
    )
    metric_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value_num: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    metric_value_str: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("metric_id", gen_uuid())
        super().__init__(**kwargs)


class ScanEvidenceLog(Base):
    """Structured diagnostics and evidence attached to a run or asset."""
    __tablename__ = "scan_evidence_logs"

    evidence_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="SET NULL"), nullable=True
    )
    evidence_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    retention_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("evidence_id", gen_uuid())
        super().__init__(**kwargs)


class ProfilingResultPlaceholder(Base):
    """Per-column profiling result. Populated by Phase 2 profiling engine."""
    __tablename__ = "profiling_result_placeholders"

    profiling_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False
    )
    column_name: Mapped[str] = mapped_column(String(200), nullable=False)
    null_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    null_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distinct_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    distinct_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avg_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    std_dev: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    top_values: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    pattern_frequency: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
    profiled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("profiling_id", gen_uuid())
        super().__init__(**kwargs)


class RuleResultPlaceholder(Base):
    """Per-rule evaluation result linked to a scan run. Populated by Phase 2 rule engine."""
    __tablename__ = "rule_result_placeholders"

    result_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False
    )
    rule_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("dq_rules.rule_id", ondelete="SET NULL"), nullable=True
    )
    rule_name: Mapped[str] = mapped_column(String(200), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    rows_scanned: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    rows_failed: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    failure_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("result_id", gen_uuid())
        super().__init__(**kwargs)


class FailedSampleRecordPlaceholder(Base):
    """Evidence record for a failed row. Populated by Phase 2. Has retention TTL."""
    __tablename__ = "failed_sample_record_placeholders"

    sample_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False
    )
    rule_result_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("rule_result_placeholders.result_id", ondelete="SET NULL"),
        nullable=True,
    )
    failed_record: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    retention_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_placeholder: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    def __init__(self, **kwargs):
        kwargs.setdefault("sample_id", gen_uuid())
        super().__init__(**kwargs)
```

- [ ] **Step 4: Run model smoke tests**

```
pytest tests/test_results_store.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py tests/test_results_store.py
git commit -m "feat(results-storage): add 7 ORM models for results storage layer"
```

---

## Task 2: Migration

**Files:**
- Create: `migrations/versions/0016_results_storage.py`

- [ ] **Step 1: Write the migration file**

```python
# migrations/versions/0016_results_storage.py
"""Add results storage tables: scan_run_summaries, asset_scan_summaries,
scan_metrics_history, scan_evidence_logs, and three Phase-2 placeholders.

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-10
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'scan_run_summaries',
        sa.Column('summary_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'),
                  nullable=False, unique=True),
        sa.Column('job_id', sa.String(36), nullable=False),
        sa.Column('connection_id', sa.String(36), nullable=True),
        sa.Column('scan_type', sa.String(50), nullable=True),
        sa.Column('new_assets_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_assets_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('removed_assets_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_assets_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('schema_changes_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('quality_score_avg', sa.Float(), nullable=True),
        sa.Column('scan_parameters', VARIANT(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'asset_scan_summaries',
        sa.Column('asset_summary_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('job_id', sa.String(36), nullable=True),
        sa.Column('scan_status', sa.String(20), nullable=False, server_default='succeeded'),
        sa.Column('scan_duration_ms', sa.Integer(), nullable=True),
        sa.Column('row_count', sa.BigInteger(), nullable=True),
        sa.Column('bytes', sa.BigInteger(), nullable=True),
        sa.Column('column_count', sa.Integer(), nullable=True),
        sa.Column('schema_hash', sa.String(64), nullable=True),
        sa.Column('columns_added', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('columns_removed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('columns_changed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('schema_drift_detected', sa.Boolean(), nullable=False, server_default='FALSE'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('quality_score', sa.Float(), nullable=True),
        sa.Column('null_ratio_avg', sa.Float(), nullable=True),
        sa.Column('distinct_ratio_avg', sa.Float(), nullable=True),
        sa.Column('volume_change_pct', sa.Float(), nullable=True),
        sa.Column('freshness_hours', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'scan_metrics_history',
        sa.Column('metric_id', sa.String(36), primary_key=True),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='SET NULL'), nullable=True),
        sa.Column('metric_date', sa.Date(), nullable=True),
        sa.Column('metric_name', sa.String(100), nullable=False),
        sa.Column('metric_value_num', sa.Float(), nullable=True),
        sa.Column('metric_value_str', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'scan_evidence_logs',
        sa.Column('evidence_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='SET NULL'), nullable=True),
        sa.Column('evidence_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='info'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('payload', VARIANT(), nullable=True),
        sa.Column('retention_expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'profiling_result_placeholders',
        sa.Column('profiling_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('column_name', sa.String(200), nullable=False),
        sa.Column('null_count', sa.BigInteger(), nullable=True),
        sa.Column('null_ratio', sa.Float(), nullable=True),
        sa.Column('distinct_count', sa.BigInteger(), nullable=True),
        sa.Column('distinct_ratio', sa.Float(), nullable=True),
        sa.Column('min_value', sa.Text(), nullable=True),
        sa.Column('max_value', sa.Text(), nullable=True),
        sa.Column('avg_value', sa.Float(), nullable=True),
        sa.Column('std_dev', sa.Float(), nullable=True),
        sa.Column('top_values', VARIANT(), nullable=True),
        sa.Column('pattern_frequency', VARIANT(), nullable=True),
        sa.Column('is_placeholder', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('profiled_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'rule_result_placeholders',
        sa.Column('result_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('rule_id', sa.String(36),
                  sa.ForeignKey('dq_rules.rule_id', ondelete='SET NULL'), nullable=True),
        sa.Column('rule_name', sa.String(200), nullable=False),
        sa.Column('rule_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('rows_scanned', sa.BigInteger(), nullable=True),
        sa.Column('rows_failed', sa.BigInteger(), nullable=True),
        sa.Column('failure_pct', sa.Float(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('is_placeholder', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'failed_sample_record_placeholders',
        sa.Column('sample_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('rule_result_id', sa.String(36),
                  sa.ForeignKey('rule_result_placeholders.result_id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('failed_record', VARIANT(), nullable=True),
        sa.Column('retention_expires_at', sa.DateTime(), nullable=True),
        sa.Column('is_placeholder', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('failed_sample_record_placeholders')
    op.drop_table('rule_result_placeholders')
    op.drop_table('profiling_result_placeholders')
    op.drop_table('scan_evidence_logs')
    op.drop_table('scan_metrics_history')
    op.drop_table('asset_scan_summaries')
    op.drop_table('scan_run_summaries')
```

- [ ] **Step 2: Verify migration file exists**

```
pytest tests/test_results_store.py -v
```

Expected: Still 7 PASS (migration file doesn't affect unit tests).

- [ ] **Step 3: Add migration existence test to `tests/test_results_store.py`**

Append to `tests/test_results_store.py`:

```python
def test_migration_0016_exists():
    import os
    assert os.path.exists("migrations/versions/0016_results_storage.py")
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_results_store.py -v
```

Expected: 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations/versions/0016_results_storage.py tests/test_results_store.py
git commit -m "feat(results-storage): add migration 0016 for 7 results storage tables"
```

---

## Task 3: Pydantic Schemas

**Files:**
- Create: `app/schemas/scan_result.py`

- [ ] **Step 1: Write schema validation tests**

Create `tests/test_scan_results_api.py`:

```python
# tests/test_scan_results_api.py
from __future__ import annotations


def test_scan_run_summary_out_required_fields():
    from app.schemas.scan_result import ScanRunSummaryOut
    s = ScanRunSummaryOut(
        summary_id="sum-001",
        run_id="run-001",
        job_id="job-001",
        new_assets_count=3,
        updated_assets_count=5,
        removed_assets_count=0,
        failed_assets_count=1,
        schema_changes_count=2,
        created_at="2026-06-10T10:00:00",
    )
    assert s.run_id == "run-001"
    assert s.new_assets_count == 3


def test_asset_scan_summary_out():
    from app.schemas.scan_result import AssetScanSummaryOut
    a = AssetScanSummaryOut(
        asset_summary_id="asm-001",
        run_id="run-001",
        asset_id="asset-001",
        scan_status="succeeded",
        created_at="2026-06-10T10:00:00",
    )
    assert a.scan_status == "succeeded"
    assert a.quality_score is None


def test_metrics_history_point():
    from app.schemas.scan_result import MetricsHistoryPoint
    m = MetricsHistoryPoint(
        metric_id="m-001",
        asset_id="asset-001",
        metric_name="row_count",
        metric_value_num=10000.0,
        created_at="2026-06-10T10:00:00",
    )
    assert m.metric_name == "row_count"
    assert m.metric_value_num == 10000.0


def test_run_comparison_out():
    from app.schemas.scan_result import RunComparisonOut, ScanRunSummaryOut

    def _summary(run_id: str, new_assets: int) -> ScanRunSummaryOut:
        return ScanRunSummaryOut(
            summary_id=f"sum-{run_id}",
            run_id=run_id,
            job_id="job-001",
            new_assets_count=new_assets,
            updated_assets_count=0,
            removed_assets_count=0,
            failed_assets_count=0,
            schema_changes_count=0,
            created_at="2026-06-10T10:00:00",
        )

    cmp = RunComparisonOut(
        run_a=_summary("run-001", 5),
        run_b=_summary("run-002", 8),
        delta={"new_assets_delta": 3},
    )
    assert cmp.delta["new_assets_delta"] == 3


def test_evidence_log_out():
    from app.schemas.scan_result import ScanEvidenceLogOut
    e = ScanEvidenceLogOut(
        evidence_id="ev-001",
        run_id="run-001",
        evidence_type="schema_drift",
        severity="warning",
        message="column dropped",
        created_at="2026-06-10T10:00:00",
    )
    assert e.severity == "warning"
```

- [ ] **Step 2: Run tests to verify failure**

```
pytest tests/test_scan_results_api.py -v
```

Expected: `ImportError` — schemas don't exist yet.

- [ ] **Step 3: Create `app/schemas/scan_result.py`**

```python
# app/schemas/scan_result.py
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class ScanRunSummaryOut(BaseModel):
    summary_id: str
    run_id: str
    job_id: str
    connection_id: Optional[str] = None
    scan_type: Optional[str] = None
    new_assets_count: int = 0
    updated_assets_count: int = 0
    removed_assets_count: int = 0
    failed_assets_count: int = 0
    schema_changes_count: int = 0
    quality_score_avg: Optional[float] = None
    scan_parameters: Optional[dict] = None
    created_at: Any

    model_config = {"from_attributes": True}


class AssetScanSummaryOut(BaseModel):
    asset_summary_id: str
    run_id: str
    asset_id: str
    job_id: Optional[str] = None
    scan_status: str = "succeeded"
    scan_duration_ms: Optional[int] = None
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    column_count: Optional[int] = None
    schema_hash: Optional[str] = None
    columns_added: int = 0
    columns_removed: int = 0
    columns_changed: int = 0
    schema_drift_detected: bool = False
    error_message: Optional[str] = None
    quality_score: Optional[float] = None
    null_ratio_avg: Optional[float] = None
    distinct_ratio_avg: Optional[float] = None
    volume_change_pct: Optional[float] = None
    freshness_hours: Optional[float] = None
    created_at: Any

    model_config = {"from_attributes": True}


class MetricsHistoryPoint(BaseModel):
    metric_id: str
    asset_id: str
    run_id: Optional[str] = None
    metric_date: Optional[Any] = None
    metric_name: str
    metric_value_num: Optional[float] = None
    metric_value_str: Optional[str] = None
    created_at: Any

    model_config = {"from_attributes": True}


class ScanEvidenceLogOut(BaseModel):
    evidence_id: str
    run_id: str
    asset_id: Optional[str] = None
    evidence_type: str
    severity: str = "info"
    message: str
    payload: Optional[dict] = None
    retention_expires_at: Optional[Any] = None
    created_at: Any

    model_config = {"from_attributes": True}


class RunComparisonOut(BaseModel):
    run_a: ScanRunSummaryOut
    run_b: ScanRunSummaryOut
    delta: dict[str, Any]
```

- [ ] **Step 4: Run schema tests**

```
pytest tests/test_scan_results_api.py -v
```

Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add app/schemas/scan_result.py tests/test_scan_results_api.py
git commit -m "feat(results-storage): add Pydantic response schemas for scan results"
```

---

## Task 4: Results Store Service

**Files:**
- Create: `app/services/results_store.py`

This service owns all writes and reads for the results layer.

- [ ] **Step 1: Write service unit tests**

Append to `tests/test_results_store.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ─── write_run_summary ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_write_run_summary_creates_record():
    from app.services.results_store import write_run_summary

    mock_run = MagicMock()
    mock_run.run_id = "run-001"
    mock_run.job_id = "job-001"
    mock_run.status = "succeeded"
    mock_run.assets_scanned = 10
    mock_run.errors_count = 0
    mock_run.result_summary = {"tables_scanned": 10, "tables_failed": 0}

    mock_job = MagicMock()
    mock_job.connection_id = "conn-001"
    mock_job.job_type = "metadata_discovery"

    db = AsyncMock()
    db.get.side_effect = [mock_run, mock_job]
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    await write_run_summary("run-001", db)

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    from app.db.models import ScanRunSummary
    assert isinstance(added, ScanRunSummary)
    assert added.run_id == "run-001"
    assert added.scan_type == "metadata_discovery"


@pytest.mark.asyncio
async def test_write_run_summary_skips_when_run_missing():
    from app.services.results_store import write_run_summary

    db = AsyncMock()
    db.get.return_value = None

    await write_run_summary("ghost-run", db)

    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_write_run_summary_skips_duplicate():
    from app.services.results_store import write_run_summary

    mock_run = MagicMock()
    mock_run.run_id = "run-001"
    mock_run.job_id = "job-001"
    mock_run.status = "succeeded"
    mock_run.assets_scanned = 5
    mock_run.errors_count = 0
    mock_run.result_summary = None

    mock_job = MagicMock()
    mock_job.connection_id = "conn-001"
    mock_job.job_type = "metadata_discovery"

    existing_summary = MagicMock()
    db = AsyncMock()
    db.get.side_effect = [mock_run, mock_job]
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=existing_summary)

    await write_run_summary("run-001", db)

    db.add.assert_not_called()


# ─── write_asset_summary ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_write_asset_summary_creates_record():
    from app.services.results_store import write_asset_summary

    db = AsyncMock()
    await write_asset_summary(
        db=db,
        run_id="run-001",
        asset_id="asset-001",
        job_id="job-001",
        scan_status="succeeded",
        scan_duration_ms=250,
        row_count=5000,
        bytes=102400,
        column_count=12,
        schema_hash="abc123",
    )

    db.add.assert_called_once()
    from app.db.models import AssetScanSummary
    added = db.add.call_args[0][0]
    assert isinstance(added, AssetScanSummary)
    assert added.run_id == "run-001"
    assert added.scan_status == "succeeded"
    assert added.row_count == 5000


# ─── record_metrics ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_record_metrics_writes_rows():
    from app.services.results_store import record_metrics
    from datetime import date

    db = AsyncMock()
    await record_metrics(
        db=db,
        asset_id="asset-001",
        run_id="run-001",
        metric_date=date(2026, 6, 10),
        metrics={"row_count": 1000.0, "column_count": 15.0},
    )

    assert db.add.call_count == 2
    from app.db.models import ScanMetricsHistory
    calls = [c[0][0] for c in db.add.call_args_list]
    names = {m.metric_name for m in calls}
    assert names == {"row_count", "column_count"}


@pytest.mark.asyncio
async def test_record_metrics_skips_none_values():
    from app.services.results_store import record_metrics
    from datetime import date

    db = AsyncMock()
    await record_metrics(
        db=db,
        asset_id="asset-001",
        run_id="run-001",
        metric_date=date(2026, 6, 10),
        metrics={"row_count": 500.0, "quality_score": None},
    )

    assert db.add.call_count == 1


# ─── append_evidence ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_append_evidence_creates_log():
    from app.services.results_store import append_evidence

    db = AsyncMock()
    await append_evidence(
        db=db,
        run_id="run-001",
        evidence_type="schema_drift",
        severity="warning",
        message="Column 'email' was dropped",
        asset_id="asset-001",
        payload={"column": "email", "change": "dropped"},
    )

    db.add.assert_called_once()
    from app.db.models import ScanEvidenceLog
    added = db.add.call_args[0][0]
    assert isinstance(added, ScanEvidenceLog)
    assert added.severity == "warning"
    assert added.asset_id == "asset-001"


# ─── get_run_summary ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_run_summary_returns_record():
    from app.services.results_store import get_run_summary

    mock_summary = MagicMock()
    mock_summary.run_id = "run-001"
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=mock_summary)

    result = await get_run_summary(db, "run-001")

    assert result is mock_summary


@pytest.mark.asyncio
async def test_get_run_summary_returns_none_when_missing():
    from app.services.results_store import get_run_summary

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    result = await get_run_summary(db, "ghost-run")

    assert result is None


# ─── get_asset_latest ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_asset_latest_returns_most_recent():
    from app.services.results_store import get_asset_latest

    mock_summary = MagicMock()
    mock_summary.asset_id = "asset-001"
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=mock_summary)

    result = await get_asset_latest(db, "asset-001")

    assert result.asset_id == "asset-001"


# ─── get_asset_trend ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_asset_trend_returns_list():
    from app.services.results_store import get_asset_trend

    mock_points = [MagicMock(), MagicMock()]
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = mock_points

    result = await get_asset_trend(db, "asset-001", "row_count")

    assert len(result) == 2


# ─── compare_runs ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_compare_runs_computes_delta():
    from app.services.results_store import compare_runs

    def _make_summary(run_id, new_assets, updated_assets, failed_assets, schema_changes):
        s = MagicMock()
        s.run_id = run_id
        s.job_id = "job-001"
        s.summary_id = f"sum-{run_id}"
        s.connection_id = None
        s.scan_type = "metadata_discovery"
        s.new_assets_count = new_assets
        s.updated_assets_count = updated_assets
        s.removed_assets_count = 0
        s.failed_assets_count = failed_assets
        s.schema_changes_count = schema_changes
        s.quality_score_avg = None
        s.scan_parameters = None
        s.created_at = "2026-06-10T10:00:00"
        return s

    run_a = _make_summary("run-001", new_assets=5, updated_assets=10, failed_assets=0, schema_changes=1)
    run_b = _make_summary("run-002", new_assets=8, updated_assets=12, failed_assets=2, schema_changes=3)

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(side_effect=[run_a, run_b])

    result = await compare_runs(db, "run-001", "run-002")

    assert result["delta"]["new_assets_delta"] == 3
    assert result["delta"]["failed_assets_delta"] == 2
    assert result["delta"]["schema_changes_delta"] == 2


@pytest.mark.asyncio
async def test_compare_runs_raises_when_run_missing():
    from app.services.results_store import compare_runs

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    with pytest.raises(ValueError, match="not found"):
        await compare_runs(db, "ghost-a", "ghost-b")
```

- [ ] **Step 2: Run to verify failure**

```
pytest tests/test_results_store.py -v
```

Expected: 16 new tests FAIL with `ImportError`.

- [ ] **Step 3: Create `app/services/results_store.py`**

```python
# app/services/results_store.py
from __future__ import annotations

import logging
from datetime import datetime, timezone, date as date_t
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AssetScanSummary,
    FailedSampleRecordPlaceholder,
    ProfilingResultPlaceholder,
    RuleResultPlaceholder,
    ScanEvidenceLog,
    ScanJobRun,
    ScanMetricsHistory,
    ScanRunSummary,
    gen_uuid,
)

logger = logging.getLogger("dq_platform.results_store")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ─── Write: run-level ─────────────────────────────────────────────────────────

async def write_run_summary(run_id: str, db) -> None:
    """Create ScanRunSummary for a completed run. Idempotent — skips if one exists."""
    run = await db.get(ScanJobRun, run_id)
    if not run:
        logger.warning("write_run_summary: run %s not found", run_id)
        return

    existing = (await db.execute(
        select(ScanRunSummary).where(ScanRunSummary.run_id == run_id)
    )).scalar_one_or_none()
    if existing:
        return

    from app.db.models import ScanJob
    job = await db.get(ScanJob, run.job_id)
    connection_id = job.connection_id if job else None
    scan_type = job.job_type if job else None

    result_summary = run.result_summary or {}
    failed = result_summary.get("tables_failed", run.errors_count)

    summary = ScanRunSummary(
        run_id=run_id,
        job_id=run.job_id,
        connection_id=connection_id,
        scan_type=scan_type,
        new_assets_count=result_summary.get("new_assets", 0),
        updated_assets_count=result_summary.get("updated_assets", run.assets_scanned - failed),
        removed_assets_count=result_summary.get("removed_assets", 0),
        failed_assets_count=failed,
        schema_changes_count=result_summary.get("schema_changes", 0),
        scan_parameters=run.parameters,
    )
    db.add(summary)
    await db.commit()


# ─── Write: asset-level ───────────────────────────────────────────────────────

async def write_asset_summary(
    db,
    run_id: str,
    asset_id: str,
    job_id: Optional[str] = None,
    scan_status: str = "succeeded",
    scan_duration_ms: Optional[int] = None,
    row_count: Optional[int] = None,
    bytes: Optional[int] = None,
    column_count: Optional[int] = None,
    schema_hash: Optional[str] = None,
    columns_added: int = 0,
    columns_removed: int = 0,
    columns_changed: int = 0,
    schema_drift_detected: bool = False,
    error_message: Optional[str] = None,
) -> None:
    """Insert one AssetScanSummary row. Does not upsert — each run gets its own row."""
    summary = AssetScanSummary(
        run_id=run_id,
        asset_id=asset_id,
        job_id=job_id,
        scan_status=scan_status,
        scan_duration_ms=scan_duration_ms,
        row_count=row_count,
        bytes=bytes,
        column_count=column_count,
        schema_hash=schema_hash,
        columns_added=columns_added,
        columns_removed=columns_removed,
        columns_changed=columns_changed,
        schema_drift_detected=schema_drift_detected,
        error_message=error_message,
    )
    db.add(summary)


# ─── Write: metrics history ───────────────────────────────────────────────────

async def record_metrics(
    db,
    asset_id: str,
    metric_date: date_t,
    metrics: dict[str, Optional[float]],
    run_id: Optional[str] = None,
) -> None:
    """Append metric points for an asset. Skips None values."""
    for name, value in metrics.items():
        if value is None:
            continue
        db.add(ScanMetricsHistory(
            asset_id=asset_id,
            run_id=run_id,
            metric_date=metric_date,
            metric_name=name,
            metric_value_num=float(value),
        ))


# ─── Write: evidence ──────────────────────────────────────────────────────────

async def append_evidence(
    db,
    run_id: str,
    evidence_type: str,
    severity: str,
    message: str,
    asset_id: Optional[str] = None,
    payload: Optional[dict] = None,
    retention_days: Optional[int] = None,
) -> None:
    """Append one structured evidence/diagnostic entry for a run."""
    from datetime import timedelta
    expires = None
    if retention_days is not None:
        expires = _now() + timedelta(days=retention_days)

    db.add(ScanEvidenceLog(
        run_id=run_id,
        asset_id=asset_id,
        evidence_type=evidence_type,
        severity=severity,
        message=message[:5000],
        payload=payload,
        retention_expires_at=expires,
    ))


# ─── Read: run-level ──────────────────────────────────────────────────────────

async def get_run_summary(db, run_id: str) -> Optional[ScanRunSummary]:
    """Return ScanRunSummary for a run, or None if not yet written."""
    result = await db.execute(
        select(ScanRunSummary).where(ScanRunSummary.run_id == run_id)
    )
    return result.scalar_one_or_none()


# ─── Read: asset-level ────────────────────────────────────────────────────────

async def get_asset_latest(db, asset_id: str) -> Optional[AssetScanSummary]:
    """Return the most recent AssetScanSummary for an asset."""
    result = await db.execute(
        select(AssetScanSummary)
        .where(AssetScanSummary.asset_id == asset_id)
        .order_by(desc(AssetScanSummary.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_run_asset_summaries(
    db, run_id: str, limit: int = 200
) -> list[AssetScanSummary]:
    """All AssetScanSummary rows for a given run."""
    result = await db.execute(
        select(AssetScanSummary)
        .where(AssetScanSummary.run_id == run_id)
        .order_by(desc(AssetScanSummary.created_at))
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_asset_run_summary(
    db, run_id: str, asset_id: str
) -> Optional[AssetScanSummary]:
    """AssetScanSummary for a specific (run, asset) pair — most recent if multiple."""
    result = await db.execute(
        select(AssetScanSummary)
        .where(
            AssetScanSummary.run_id == run_id,
            AssetScanSummary.asset_id == asset_id,
        )
        .order_by(desc(AssetScanSummary.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# ─── Read: trend ──────────────────────────────────────────────────────────────

async def get_asset_trend(
    db,
    asset_id: str,
    metric_name: str,
    since: Optional[date_t] = None,
    until: Optional[date_t] = None,
    limit: int = 90,
) -> list[ScanMetricsHistory]:
    """Return metric history for an asset ordered oldest-first."""
    from datetime import timedelta
    if since is None:
        since = (_now() - timedelta(days=90)).date()
    if until is None:
        until = _now().date()
    limit = min(limit, 90)

    result = await db.execute(
        select(ScanMetricsHistory)
        .where(
            ScanMetricsHistory.asset_id == asset_id,
            ScanMetricsHistory.metric_name == metric_name,
            ScanMetricsHistory.metric_date >= since,
            ScanMetricsHistory.metric_date <= until,
        )
        .order_by(ScanMetricsHistory.metric_date)
        .limit(limit)
    )
    return list(result.scalars().all())


# ─── Read: comparison ─────────────────────────────────────────────────────────

async def compare_runs(db, run_id_a: str, run_id_b: str) -> dict:
    """Compare two scan run summaries. Returns both summaries + a delta dict."""
    def _fetch_summary(run_id):
        return db.execute(
            select(ScanRunSummary).where(ScanRunSummary.run_id == run_id)
        )

    result_a = await _fetch_summary(run_id_a)
    summary_a = result_a.scalar_one_or_none()
    if not summary_a:
        raise ValueError(f"ScanRunSummary for run {run_id_a} not found")

    result_b = await _fetch_summary(run_id_b)
    summary_b = result_b.scalar_one_or_none()
    if not summary_b:
        raise ValueError(f"ScanRunSummary for run {run_id_b} not found")

    delta = {
        "new_assets_delta": summary_b.new_assets_count - summary_a.new_assets_count,
        "updated_assets_delta": summary_b.updated_assets_count - summary_a.updated_assets_count,
        "removed_assets_delta": summary_b.removed_assets_count - summary_a.removed_assets_count,
        "failed_assets_delta": summary_b.failed_assets_count - summary_a.failed_assets_count,
        "schema_changes_delta": summary_b.schema_changes_count - summary_a.schema_changes_count,
    }
    if summary_a.quality_score_avg is not None and summary_b.quality_score_avg is not None:
        delta["quality_score_delta"] = round(
            summary_b.quality_score_avg - summary_a.quality_score_avg, 4
        )

    return {
        "run_a": summary_a,
        "run_b": summary_b,
        "delta": delta,
    }


# ─── Read: evidence ───────────────────────────────────────────────────────────

async def get_run_evidence(
    db,
    run_id: str,
    asset_id: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 200,
) -> list[ScanEvidenceLog]:
    """Return evidence logs for a run, optionally filtered by asset or severity."""
    q = (
        select(ScanEvidenceLog)
        .where(ScanEvidenceLog.run_id == run_id)
    )
    if asset_id:
        q = q.where(ScanEvidenceLog.asset_id == asset_id)
    if severity:
        q = q.where(ScanEvidenceLog.severity == severity)
    q = q.order_by(desc(ScanEvidenceLog.created_at)).limit(limit)
    result = await db.execute(q)
    return list(result.scalars().all())
```

- [ ] **Step 4: Run all service tests**

```
pytest tests/test_results_store.py -v
```

Expected: All 24 tests PASS (8 from Task 1+2, 16 new).

- [ ] **Step 5: Commit**

```bash
git add app/services/results_store.py tests/test_results_store.py
git commit -m "feat(results-storage): add results_store service with read/write operations"
```

---

## Task 5: Wire into metadata_store

**Files:**
- Modify: `app/services/metadata_store.py`

Add optional `scan_run_id` to `record_scan_result`. When provided, it writes `AssetScanSummary` and metric history rows.

- [ ] **Step 1: Write the integration test**

Append to `tests/test_results_store.py`:

```python
@pytest.mark.asyncio
async def test_record_scan_result_calls_write_asset_summary_when_run_id_given():
    from app.services.metadata_store import record_scan_result

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    with patch("app.services.metadata_store.results_store") as mock_rs:
        mock_rs.write_asset_summary = AsyncMock()
        mock_rs.record_metrics = AsyncMock()

        await record_scan_result(
            db=db,
            asset_id="asset-001",
            scan_status="success",
            scan_version="1.0.0",
            scan_duration_ms=300,
            row_count=1000,
            bytes=204800,
            last_modified_at=None,
            column_count=10,
            schema_hash="abc123",
            scan_run_id="run-001",
        )

    mock_rs.write_asset_summary.assert_called_once()
    call_kwargs = mock_rs.write_asset_summary.call_args.kwargs
    assert call_kwargs["run_id"] == "run-001"
    assert call_kwargs["asset_id"] == "asset-001"
    assert call_kwargs["scan_duration_ms"] == 300


@pytest.mark.asyncio
async def test_record_scan_result_no_run_id_skips_write_asset_summary():
    from app.services.metadata_store import record_scan_result

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none = MagicMock(return_value=None)

    with patch("app.services.metadata_store.results_store") as mock_rs:
        mock_rs.write_asset_summary = AsyncMock()

        await record_scan_result(
            db=db,
            asset_id="asset-001",
            scan_status="success",
            scan_version="1.0.0",
            scan_duration_ms=200,
            row_count=500,
            bytes=102400,
            last_modified_at=None,
            column_count=8,
            schema_hash="def456",
        )

    mock_rs.write_asset_summary.assert_not_called()
```

- [ ] **Step 2: Run to verify failure**

```
pytest tests/test_results_store.py::test_record_scan_result_calls_write_asset_summary_when_run_id_given tests/test_results_store.py::test_record_scan_result_no_run_id_skips_write_asset_summary -v
```

Expected: 2 FAIL with `TypeError` — wrong number of arguments.

- [ ] **Step 3: Edit `app/services/metadata_store.py`**

At the top of the file, after the existing imports, add:

```python
from app.services import results_store
```

Change the signature of `record_scan_result` (around line 107) from:

```python
async def record_scan_result(
    db: AsyncSession,
    asset_id: str,
    scan_status: str,
    scan_version: str,
    scan_duration_ms: int,
    row_count: Optional[int],
    bytes: Optional[int],
    last_modified_at: Optional[datetime],
    column_count: int,
    schema_hash: str,
) -> None:
```

to:

```python
async def record_scan_result(
    db: AsyncSession,
    asset_id: str,
    scan_status: str,
    scan_version: str,
    scan_duration_ms: int,
    row_count: Optional[int],
    bytes: Optional[int],
    last_modified_at: Optional[datetime],
    column_count: int,
    schema_hash: str,
    scan_run_id: Optional[str] = None,
) -> None:
```

Then, at the end of `record_scan_result`, before `await db.commit()`, add:

```python
    if scan_run_id:
        await results_store.write_asset_summary(
            db=db,
            run_id=scan_run_id,
            asset_id=asset_id,
            scan_status=scan_status,
            scan_duration_ms=scan_duration_ms,
            row_count=row_count,
            bytes=bytes,
            column_count=column_count,
            schema_hash=schema_hash,
        )
        today = _now().date()
        await results_store.record_metrics(
            db=db,
            asset_id=asset_id,
            run_id=scan_run_id,
            metric_date=today,
            metrics={
                "row_count": float(row_count) if row_count is not None else None,
                "column_count": float(column_count) if column_count is not None else None,
            },
        )
```

- [ ] **Step 4: Run wiring tests**

```
pytest tests/test_results_store.py -v
```

Expected: All 26 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/metadata_store.py tests/test_results_store.py
git commit -m "feat(results-storage): wire scan_run_id into metadata_store.record_scan_result"
```

---

## Task 6: Wire into discovery_service

**Files:**
- Modify: `app/services/discovery_service.py`

Thread `scan_run_id` from payload into each `record_scan_result` call.

- [ ] **Step 1: Identify the two call sites**

Both calls are at lines ~505 and ~656. Both look like:

```python
await _meta_store.record_scan_result(
    db, existing_asset.asset_id,
    scan_status="success",
    ...
)
```

- [ ] **Step 2: Add `scan_run_id` extraction in `run_discovery`**

In `run_discovery` (line ~230), find where `payload` is read. Immediately after extracting `connection_id` from payload, add:

```python
scan_run_id: Optional[str] = payload.get("scan_run_id")
```

This variable then needs to be passed down through the nested calls. The cleanest approach is to capture it in the outer scope and use it in the inner async closures that call `record_scan_result`. In discovery_service.py, both calls to `record_scan_result` are inside async functions within `run_discovery`. Add `scan_run_id=scan_run_id` as a keyword argument to both calls.

At line ~505:
```python
await _meta_store.record_scan_result(
    db, existing_asset.asset_id,
    scan_status="success",
    scan_version=SCANNER_VERSION,
    scan_duration_ms=_elapsed_existing,
    row_count=table.get("row_count"),
    bytes=table.get("bytes"),
    last_modified_at=table.get("last_altered"),
    column_count=len(columns),
    schema_hash=_existing_schema_hash,
    scan_run_id=scan_run_id,
)
```

At line ~656 (the second call site — same pattern for new assets):
```python
scan_run_id=scan_run_id,
```

- [ ] **Step 3: Wire `scan_run_id` in scan_orchestrator `_run_metadata_discovery`**

In `app/services/scan_orchestrator.py`, function `_run_metadata_discovery` (around line 330), change:

```python
payload = {"connection_id": connection_id, "triggered_by": "scan_orchestrator", **params}
```

to:

```python
payload = {"connection_id": connection_id, "triggered_by": "scan_orchestrator", "scan_run_id": run_id, **params}
```

- [ ] **Step 4: Run existing orchestrator tests to verify no regression**

```
pytest tests/test_scan_orchestrator.py -v
```

Expected: All 13 existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/discovery_service.py app/services/scan_orchestrator.py
git commit -m "feat(results-storage): thread scan_run_id through discovery into record_scan_result"
```

---

## Task 7: Wire run summary into scan_orchestrator

**Files:**
- Modify: `app/services/scan_orchestrator.py`

After `_execute_run` finalizes the run status, call `results_store.write_run_summary`.

- [ ] **Step 1: Write the orchestrator integration test**

Append to `tests/test_results_store.py`:

```python
@pytest.mark.asyncio
async def test_execute_run_calls_write_run_summary_on_success():
    from app.services import scan_orchestrator

    with patch("app.services.scan_orchestrator._dispatch_handler", new_callable=AsyncMock) as mock_dispatch:
        mock_dispatch.return_value = {
            "assets_scanned": 5,
            "errors_count": 0,
            "warnings_count": 0,
            "result_summary": None,
        }
        with patch("app.services.scan_orchestrator.AsyncSessionLocal") as mock_ctx:
            mock_db = AsyncMock()
            mock_run_first = MagicMock()
            mock_run_first.status = "queued"
            mock_run_first.job_id = "job-001"
            mock_run_second = MagicMock()
            mock_run_second.status = "running"
            mock_job = MagicMock()
            mock_job.job_type = "metadata_discovery"
            mock_job.connection_id = "conn-001"
            mock_job.timeout_seconds = 300
            mock_job.max_retries = 2
            mock_db.get.side_effect = [
                mock_run_first,  # first context — run fetch
                mock_job,        # first context — job fetch
                mock_run_second, # second context — run update fetch
                mock_job,        # second context — job update fetch
            ]
            mock_ctx.return_value.__aenter__.return_value = mock_db

            with patch("app.services.scan_orchestrator.results_store") as mock_rs:
                mock_rs.write_run_summary = AsyncMock()
                result = await scan_orchestrator._execute_run("run-001")

        mock_rs.write_run_summary.assert_called_once_with("run-001", mock_db)
```

- [ ] **Step 2: Run to verify failure**

```
pytest tests/test_results_store.py::test_execute_run_calls_write_run_summary_on_success -v
```

Expected: FAIL — `results_store` not yet imported or called in orchestrator.

- [ ] **Step 3: Edit `app/services/scan_orchestrator.py`**

At the top, after existing imports, add:

```python
from app.services import results_store
```

In `_execute_run`, in the final `async with AsyncSessionLocal() as db:` block, after the `await db.commit()` call, add:

```python
        await results_store.write_run_summary(run_id, db)
```

The final block should look like:

```python
    async with AsyncSessionLocal() as db:
        run = await db.get(ScanJobRun, run_id)
        if run and run.status == "running":
            run.status = final_status
            run.ended_at = ended
            run.duration_seconds = round(duration, 3)
            run.assets_scanned = metrics.get("assets_scanned", 0)
            run.errors_count = metrics.get("errors_count", 0)
            run.warnings_count = metrics.get("warnings_count", 0)
            run.error_message = error_msg
            run.result_summary = metrics.get("result_summary") or None

            job = await db.get(ScanJob, job_id)
            if job:
                job.last_run_at = ended
                job.last_run_status = final_status

        await db.commit()
        await results_store.write_run_summary(run_id, db)
```

- [ ] **Step 4: Run all results tests**

```
pytest tests/test_results_store.py tests/test_scan_orchestrator.py -v
```

Expected: All tests PASS (no regression in existing orchestrator tests).

- [ ] **Step 5: Commit**

```bash
git add app/services/scan_orchestrator.py tests/test_results_store.py
git commit -m "feat(results-storage): call write_run_summary in scan_orchestrator after execution"
```

---

## Task 8: API Router

**Files:**
- Create: `app/api/scan_results.py`

Eight endpoints covering latest result, history, run summary, run assets, run comparison, and evidence.

- [ ] **Step 1: Write API tests**

Append to `tests/test_scan_results_api.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_mock_summary(run_id="run-001"):
    s = MagicMock()
    s.summary_id = f"sum-{run_id}"
    s.run_id = run_id
    s.job_id = "job-001"
    s.connection_id = "conn-001"
    s.scan_type = "metadata_discovery"
    s.new_assets_count = 3
    s.updated_assets_count = 10
    s.removed_assets_count = 0
    s.failed_assets_count = 1
    s.schema_changes_count = 2
    s.quality_score_avg = None
    s.scan_parameters = None
    s.created_at = "2026-06-10T10:00:00"
    return s


def _make_mock_asset_summary():
    a = MagicMock()
    a.asset_summary_id = "asm-001"
    a.run_id = "run-001"
    a.asset_id = "asset-001"
    a.job_id = "job-001"
    a.scan_status = "succeeded"
    a.scan_duration_ms = 250
    a.row_count = 5000
    a.bytes = 102400
    a.column_count = 12
    a.schema_hash = "abc123"
    a.columns_added = 0
    a.columns_removed = 0
    a.columns_changed = 0
    a.schema_drift_detected = False
    a.error_message = None
    a.quality_score = None
    a.null_ratio_avg = None
    a.distinct_ratio_avg = None
    a.volume_change_pct = None
    a.freshness_hours = None
    a.created_at = "2026-06-10T10:00:00"
    return a


def test_serializers_exist():
    from app.api.scan_results import _summary_dict, _asset_summary_dict, _evidence_dict
    assert callable(_summary_dict)
    assert callable(_asset_summary_dict)
    assert callable(_evidence_dict)


def test_summary_dict_returns_expected_keys():
    from app.api.scan_results import _summary_dict
    d = _summary_dict(_make_mock_summary())
    assert "run_id" in d
    assert "new_assets_count" in d
    assert "scan_type" in d


def test_asset_summary_dict_returns_expected_keys():
    from app.api.scan_results import _asset_summary_dict
    d = _asset_summary_dict(_make_mock_asset_summary())
    assert "asset_id" in d
    assert "scan_status" in d
    assert "schema_drift_detected" in d
    assert "quality_score" in d


@pytest.mark.asyncio
async def test_get_run_summary_returns_404_when_missing():
    from app.api.scan_results import get_run_summary_endpoint
    from fastapi import HTTPException

    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.get_run_summary = AsyncMock(return_value=None)
        db = AsyncMock()
        with pytest.raises(HTTPException) as exc_info:
            await get_run_summary_endpoint("ghost-run", db=db, user={})
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_run_summary_returns_data():
    from app.api.scan_results import get_run_summary_endpoint

    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.get_run_summary = AsyncMock(return_value=_make_mock_summary())
        db = AsyncMock()
        result = await get_run_summary_endpoint("run-001", db=db, user={})
        assert result["run_id"] == "run-001"
        assert result["new_assets_count"] == 3


@pytest.mark.asyncio
async def test_get_asset_latest_returns_404_when_missing():
    from app.api.scan_results import get_asset_latest_endpoint
    from fastapi import HTTPException

    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.get_asset_latest = AsyncMock(return_value=None)
        db = AsyncMock()
        with pytest.raises(HTTPException) as exc_info:
            await get_asset_latest_endpoint("ghost-asset", db=db, user={})
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_compare_runs_returns_delta():
    from app.api.scan_results import compare_runs_endpoint

    cmp = {
        "run_a": _make_mock_summary("run-001"),
        "run_b": _make_mock_summary("run-002"),
        "delta": {"new_assets_delta": 3},
    }
    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.compare_runs = AsyncMock(return_value=cmp)
        db = AsyncMock()
        result = await compare_runs_endpoint(run_id_a="run-001", run_id_b="run-002", db=db, user={})
        assert result["delta"]["new_assets_delta"] == 3


@pytest.mark.asyncio
async def test_compare_runs_returns_422_when_run_missing():
    from app.api.scan_results import compare_runs_endpoint
    from fastapi import HTTPException

    with patch("app.api.scan_results.results_store") as mock_rs:
        mock_rs.compare_runs = AsyncMock(side_effect=ValueError("not found"))
        db = AsyncMock()
        with pytest.raises(HTTPException) as exc_info:
            await compare_runs_endpoint(run_id_a="ghost-a", run_id_b="ghost-b", db=db, user={})
        assert exc_info.value.status_code == 404
```

- [ ] **Step 2: Run to verify failure**

```
pytest tests/test_scan_results_api.py -v
```

Expected: New tests FAIL with `ImportError`.

- [ ] **Step 3: Create `app/api/scan_results.py`**

```python
# app/api/scan_results.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.db.database import get_db
from app.services import results_store

router = APIRouter(prefix="/scan-results", tags=["Scan Results"])


# ─── Run-level endpoints ──────────────────────────────────────────────────────

@router.get("/runs/{run_id}")
async def get_run_summary_endpoint(
    run_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return enriched summary for a completed scan run."""
    summary = await results_store.get_run_summary(db, run_id)
    if not summary:
        raise HTTPException(404, "Scan run summary not found")
    return _summary_dict(summary)


@router.get("/runs/{run_id}/assets")
async def list_run_asset_summaries(
    run_id: str,
    limit: int = Query(200, ge=1, le=1000),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """All per-asset summaries for a given run."""
    summaries = await results_store.get_run_asset_summaries(db, run_id, limit=limit)
    return [_asset_summary_dict(s) for s in summaries]


@router.get("/runs/{run_id}/assets/{asset_id}")
async def get_run_asset_summary(
    run_id: str,
    asset_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Per-asset summary for a specific (run, asset) pair."""
    summary = await results_store.get_asset_run_summary(db, run_id, asset_id)
    if not summary:
        raise HTTPException(404, "Asset scan summary not found for this run")
    return _asset_summary_dict(summary)


@router.get("/runs/{run_id}/evidence")
async def get_run_evidence_endpoint(
    run_id: str,
    asset_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Structured diagnostics and evidence for a run."""
    logs = await results_store.get_run_evidence(
        db, run_id, asset_id=asset_id, severity=severity, limit=limit
    )
    return [_evidence_dict(e) for e in logs]


@router.get("/compare")
async def compare_runs_endpoint(
    run_id_a: str = Query(...),
    run_id_b: str = Query(...),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Compare two scan run summaries and return a delta breakdown."""
    try:
        result = await results_store.compare_runs(db, run_id_a, run_id_b)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    return {
        "run_a": _summary_dict(result["run_a"]),
        "run_b": _summary_dict(result["run_b"]),
        "delta": result["delta"],
    }


# ─── Asset-level endpoints ────────────────────────────────────────────────────

@router.get("/assets/{asset_id}/latest")
async def get_asset_latest_endpoint(
    asset_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Most recent scan summary for an asset."""
    summary = await results_store.get_asset_latest(db, asset_id)
    if not summary:
        raise HTTPException(404, "No scan results found for asset")
    return _asset_summary_dict(summary)


@router.get("/assets/{asset_id}/trend")
async def get_asset_trend_endpoint(
    asset_id: str,
    metric_name: str = Query(..., description="e.g. row_count, column_count, quality_score"),
    since: Optional[str] = Query(None, description="ISO date YYYY-MM-DD"),
    until: Optional[str] = Query(None, description="ISO date YYYY-MM-DD"),
    limit: int = Query(90, ge=1, le=90),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Time-series metric history for an asset."""
    from datetime import date
    since_date = date.fromisoformat(since) if since else None
    until_date = date.fromisoformat(until) if until else None
    points = await results_store.get_asset_trend(
        db, asset_id, metric_name, since=since_date, until=until_date, limit=limit
    )
    return [_metric_dict(p) for p in points]


# ─── Serializers ──────────────────────────────────────────────────────────────

def _summary_dict(s) -> dict:
    return {
        "summary_id": s.summary_id,
        "run_id": s.run_id,
        "job_id": s.job_id,
        "connection_id": s.connection_id,
        "scan_type": s.scan_type,
        "new_assets_count": s.new_assets_count,
        "updated_assets_count": s.updated_assets_count,
        "removed_assets_count": s.removed_assets_count,
        "failed_assets_count": s.failed_assets_count,
        "schema_changes_count": s.schema_changes_count,
        "quality_score_avg": s.quality_score_avg,
        "scan_parameters": s.scan_parameters,
        "created_at": s.created_at.isoformat() if hasattr(s.created_at, "isoformat") else str(s.created_at),
    }


def _asset_summary_dict(a) -> dict:
    return {
        "asset_summary_id": a.asset_summary_id,
        "run_id": a.run_id,
        "asset_id": a.asset_id,
        "job_id": a.job_id,
        "scan_status": a.scan_status,
        "scan_duration_ms": a.scan_duration_ms,
        "row_count": a.row_count,
        "bytes": a.bytes,
        "column_count": a.column_count,
        "schema_hash": a.schema_hash,
        "columns_added": a.columns_added,
        "columns_removed": a.columns_removed,
        "columns_changed": a.columns_changed,
        "schema_drift_detected": a.schema_drift_detected,
        "error_message": a.error_message,
        "quality_score": a.quality_score,
        "null_ratio_avg": a.null_ratio_avg,
        "distinct_ratio_avg": a.distinct_ratio_avg,
        "volume_change_pct": a.volume_change_pct,
        "freshness_hours": a.freshness_hours,
        "created_at": a.created_at.isoformat() if hasattr(a.created_at, "isoformat") else str(a.created_at),
    }


def _evidence_dict(e) -> dict:
    return {
        "evidence_id": e.evidence_id,
        "run_id": e.run_id,
        "asset_id": e.asset_id,
        "evidence_type": e.evidence_type,
        "severity": e.severity,
        "message": e.message,
        "payload": e.payload,
        "retention_expires_at": e.retention_expires_at.isoformat() if e.retention_expires_at and hasattr(e.retention_expires_at, "isoformat") else None,
        "created_at": e.created_at.isoformat() if hasattr(e.created_at, "isoformat") else str(e.created_at),
    }


def _metric_dict(m) -> dict:
    return {
        "metric_id": m.metric_id,
        "asset_id": m.asset_id,
        "run_id": m.run_id,
        "metric_date": m.metric_date.isoformat() if m.metric_date and hasattr(m.metric_date, "isoformat") else None,
        "metric_name": m.metric_name,
        "metric_value_num": m.metric_value_num,
        "metric_value_str": m.metric_value_str,
        "created_at": m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at),
    }
```

- [ ] **Step 4: Run all API tests**

```
pytest tests/test_scan_results_api.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/scan_results.py tests/test_scan_results_api.py
git commit -m "feat(results-storage): add scan_results API router with 8 endpoints"
```

---

## Task 9: Register Router in main.py

**Files:**
- Modify: `app/main.py`

- [ ] **Step 1: Write registration test**

Append to `tests/test_scan_results_api.py`:

```python
def test_scan_results_router_is_registered_in_main():
    from app.api import scan_results
    from app.main import app
    paths = [r.path for r in app.routes]
    assert any("/scan-results" in p for p in paths), (
        "scan_results router not registered — check app/main.py"
    )
```

- [ ] **Step 2: Run to verify failure**

```
pytest tests/test_scan_results_api.py::test_scan_results_router_is_registered_in_main -v
```

Expected: FAIL — router not registered yet.

- [ ] **Step 3: Edit `app/main.py`**

In the import block (around line 18-33), add `scan_results` to the import list:

```python
from app.api import (
    domains, subdomains, assets, rules, schedules, executions,
    dashboard, ai, alerts, audit, config, connections,
    # §53 Catalog & Governance
    glossary, classifications, columns, data_products,
    comments, announcements, access_requests, tags, usage, catalog,
    lineage,
    schema_drift,
    # §54-§68 Advanced features
    governance, contracts, compliance, cost, incidents,
    anomaly, marketplace, mesh, observability, cicd,
    privacy, admin,
    # Metadata store
    metadata,
    scan_jobs,
    # Results storage
    scan_results,
)
```

Then find where `scan_jobs.router` is registered (search for `scan_jobs` in the file's router registration section) and add the `scan_results` router next to it:

```python
app.include_router(scan_results.router)
```

- [ ] **Step 4: Run registration test**

```
pytest tests/test_scan_results_api.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Run the full test suite**

```
pytest tests/ -v --tb=short 2>&1 | tail -40
```

Expected: All pre-existing tests still PASS. No regressions.

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_scan_results_api.py
git commit -m "feat(results-storage): register scan_results router in main.py"
```

---

## Full Test Run

After all tasks are complete, run the full suite one final time:

```
pytest tests/test_results_store.py tests/test_scan_results_api.py tests/test_scan_orchestrator.py -v
```

Expected counts:
- `test_results_store.py`: ~30 PASS
- `test_scan_results_api.py`: ~14 PASS
- `test_scan_orchestrator.py`: 13 PASS (no regression)

---

## Next Integration Notes for Basic User and Role Model

When the User and Role model module is built, the following results-storage touchpoints apply:

1. **Authorization on scan results**: `GET /scan-results/*` endpoints currently allow any authenticated user. The role model should restrict write endpoints (evidence, comparison) to `analyst` or above, and limit `GET /scan-results/assets/{asset_id}` to users with read access to that asset's domain.

2. **Audit logging**: `write_run_summary` and `write_asset_summary` should emit to the `audit_logs` table with `entity_type="scan_run_summary"` / `"asset_scan_summary"`. The audit log infrastructure (`AuditLog` model) already exists in `app/db/models.py`.

3. **Evidence retention policy**: `ScanEvidenceLog.retention_expires_at` and `FailedSampleRecordPlaceholder.retention_expires_at` are populated via `retention_days` parameter. A periodic cleanup job (APScheduler task in `scheduler_service.py`) should DELETE expired evidence. Wire it in the same pattern as other scheduled jobs.

4. **Phase 2 profiling hook**: When the profiling engine is built, it should call `results_store.write_asset_summary` with `quality_score`, `null_ratio_avg`, `distinct_ratio_avg` populated, and insert `ProfilingResultPlaceholder` rows (flipping `is_placeholder=False`).

5. **Phase 2 rule engine hook**: Rule evaluations should insert `RuleResultPlaceholder` rows with `is_placeholder=False` and populate `failed_sample_record_placeholders` rows with actual `failed_record` payloads and a `retention_expires_at` based on data sensitivity classification.
