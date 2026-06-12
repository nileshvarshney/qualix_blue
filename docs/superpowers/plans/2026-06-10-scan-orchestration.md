# Scan Orchestration (Module 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a database-backed scan orchestration system that manages job definitions, persisted run records, scheduling, retries, per-run logs, and a REST API — without duplicating connector or discovery logic.

**Architecture:** Three new DB tables (`scan_jobs`, `scan_job_runs`, `scan_job_run_logs`) back persisted job definitions and execution history. A `scan_orchestrator` service owns the run lifecycle (queued → running → succeeded/partial_success/failed/timed_out/cancelled) and calls existing connector/discovery services rather than embedding their logic. APScheduler integration reuses the existing `build_trigger` helper from `scheduler_service.py`.

**Tech Stack:** SQLAlchemy 2.0 (existing `SnowflakeAsyncSession`/`AsyncSessionLocal`), FastAPI, APScheduler 3.x (existing `scheduler`), Pydantic v2, pytest + AsyncMock

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `app/db/models.py` | Add `ScanJob`, `ScanJobRun`, `ScanJobRunLog` models |
| Create | `migrations/versions/0015_scan_jobs.py` | Alembic migration for the 3 new tables |
| Create | `app/schemas/scan_job.py` | Pydantic request/response models |
| Create | `app/services/scan_orchestrator.py` | Run lifecycle, handlers, retry, logging |
| Create | `app/api/scan_jobs.py` | REST router (10 endpoints) |
| Modify | `app/services/scheduler_service.py` | Add `schedule_scan_job`, `unschedule_scan_job`, `load_all_scan_schedules` |
| Modify | `app/main.py` | Import + register router; call `load_all_scan_schedules` at startup |
| Create | `tests/test_scan_orchestrator.py` | Service-layer unit tests (AsyncMock) |
| Create | `tests/test_scan_jobs_api.py` | Schema validation + serializer tests |

---

## Task 1: Add DB Models

**Files:**
- Modify: `app/db/models.py` (append after the last model class, currently `SavedSearch` at line 1024)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_scan_orchestrator.py  (create this file now — it grows in Task 8)
def test_scan_job_model_has_required_fields():
    from app.db.models import ScanJob, ScanJobRun, ScanJobRunLog
    job = ScanJob(job_name="Test", job_type="connection_test")
    assert job.job_id is not None          # default=gen_uuid fires
    assert job.is_active is True
    assert job.schedule_frequency == "on_demand"
    assert job.max_retries == 2
    assert job.timeout_seconds == 300

    run = ScanJobRun(job_id=job.job_id)
    assert run.run_id is not None
    assert run.status == "queued"
    assert run.attempt == 1

    log = ScanJobRunLog(run_id=run.run_id, message="hello")
    assert log.log_id is not None
    assert log.level == "INFO"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_scan_orchestrator.py::test_scan_job_model_has_required_fields -v
```
Expected: `ImportError` or `AttributeError` — models don't exist yet.

- [ ] **Step 3: Append the three model classes to `app/db/models.py`**

Add immediately after the `SavedSearch` class (after line 1033):

```python


class ScanJob(Base):
    __tablename__ = "scan_jobs"

    job_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    connection_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("snowflake_connections.connection_id", ondelete="SET NULL"),
        nullable=True,
    )
    job_name: Mapped[str] = mapped_column(String(200), nullable=False)
    job_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    schedule_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="on_demand")
    cron_expr: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="UTC")
    max_retries: Mapped[int] = mapped_column(Integer, default=2)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=300)
    parameters: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_run_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    runs: Mapped[list["ScanJobRun"]] = relationship(
        "ScanJobRun", back_populates="job", cascade="all, delete-orphan"
    )


class ScanJobRun(Base):
    __tablename__ = "scan_job_runs"

    run_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    job_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_jobs.job_id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    trigger_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    triggered_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    assets_scanned: Mapped[int] = mapped_column(Integer, default=0)
    errors_count: Mapped[int] = mapped_column(Integer, default=0)
    warnings_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    result_summary: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    parameters: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    job: Mapped["ScanJob"] = relationship("ScanJob", back_populates="runs")
    logs: Mapped[list["ScanJobRunLog"]] = relationship(
        "ScanJobRunLog", back_populates="run", cascade="all, delete-orphan"
    )


class ScanJobRunLog(Base):
    __tablename__ = "scan_job_run_logs"

    log_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("scan_job_runs.run_id", ondelete="CASCADE"), nullable=False
    )
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="INFO")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[Optional[dict]] = mapped_column(JSONVariant, nullable=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=now)

    run: Mapped["ScanJobRun"] = relationship("ScanJobRun", back_populates="logs")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_scan_job_model_has_required_fields -v
```
Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py tests/test_scan_orchestrator.py
git commit -m "feat(scan-orchestration): add ScanJob, ScanJobRun, ScanJobRunLog models"
```

---

## Task 2: Alembic Migration

**Files:**
- Create: `migrations/versions/0015_scan_jobs.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_scan_orchestrator.py`:

```python
def test_migration_file_exists():
    import os
    path = "migrations/versions/0015_scan_jobs.py"
    assert os.path.exists(path), f"Migration file missing: {path}"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_migration_file_exists -v
```
Expected: `FAILED — AssertionError: Migration file missing`

- [ ] **Step 3: Create the migration file**

Create `migrations/versions/0015_scan_jobs.py`:

```python
"""Add scan_jobs, scan_job_runs, scan_job_run_logs for scan orchestration

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-10
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'scan_jobs',
        sa.Column('job_id', sa.String(36), primary_key=True),
        sa.Column('connection_id', sa.String(36),
                  sa.ForeignKey('snowflake_connections.connection_id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('job_name', sa.String(200), nullable=False),
        sa.Column('job_type', sa.String(50), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('schedule_frequency', sa.String(20), nullable=False, server_default='on_demand'),
        sa.Column('cron_expr', sa.String(100), nullable=True),
        sa.Column('timezone', sa.String(50), nullable=False, server_default='UTC'),
        sa.Column('max_retries', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('timeout_seconds', sa.Integer(), nullable=False, server_default='300'),
        sa.Column('parameters', VARIANT(), nullable=True),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('last_run_status', sa.String(20), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'scan_job_runs',
        sa.Column('run_id', sa.String(36), primary_key=True),
        sa.Column('job_id', sa.String(36),
                  sa.ForeignKey('scan_jobs.job_id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='queued'),
        sa.Column('trigger_type', sa.String(20), nullable=False, server_default='manual'),
        sa.Column('triggered_by', sa.String(200), nullable=True),
        sa.Column('attempt', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('assets_scanned', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('errors_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('warnings_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('result_summary', VARIANT(), nullable=True),
        sa.Column('parameters', VARIANT(), nullable=True),
        sa.Column('idempotency_key', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'scan_job_run_logs',
        sa.Column('log_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('level', sa.String(10), nullable=False, server_default='INFO'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('context', VARIANT(), nullable=True),
        sa.Column('logged_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('scan_job_run_logs')
    op.drop_table('scan_job_runs')
    op.drop_table('scan_jobs')
```

- [ ] **Step 4: Run test to verify it passes**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_migration_file_exists -v
```
Expected: `PASSED`

- [ ] **Step 5: Commit**

```bash
git add migrations/versions/0015_scan_jobs.py
git commit -m "feat(scan-orchestration): add migration 0015 for scan_jobs tables"
```

---

## Task 3: Pydantic Schemas

**Files:**
- Create: `app/schemas/scan_job.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_scan_orchestrator.py`:

```python
def test_scan_job_create_validates_job_type():
    from pydantic import ValidationError
    from app.schemas.scan_job import ScanJobCreate

    # Valid job type
    req = ScanJobCreate(job_name="My Job", job_type="connection_test")
    assert req.job_type == "connection_test"
    assert req.schedule_frequency == "on_demand"
    assert req.max_retries == 2
    assert req.timeout_seconds == 300

    # Invalid job type
    with pytest.raises(ValidationError):
        ScanJobCreate(job_name="Bad", job_type="invalid_type")


def test_scan_job_create_validates_frequency():
    from pydantic import ValidationError
    from app.schemas.scan_job import ScanJobCreate

    # Valid frequency
    req = ScanJobCreate(job_name="Sched", job_type="metadata_discovery", schedule_frequency="daily")
    assert req.schedule_frequency == "daily"

    # Invalid frequency
    with pytest.raises(ValidationError):
        ScanJobCreate(job_name="Bad", job_type="connection_test", schedule_frequency="yearly")


def test_trigger_request_optional_fields():
    from app.schemas.scan_job import TriggerRequest

    empty = TriggerRequest()
    assert empty.idempotency_key is None
    assert empty.parameters_override is None

    with_key = TriggerRequest(idempotency_key="abc-123", parameters_override={"key": "val"})
    assert with_key.idempotency_key == "abc-123"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_scan_job_create_validates_job_type tests/test_scan_orchestrator.py::test_scan_job_create_validates_frequency tests/test_scan_orchestrator.py::test_trigger_request_optional_fields -v
```
Expected: `ImportError` — module doesn't exist yet.

- [ ] **Step 3: Create `app/schemas/scan_job.py`**

```python
from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field

_JOB_TYPE_RE = (
    "^(connection_test|metadata_discovery|asset_refresh"
    "|profile_scan_placeholder|rule_scan_placeholder|source_health_check)$"
)
_FREQ_RE = "^(on_demand|hourly|daily|weekly|monthly|cron)$"


class ScanJobCreate(BaseModel):
    connection_id: Optional[str] = None
    job_name: str = Field(..., min_length=1, max_length=200)
    job_type: str = Field(..., pattern=_JOB_TYPE_RE)
    schedule_frequency: str = Field("on_demand", pattern=_FREQ_RE)
    cron_expr: Optional[str] = None
    timezone: str = "UTC"
    max_retries: int = Field(2, ge=0, le=5)
    timeout_seconds: int = Field(300, ge=30, le=3600)
    parameters: Optional[dict[str, Any]] = None


class ScanJobUpdate(BaseModel):
    job_name: Optional[str] = Field(None, min_length=1, max_length=200)
    is_active: Optional[bool] = None
    schedule_frequency: Optional[str] = Field(None, pattern=_FREQ_RE)
    cron_expr: Optional[str] = None
    timezone: Optional[str] = None
    max_retries: Optional[int] = Field(None, ge=0, le=5)
    timeout_seconds: Optional[int] = Field(None, ge=30, le=3600)
    parameters: Optional[dict[str, Any]] = None


class TriggerRequest(BaseModel):
    idempotency_key: Optional[str] = None
    parameters_override: Optional[dict[str, Any]] = None
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_scan_job_create_validates_job_type tests/test_scan_orchestrator.py::test_scan_job_create_validates_frequency tests/test_scan_orchestrator.py::test_trigger_request_optional_fields -v
```
Expected: all 3 `PASSED`

- [ ] **Step 5: Commit**

```bash
git add app/schemas/scan_job.py tests/test_scan_orchestrator.py
git commit -m "feat(scan-orchestration): add Pydantic schemas for scan jobs"
```

---

## Task 4: Scan Orchestrator — Core (create_run + _execute_run + handlers)

**Files:**
- Create: `app/services/scan_orchestrator.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_scan_orchestrator.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_job(**kw):
    j = MagicMock()
    j.job_id = kw.get("job_id", "job-001")
    j.is_active = kw.get("is_active", True)
    j.job_type = kw.get("job_type", "connection_test")
    j.connection_id = kw.get("connection_id", "conn-001")
    j.parameters = kw.get("parameters", {})
    j.max_retries = kw.get("max_retries", 2)
    j.timeout_seconds = kw.get("timeout_seconds", 300)
    j.last_run_at = None
    j.last_run_status = None
    return j


def _make_run(**kw):
    r = MagicMock()
    r.run_id = kw.get("run_id", "run-001")
    r.job_id = kw.get("job_id", "job-001")
    r.status = kw.get("status", "queued")
    r.trigger_type = kw.get("trigger_type", "manual")
    r.triggered_by = kw.get("triggered_by", "user@test.com")
    r.attempt = kw.get("attempt", 1)
    r.idempotency_key = kw.get("idempotency_key", None)
    r.parameters = kw.get("parameters", {})
    return r


@pytest.mark.asyncio
async def test_create_run_returns_run_id():
    from app.services.scan_orchestrator import create_run
    db = AsyncMock()
    db.get.return_value = _make_job()
    db.execute.return_value.scalar_one_or_none.return_value = None

    run_id = await create_run("job-001", "manual", "user@test.com", None, None, db)

    db.add.assert_called_once()
    await db.commit.assert_awaited_once()
    assert isinstance(run_id, str)


@pytest.mark.asyncio
async def test_create_run_idempotency_returns_existing_run():
    from app.services.scan_orchestrator import create_run
    db = AsyncMock()
    db.get.return_value = _make_job()
    existing = _make_run(run_id="existing-001", status="running")
    db.execute.return_value.scalar_one_or_none.return_value = existing

    run_id = await create_run("job-001", "manual", "user@test.com", "key-abc", None, db)

    assert run_id == "existing-001"
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_create_run_idempotency_creates_new_after_failure():
    from app.services.scan_orchestrator import create_run
    db = AsyncMock()
    db.get.return_value = _make_job()
    failed = _make_run(run_id="failed-001", status="failed")
    db.execute.return_value.scalar_one_or_none.return_value = failed

    run_id = await create_run("job-001", "manual", "user@test.com", "key-abc", None, db)

    db.add.assert_called_once()
    assert run_id != "failed-001"


@pytest.mark.asyncio
async def test_create_run_raises_for_inactive_job():
    from app.services.scan_orchestrator import create_run
    db = AsyncMock()
    db.get.return_value = _make_job(is_active=False)

    with pytest.raises(ValueError, match="inactive"):
        await create_run("job-001", "manual", "u@t.com", None, None, db)


@pytest.mark.asyncio
async def test_create_run_raises_for_missing_job():
    from app.services.scan_orchestrator import create_run
    db = AsyncMock()
    db.get.return_value = None

    with pytest.raises(ValueError, match="not found"):
        await create_run("ghost-job", "manual", "u@t.com", None, None, db)


@pytest.mark.asyncio
async def test_placeholder_returns_warning_metrics():
    from app.services.scan_orchestrator import _run_placeholder

    with patch("app.services.scan_orchestrator.append_log", new_callable=AsyncMock):
        result = await _run_placeholder("profile_scan_placeholder", "run-001")

    assert result["warnings_count"] == 1
    assert result["errors_count"] == 0
    assert "placeholder" in result["result_summary"]["note"].lower()


@pytest.mark.asyncio
async def test_dispatch_handler_raises_for_unknown_type():
    from app.services.scan_orchestrator import _dispatch_handler

    with pytest.raises(ValueError, match="Unknown job_type"):
        await _dispatch_handler("bad_type", "job-001", "run-001", "conn-001", {})


@pytest.mark.asyncio
async def test_execute_run_skips_when_already_cancelled():
    from app.services import scan_orchestrator

    with patch("app.services.scan_orchestrator.AsyncSessionLocal") as mock_ctx:
        mock_db = AsyncMock()
        mock_db.get.return_value = _make_run(status="cancelled")
        mock_ctx.return_value.__aenter__.return_value = mock_db

        result = await scan_orchestrator._execute_run("run-001")

    assert result is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_scan_orchestrator.py -k "create_run or placeholder or dispatch or execute_run_skips" -v
```
Expected: `ImportError` — `scan_orchestrator` doesn't exist yet.

- [ ] **Step 3: Create `app/services/scan_orchestrator.py`**

```python
from __future__ import annotations

"""
Scan Orchestration Service.

Manages scan job run lifecycle: queued → running → succeeded/partial_success/failed/timed_out/cancelled.
Calls existing connector and discovery services; does not embed their logic.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import desc, select

from app.db.database import AsyncSessionLocal
from app.db.models import ScanJob, ScanJobRun, ScanJobRunLog

logger = logging.getLogger("dq_platform.scan_orchestrator")


# ─── Public: run creation ─────────────────────────────────────────────────────

async def create_run(
    job_id: str,
    trigger_type: str,
    triggered_by: Optional[str],
    idempotency_key: Optional[str],
    parameters_override: Optional[dict],
    db,
) -> str:
    """Create a queued ScanJobRun record. Returns run_id. Enforces idempotency."""
    job = await db.get(ScanJob, job_id)
    if not job:
        raise ValueError(f"Scan job {job_id} not found")
    if not job.is_active:
        raise ValueError(f"Scan job {job_id} is inactive")

    if idempotency_key:
        existing = await _find_run_by_idempotency_key(job_id, idempotency_key, db)
        if existing and existing.status not in ("failed", "cancelled", "timed_out"):
            return existing.run_id

    merged = {**(job.parameters or {}), **(parameters_override or {})}

    run = ScanJobRun(
        job_id=job_id,
        status="queued",
        trigger_type=trigger_type,
        triggered_by=triggered_by,
        attempt=1,
        idempotency_key=idempotency_key,
        parameters=merged or None,
    )
    db.add(run)
    await db.commit()
    return run.run_id


async def create_run_for_scheduler(job_id: str, db) -> str:
    """Create a queued run for scheduled (APScheduler) execution."""
    job = await db.get(ScanJob, job_id)
    if not job:
        raise ValueError(f"Scan job {job_id} not found")
    run = ScanJobRun(
        job_id=job_id,
        status="queued",
        trigger_type="scheduled",
        triggered_by="scheduler",
        attempt=1,
        parameters=job.parameters,
    )
    db.add(run)
    await db.commit()
    return run.run_id


# ─── Public: execution ────────────────────────────────────────────────────────

async def execute_run_with_retries(run_id: str) -> None:
    """Background task: execute a run and retry on failure up to job.max_retries times."""
    success = await _execute_run(run_id)
    if success:
        return

    async with AsyncSessionLocal() as db:
        run = await db.get(ScanJobRun, run_id)
        if not run:
            return
        job = await db.get(ScanJob, run.job_id)
        if not job:
            return
        max_retries = job.max_retries
        attempt = run.attempt
        job_id = run.job_id
        trigger_type = run.trigger_type
        triggered_by = run.triggered_by
        idempotency_key = run.idempotency_key
        parameters = run.parameters

    while not success and attempt < max_retries + 1:
        backoff = min(2 ** attempt, 30)
        await asyncio.sleep(backoff)
        attempt += 1

        async with AsyncSessionLocal() as db:
            retry_run = ScanJobRun(
                job_id=job_id,
                status="queued",
                trigger_type=trigger_type,
                triggered_by=triggered_by,
                attempt=attempt,
                idempotency_key=idempotency_key,
                parameters=parameters,
            )
            db.add(retry_run)
            await db.commit()
            run_id = retry_run.run_id

        success = await _execute_run(run_id)


async def append_log(
    run_id: str, level: str, message: str, context: Optional[dict] = None
) -> None:
    """Append a structured log entry for a run. Opens its own DB session."""
    async with AsyncSessionLocal() as db:
        entry = ScanJobRunLog(
            run_id=run_id,
            level=level,
            message=message[:5000],
            context=context,
        )
        db.add(entry)
        await db.commit()


# ─── Internal: run execution ──────────────────────────────────────────────────

async def _execute_run(run_id: str) -> bool:
    """Execute one run attempt. Returns True if the outcome is succeeded or partial_success."""
    job_id: str = ""
    job_type: str = ""
    connection_id: Optional[str] = None
    timeout_seconds: int = 300
    params: dict = {}

    async with AsyncSessionLocal() as db:
        run = await db.get(ScanJobRun, run_id)
        if not run or run.status != "queued":
            return False
        job = await db.get(ScanJob, run.job_id)
        if not job:
            return False

        job_id = job.job_id
        job_type = job.job_type
        connection_id = job.connection_id
        timeout_seconds = job.timeout_seconds
        params = run.parameters or {}

        run.status = "running"
        run.started_at = _now()
        await db.commit()

    start = time.monotonic()
    metrics: dict = {}
    error_msg: Optional[str] = None
    final_status = "failed"

    try:
        metrics = await asyncio.wait_for(
            _dispatch_handler(job_type, job_id, run_id, connection_id, params),
            timeout=float(timeout_seconds),
        )
        errors = metrics.get("errors_count", 0)
        assets = metrics.get("assets_scanned", 0)
        if errors == 0:
            final_status = "succeeded"
        elif assets > 0 and errors < assets:
            final_status = "partial_success"
        else:
            final_status = "failed"

    except asyncio.TimeoutError:
        final_status = "timed_out"
        error_msg = f"Timed out after {timeout_seconds}s"
    except Exception as exc:
        final_status = "failed"
        error_msg = str(exc)[:2000]
        logger.exception("Scan run %s failed: %s", run_id, exc)

    duration = time.monotonic() - start
    ended = _now()

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

    return final_status in ("succeeded", "partial_success")


# ─── Internal: dispatch + handlers ───────────────────────────────────────────

async def _dispatch_handler(
    job_type: str,
    job_id: str,
    run_id: str,
    connection_id: Optional[str],
    params: dict,
) -> dict:
    if job_type == "connection_test":
        return await _run_connection_test(connection_id, run_id)
    if job_type == "metadata_discovery":
        return await _run_metadata_discovery(connection_id, run_id, params)
    if job_type == "asset_refresh":
        return await _run_asset_refresh(connection_id, run_id, params)
    if job_type == "source_health_check":
        return await _run_source_health_check(connection_id, run_id)
    if job_type in ("profile_scan_placeholder", "rule_scan_placeholder"):
        return await _run_placeholder(job_type, run_id)
    raise ValueError(f"Unknown job_type: {job_type}")


async def _run_connection_test(connection_id: Optional[str], run_id: str) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for connection_test")

    from app.db.models import SnowflakeConnection

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SnowflakeConnection).where(
                SnowflakeConnection.connection_id == connection_id
            )
        )
        conn = result.scalar_one_or_none()
    if not conn:
        raise ValueError(f"Connection {connection_id} not found")

    await append_log(run_id, "INFO", f"Testing connection: {conn.connection_name}")
    ok, error = await asyncio.to_thread(_test_connection_sync, conn)
    await append_log(run_id, "INFO" if ok else "ERROR", f"Connection test: {'ok' if ok else error}")
    return {
        "assets_scanned": 0,
        "errors_count": 0 if ok else 1,
        "warnings_count": 0,
        "result_summary": {"connection_ok": ok, "error": error, "connection_name": conn.connection_name},
    }


def _test_connection_sync(conn) -> tuple[bool, Optional[str]]:
    from app.api.connections import _open_connector
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute("SELECT 1")
        cur.close()
        sf.close()
        return True, None
    except Exception as exc:
        return False, str(exc)[:500]


async def _run_source_health_check(connection_id: Optional[str], run_id: str) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for source_health_check")

    from app.db.models import SnowflakeConnection

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SnowflakeConnection).where(
                SnowflakeConnection.connection_id == connection_id
            )
        )
        conn = result.scalar_one_or_none()
    if not conn:
        raise ValueError(f"Connection {connection_id} not found")

    await append_log(run_id, "INFO", f"Health check for: {conn.connection_name}")
    health = await asyncio.to_thread(_health_check_sync, conn)
    is_ok = health.get("status") == "ok"
    await append_log(run_id, "INFO" if is_ok else "WARNING", f"Health status: {health.get('status')}")
    return {
        "assets_scanned": 0,
        "errors_count": 0 if is_ok else 1,
        "warnings_count": 0,
        "result_summary": health,
    }


def _health_check_sync(conn) -> dict:
    from app.api.connections import _open_connector
    try:
        sf = _open_connector(conn)
        cur = sf.cursor()
        cur.execute("SELECT CURRENT_TIMESTAMP()")
        ts = cur.fetchone()
        cur.close()
        sf.close()
        return {"status": "ok", "checked_at": str(ts[0]) if ts else None}
    except Exception as exc:
        return {"status": "error", "error": str(exc)[:500]}


async def _run_metadata_discovery(
    connection_id: Optional[str], run_id: str, params: dict
) -> dict:
    if not connection_id:
        raise ValueError("connection_id is required for metadata_discovery")

    from app.services import job_tracker as _jt
    from app.services.discovery_service import run_discovery

    await append_log(run_id, "INFO", "Starting metadata discovery")
    tmp_job_id = _jt.create_job("metadata_discovery", total=0, meta={"scan_run_id": run_id})

    payload = {"connection_id": connection_id, "triggered_by": "scan_orchestrator", **params}
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


async def _run_asset_refresh(
    connection_id: Optional[str], run_id: str, params: dict
) -> dict:
    await append_log(run_id, "INFO", "Starting asset refresh (delegates to metadata discovery)")
    return await _run_metadata_discovery(connection_id, run_id, params)


async def _run_placeholder(job_type: str, run_id: str) -> dict:
    msg = f"{job_type} is a placeholder — implementation pending"
    await append_log(run_id, "WARNING", msg)
    return {
        "assets_scanned": 0,
        "errors_count": 0,
        "warnings_count": 1,
        "result_summary": {"note": msg},
    }


async def _find_run_by_idempotency_key(job_id: str, key: str, db) -> Optional[ScanJobRun]:
    result = await db.execute(
        select(ScanJobRun)
        .where(ScanJobRun.job_id == job_id, ScanJobRun.idempotency_key == key)
        .order_by(desc(ScanJobRun.created_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_scan_orchestrator.py -k "create_run or placeholder or dispatch or execute_run_skips" -v
```
Expected: all 9 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add app/services/scan_orchestrator.py tests/test_scan_orchestrator.py
git commit -m "feat(scan-orchestration): add scan_orchestrator service with run lifecycle and job handlers"
```

---

## Task 5: Scan Orchestrator — append_log + retry tests

**Files:**
- Modify: `tests/test_scan_orchestrator.py` (add tests for append_log and execute_run_with_retries)

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_scan_orchestrator.py`:

```python
@pytest.mark.asyncio
async def test_append_log_adds_entry_to_db():
    from app.services import scan_orchestrator

    with patch("app.services.scan_orchestrator.AsyncSessionLocal") as mock_ctx:
        mock_db = AsyncMock()
        mock_ctx.return_value.__aenter__.return_value = mock_db

        await scan_orchestrator.append_log("run-001", "WARNING", "Something odd", {"x": 1})

    mock_db.add.assert_called_once()
    added = mock_db.add.call_args[0][0]
    assert added.run_id == "run-001"
    assert added.level == "WARNING"
    assert added.message == "Something odd"
    assert added.context == {"x": 1}
    mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_append_log_truncates_long_messages():
    from app.services import scan_orchestrator

    long_msg = "x" * 10_000

    with patch("app.services.scan_orchestrator.AsyncSessionLocal") as mock_ctx:
        mock_db = AsyncMock()
        mock_ctx.return_value.__aenter__.return_value = mock_db

        await scan_orchestrator.append_log("run-001", "ERROR", long_msg)

    added = mock_db.add.call_args[0][0]
    assert len(added.message) == 5000


@pytest.mark.asyncio
async def test_create_run_merges_parameters():
    from app.services.scan_orchestrator import create_run

    db = AsyncMock()
    job = _make_job(parameters={"base_key": "base_val"})
    db.get.return_value = job
    db.execute.return_value.scalar_one_or_none.return_value = None

    await create_run("job-001", "manual", "u@t.com", None, {"override_key": "override_val"}, db)

    added_run = db.add.call_args[0][0]
    assert added_run.parameters["base_key"] == "base_val"
    assert added_run.parameters["override_key"] == "override_val"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_append_log_adds_entry_to_db tests/test_scan_orchestrator.py::test_append_log_truncates_long_messages tests/test_scan_orchestrator.py::test_create_run_merges_parameters -v
```
Expected: `FAILED` (functions not yet implemented or tests need service).

- [ ] **Step 3: Verify the implementation already covers these (no new code needed)**

The `append_log` and parameter merging were implemented in Task 4. These tests verify the behavior.

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_scan_orchestrator.py::test_append_log_adds_entry_to_db tests/test_scan_orchestrator.py::test_append_log_truncates_long_messages tests/test_scan_orchestrator.py::test_create_run_merges_parameters -v
```
Expected: all 3 `PASSED`

- [ ] **Step 5: Run full orchestrator test suite**

```bash
python -m pytest tests/test_scan_orchestrator.py -v
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/test_scan_orchestrator.py
git commit -m "test(scan-orchestration): add log truncation, parameter merge, and append_log tests"
```

---

## Task 6: REST API Router

**Files:**
- Create: `app/api/scan_jobs.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_scan_jobs_api.py`:

```python
"""Tests for scan_jobs API serializers and schema validation."""
import pytest
from unittest.mock import MagicMock
from datetime import datetime


def _make_job(**kw):
    j = MagicMock()
    j.job_id = kw.get("job_id", "job-001")
    j.connection_id = kw.get("connection_id", None)
    j.job_name = kw.get("job_name", "Test Job")
    j.job_type = kw.get("job_type", "connection_test")
    j.is_active = kw.get("is_active", True)
    j.schedule_frequency = kw.get("schedule_frequency", "on_demand")
    j.cron_expr = None
    j.timezone = "UTC"
    j.max_retries = 2
    j.timeout_seconds = 300
    j.parameters = None
    j.last_run_at = None
    j.last_run_status = None
    j.created_by = "user-001"
    j.created_at = datetime(2026, 6, 10, 12, 0, 0)
    j.updated_at = datetime(2026, 6, 10, 12, 0, 0)
    return j


def _make_run(**kw):
    r = MagicMock()
    r.run_id = kw.get("run_id", "run-001")
    r.job_id = kw.get("job_id", "job-001")
    r.status = kw.get("status", "queued")
    r.trigger_type = "manual"
    r.triggered_by = "user@test.com"
    r.attempt = 1
    r.started_at = None
    r.ended_at = None
    r.duration_seconds = None
    r.assets_scanned = 0
    r.errors_count = 0
    r.warnings_count = 0
    r.error_message = None
    r.result_summary = None
    r.idempotency_key = None
    r.created_at = datetime(2026, 6, 10, 12, 0, 0)
    return r


def _make_log(**kw):
    lg = MagicMock()
    lg.log_id = kw.get("log_id", "log-001")
    lg.run_id = kw.get("run_id", "run-001")
    lg.level = "INFO"
    lg.message = "Test log entry"
    lg.context = None
    lg.logged_at = datetime(2026, 6, 10, 12, 0, 0)
    return lg


def test_job_dict_serializes_all_fields():
    from app.api.scan_jobs import _job_dict
    job = _make_job()
    result = _job_dict(job)

    assert result["job_id"] == "job-001"
    assert result["job_name"] == "Test Job"
    assert result["job_type"] == "connection_test"
    assert result["is_active"] is True
    assert result["schedule_frequency"] == "on_demand"
    assert result["max_retries"] == 2
    assert result["timeout_seconds"] == 300
    assert result["last_run_at"] is None
    assert "created_at" in result
    assert "updated_at" in result


def test_job_dict_formats_last_run_at():
    from app.api.scan_jobs import _job_dict
    job = _make_job()
    job.last_run_at = datetime(2026, 6, 10, 15, 30, 0)
    result = _job_dict(job)
    assert result["last_run_at"] == "2026-06-10T15:30:00"


def test_run_dict_serializes_all_fields():
    from app.api.scan_jobs import _run_dict
    run = _make_run()
    result = _run_dict(run)

    assert result["run_id"] == "run-001"
    assert result["job_id"] == "job-001"
    assert result["status"] == "queued"
    assert result["attempt"] == 1
    assert result["assets_scanned"] == 0
    assert result["errors_count"] == 0
    assert result["duration_seconds"] is None
    assert "created_at" in result


def test_log_dict_serializes_all_fields():
    from app.api.scan_jobs import _log_dict
    lg = _make_log()
    result = _log_dict(lg)

    assert result["log_id"] == "log-001"
    assert result["run_id"] == "run-001"
    assert result["level"] == "INFO"
    assert result["message"] == "Test log entry"
    assert result["context"] is None
    assert "logged_at" in result


def test_router_has_expected_routes():
    from app.api.scan_jobs import router
    paths = {r.path for r in router.routes}
    assert "/scan-jobs" in paths
    assert "/scan-jobs/{job_id}" in paths
    assert "/scan-jobs/{job_id}/trigger" in paths
    assert "/scan-jobs/{job_id}/runs" in paths
    assert "/scan-jobs/{job_id}/runs/{run_id}" in paths
    assert "/scan-jobs/{job_id}/runs/{run_id}/logs" in paths
    assert "/scan-jobs/{job_id}/runs/{run_id}/cancel" in paths
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_scan_jobs_api.py -v
```
Expected: `ImportError` — `app.api.scan_jobs` doesn't exist yet.

- [ ] **Step 3: Create `app/api/scan_jobs.py`**

```python
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import desc, select

from app.core.security import get_current_user
from app.db.database import get_db
from app.db.models import ScanJob, ScanJobRun, ScanJobRunLog
from app.schemas.scan_job import ScanJobCreate, ScanJobUpdate, TriggerRequest
from app.services import scan_orchestrator

router = APIRouter(prefix="/scan-jobs", tags=["Scan Orchestration"])


# ─── Job CRUD ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_scan_job(
    req: ScanJobCreate,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    job = ScanJob(
        connection_id=req.connection_id,
        job_name=req.job_name,
        job_type=req.job_type,
        schedule_frequency=req.schedule_frequency,
        cron_expr=req.cron_expr,
        timezone=req.timezone,
        max_retries=req.max_retries,
        timeout_seconds=req.timeout_seconds,
        parameters=req.parameters,
        created_by=user.get("user_id"),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    if job.schedule_frequency != "on_demand":
        from app.services.scheduler_service import schedule_scan_job
        schedule_scan_job(job)

    return _job_dict(job)


@router.get("")
async def list_scan_jobs(
    job_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    connection_id: Optional[str] = Query(None),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    q = select(ScanJob)
    if job_type:
        q = q.where(ScanJob.job_type == job_type)
    if is_active is not None:
        q = q.where(ScanJob.is_active == is_active)
    if connection_id:
        q = q.where(ScanJob.connection_id == connection_id)
    q = q.order_by(desc(ScanJob.created_at))
    jobs = (await db.execute(q)).scalars().all()
    return [_job_dict(j) for j in jobs]


@router.get("/{job_id}")
async def get_scan_job(
    job_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")
    return _job_dict(job)


@router.patch("/{job_id}")
async def update_scan_job(
    job_id: str,
    req: ScanJobUpdate,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from app.services.scheduler_service import schedule_scan_job, unschedule_scan_job
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")

    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    await db.commit()
    await db.refresh(job)

    unschedule_scan_job(job_id)
    if job.is_active and job.schedule_frequency != "on_demand":
        schedule_scan_job(job)

    return _job_dict(job)


@router.delete("/{job_id}", status_code=204)
async def delete_scan_job(
    job_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    from app.services.scheduler_service import unschedule_scan_job
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")
    unschedule_scan_job(job_id)
    await db.delete(job)
    await db.commit()


# ─── Trigger + Run management ─────────────────────────────────────────────────

@router.post("/{job_id}/trigger", status_code=202)
async def trigger_scan_job(
    job_id: str,
    req: TriggerRequest,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    job = await db.get(ScanJob, job_id)
    if not job:
        raise HTTPException(404, "Scan job not found")
    if not job.is_active:
        raise HTTPException(409, "Scan job is inactive")

    run_id = await scan_orchestrator.create_run(
        job_id=job_id,
        trigger_type="manual",
        triggered_by=user.get("email") or user.get("user_id"),
        idempotency_key=req.idempotency_key,
        parameters_override=req.parameters_override,
        db=db,
    )
    background_tasks.add_task(scan_orchestrator.execute_run_with_retries, run_id)
    return {"job_id": job_id, "run_id": run_id, "status": "queued"}


@router.get("/{job_id}/runs")
async def list_runs(
    job_id: str,
    limit: int = Query(50, ge=1, le=500),
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not await db.get(ScanJob, job_id):
        raise HTTPException(404, "Scan job not found")
    q = (
        select(ScanJobRun)
        .where(ScanJobRun.job_id == job_id)
        .order_by(desc(ScanJobRun.created_at))
        .limit(limit)
    )
    runs = (await db.execute(q)).scalars().all()
    return [_run_dict(r) for r in runs]


@router.get("/{job_id}/runs/{run_id}")
async def get_run(
    job_id: str,
    run_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    run = await db.get(ScanJobRun, run_id)
    if not run or run.job_id != job_id:
        raise HTTPException(404, "Run not found")
    return _run_dict(run)


@router.get("/{job_id}/runs/{run_id}/logs")
async def get_run_logs(
    job_id: str,
    run_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    run = await db.get(ScanJobRun, run_id)
    if not run or run.job_id != job_id:
        raise HTTPException(404, "Run not found")
    q = (
        select(ScanJobRunLog)
        .where(ScanJobRunLog.run_id == run_id)
        .order_by(ScanJobRunLog.logged_at)
    )
    logs = (await db.execute(q)).scalars().all()
    return [_log_dict(lg) for lg in logs]


@router.post("/{job_id}/runs/{run_id}/cancel", status_code=202)
async def cancel_run(
    job_id: str,
    run_id: str,
    db=Depends(get_db),
    user: dict = Depends(get_current_user),
):
    run = await db.get(ScanJobRun, run_id)
    if not run or run.job_id != job_id:
        raise HTTPException(404, "Run not found")
    if run.status not in ("queued", "running"):
        raise HTTPException(409, f"Cannot cancel run with status '{run.status}'")
    run.status = "cancelled"
    from datetime import datetime, timezone
    run.ended_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    return {"run_id": run_id, "status": "cancelled"}


# ─── Serializers ──────────────────────────────────────────────────────────────

def _job_dict(job: ScanJob) -> dict:
    return {
        "job_id": job.job_id,
        "connection_id": job.connection_id,
        "job_name": job.job_name,
        "job_type": job.job_type,
        "is_active": job.is_active,
        "schedule_frequency": job.schedule_frequency,
        "cron_expr": job.cron_expr,
        "timezone": job.timezone,
        "max_retries": job.max_retries,
        "timeout_seconds": job.timeout_seconds,
        "parameters": job.parameters,
        "last_run_at": job.last_run_at.isoformat() if job.last_run_at else None,
        "last_run_status": job.last_run_status,
        "created_by": job.created_by,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


def _run_dict(run: ScanJobRun) -> dict:
    return {
        "run_id": run.run_id,
        "job_id": run.job_id,
        "status": run.status,
        "trigger_type": run.trigger_type,
        "triggered_by": run.triggered_by,
        "attempt": run.attempt,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "ended_at": run.ended_at.isoformat() if run.ended_at else None,
        "duration_seconds": run.duration_seconds,
        "assets_scanned": run.assets_scanned,
        "errors_count": run.errors_count,
        "warnings_count": run.warnings_count,
        "error_message": run.error_message,
        "result_summary": run.result_summary,
        "idempotency_key": run.idempotency_key,
        "created_at": run.created_at.isoformat(),
    }


def _log_dict(lg: ScanJobRunLog) -> dict:
    return {
        "log_id": lg.log_id,
        "run_id": lg.run_id,
        "level": lg.level,
        "message": lg.message,
        "context": lg.context,
        "logged_at": lg.logged_at.isoformat(),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_scan_jobs_api.py -v
```
Expected: all 8 tests `PASSED`

- [ ] **Step 5: Commit**

```bash
git add app/api/scan_jobs.py tests/test_scan_jobs_api.py
git commit -m "feat(scan-orchestration): add scan_jobs REST API router with 10 endpoints"
```

---

## Task 7: Scheduler Integration + main.py wiring

**Files:**
- Modify: `app/services/scheduler_service.py` (append 4 functions)
- Modify: `app/main.py` (import router; call `load_all_scan_schedules` in lifespan)

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_scan_jobs_api.py`:

```python
def test_schedule_scan_job_registers_with_apscheduler():
    from unittest.mock import patch, MagicMock
    from app.services.scheduler_service import schedule_scan_job

    job = MagicMock()
    job.job_id = "job-sched-001"
    job.job_name = "Daily Discovery"
    job.schedule_frequency = "daily"
    job.cron_expr = None
    job.timezone = "UTC"

    with patch("app.services.scheduler_service.scheduler") as mock_sched:
        mock_sched.get_job.return_value = None
        schedule_scan_job(job)
        mock_sched.add_job.assert_called_once()
        call_kwargs = mock_sched.add_job.call_args[1]
        assert call_kwargs["id"] == "scan_job:job-sched-001"
        assert call_kwargs["replace_existing"] is True


def test_schedule_scan_job_on_demand_does_nothing():
    from unittest.mock import patch, MagicMock
    from app.services.scheduler_service import schedule_scan_job

    job = MagicMock()
    job.schedule_frequency = "on_demand"

    with patch("app.services.scheduler_service.scheduler") as mock_sched:
        schedule_scan_job(job)
        mock_sched.add_job.assert_not_called()


def test_unschedule_scan_job_removes_from_apscheduler():
    from unittest.mock import patch, MagicMock
    from app.services.scheduler_service import unschedule_scan_job

    with patch("app.services.scheduler_service.scheduler") as mock_sched:
        mock_sched.get_job.return_value = MagicMock()
        unschedule_scan_job("job-001")
        mock_sched.remove_job.assert_called_once_with("scan_job:job-001")


def test_scan_jobs_router_registered_in_main():
    """Verify scan_jobs router is included in the FastAPI app."""
    from app.main import app
    prefixes = {r.path for r in app.routes}
    assert any("/scan-jobs" in p for p in prefixes), "scan_jobs router not registered in main.py"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python -m pytest tests/test_scan_jobs_api.py::test_schedule_scan_job_registers_with_apscheduler tests/test_scan_jobs_api.py::test_schedule_scan_job_on_demand_does_nothing tests/test_scan_jobs_api.py::test_unschedule_scan_job_removes_from_apscheduler tests/test_scan_jobs_api.py::test_scan_jobs_router_registered_in_main -v
```
Expected: `AttributeError` or `AssertionError` — functions not added yet.

- [ ] **Step 3: Append functions to `app/services/scheduler_service.py`**

Add at the end of the file (after all existing code):

```python
# ── Scan Job scheduling ───────────────────────────────────────────────────────

def schedule_scan_job(job) -> None:
    """Register a scan job with APScheduler using its schedule_frequency."""
    trigger = build_trigger(
        frequency=job.schedule_frequency,
        cron_expr=job.cron_expr,
        timezone=job.timezone,
    )
    if trigger is None:
        return

    apscheduler_id = f"scan_job:{job.job_id}"
    if scheduler.get_job(apscheduler_id):
        scheduler.remove_job(apscheduler_id)

    scheduler.add_job(
        _make_scan_runner(job.job_id),
        trigger=trigger,
        id=apscheduler_id,
        replace_existing=True,
    )
    logger.info(
        "Scheduled scan job %s (%s) freq=%s", job.job_id, job.job_name, job.schedule_frequency
    )


def unschedule_scan_job(job_id: str) -> None:
    """Remove a scan job from APScheduler."""
    apscheduler_id = f"scan_job:{job_id}"
    if scheduler.get_job(apscheduler_id):
        scheduler.remove_job(apscheduler_id)
        logger.info("Unscheduled scan job %s", job_id)


def _make_scan_runner(job_id: str):
    async def run():
        from app.db.database import AsyncSessionLocal
        from app.services.scan_orchestrator import (
            create_run_for_scheduler,
            execute_run_with_retries,
        )
        async with AsyncSessionLocal() as db:
            try:
                run_id = await create_run_for_scheduler(job_id=job_id, db=db)
            except Exception as exc:
                logger.error(
                    "Could not create scheduled run for scan job %s: %s", job_id, exc
                )
                return
        await execute_run_with_retries(run_id)
    return run


async def load_all_scan_schedules(db) -> None:
    """Called at startup: register all active scheduled scan jobs with APScheduler."""
    from app.db.models import ScanJob
    from sqlalchemy import select

    result = await db.execute(
        select(ScanJob).where(
            ScanJob.is_active == True,
            ScanJob.schedule_frequency != "on_demand",
        )
    )
    jobs = result.scalars().all()
    for job in jobs:
        try:
            schedule_scan_job(job)
        except Exception as exc:
            logger.error("Failed to schedule scan job %s at startup: %s", job.job_id, exc)
    logger.info("Loaded %d scan job schedules at startup", len(jobs))
```

- [ ] **Step 4: Update `app/main.py`**

**4a. Add import** — In the import block (lines 18–32), add `scan_jobs` to the imports:

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
    # Scan Orchestration
    scan_jobs,
)
```

**4b. Register router** — After `app.include_router(metadata.router)` and before `app.include_router(assets_compat.router)`:

```python
app.include_router(scan_jobs.router)
```

**4c. Call `load_all_scan_schedules` at startup** — Inside `_init_db()` in the lifespan, after `await load_all_schedules(db)`:

```python
        from app.services.scheduler_service import load_all_scan_schedules
        async with AsyncSessionLocal() as db:
            await load_all_scan_schedules(db)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
python -m pytest tests/test_scan_jobs_api.py -v
```
Expected: all tests `PASSED`

- [ ] **Step 6: Run the full test suite**

```bash
python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```
Expected: no regressions — only the new tests are added.

- [ ] **Step 7: Commit**

```bash
git add app/services/scheduler_service.py app/main.py tests/test_scan_jobs_api.py
git commit -m "feat(scan-orchestration): wire scheduler integration and register scan_jobs router in main"
```

---

## Task 8: Full Test Run + Smoke Check

**Files:**
- No new files — verification only.

- [ ] **Step 1: Run all new tests**

```bash
python -m pytest tests/test_scan_orchestrator.py tests/test_scan_jobs_api.py -v
```
Expected: all tests `PASSED`.

- [ ] **Step 2: Verify existing tests have no regressions**

```bash
python -m pytest tests/ -v --tb=short -q
```
Expected: all pre-existing tests still pass. No failures in unrelated modules.

- [ ] **Step 3: Verify import chain is clean**

```bash
python -c "from app.api.scan_jobs import router; from app.services.scan_orchestrator import create_run, execute_run_with_retries, append_log; from app.db.models import ScanJob, ScanJobRun, ScanJobRunLog; print('All imports OK')"
```
Expected: `All imports OK`

- [ ] **Step 4: Verify API routes are discoverable**

```bash
python -c "
from app.main import app
scan_routes = [r for r in app.routes if hasattr(r, 'path') and '/scan-jobs' in r.path]
for r in scan_routes:
    print(r.methods, r.path)
"
```
Expected output (10 route entries):
```
{'POST'} /scan-jobs
{'GET'} /scan-jobs
{'GET'} /scan-jobs/{job_id}
{'PATCH'} /scan-jobs/{job_id}
{'DELETE'} /scan-jobs/{job_id}
{'POST'} /scan-jobs/{job_id}/trigger
{'GET'} /scan-jobs/{job_id}/runs
{'GET'} /scan-jobs/{job_id}/runs/{run_id}
{'GET'} /scan-jobs/{job_id}/runs/{run_id}/logs
{'POST'} /scan-jobs/{job_id}/runs/{run_id}/cancel
```

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "feat(scan-orchestration): Module 4 complete — scan orchestration system"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Task |
|---|---|
| Job definition model | Task 1 (ScanJob) |
| Job run model | Task 1 (ScanJobRun) |
| Manual trigger support | Task 6 (`POST /{job_id}/trigger`) |
| Scheduled execution | Task 7 (APScheduler integration) |
| Queue/worker execution model | Task 4 (`execute_run_with_retries` + background_tasks) |
| Statuses: queued/running/succeeded/partial_success/failed/timed_out/cancelled | Task 4 (`_execute_run`) |
| Retry handling | Task 4 (`execute_run_with_retries`, exponential backoff) |
| Idempotent reruns | Task 4 (`_find_run_by_idempotency_key`) |
| Logs per run | Task 1 (ScanJobRunLog) + Task 4 (`append_log`) |
| Metrics per run (started_at, ended_at, duration, assets_scanned, errors_count, warnings_count) | Task 1 + Task 4 |
| Safe separation from connector logic | Task 4 (orchestrator calls services, not inline) |
| connection_test job type | Task 4 (`_run_connection_test`) |
| metadata_discovery job type | Task 4 (`_run_metadata_discovery`) |
| asset_refresh job type | Task 4 (`_run_asset_refresh`) |
| profile_scan_placeholder job type | Task 4 (`_run_placeholder`) |
| rule_scan_placeholder job type | Task 4 (`_run_placeholder`) |
| source_health_check job type | Task 4 (`_run_source_health_check`) |
| Per-source concurrency control | Inherited from existing `asyncio.Semaphore` in `run_discovery` |
| View execution history | Task 6 (`GET /{job_id}/runs`) |
| Inspect logs and status | Task 6 (`GET /{job_id}/runs/{run_id}/logs`) |
| Rerun jobs safely | Task 4 (idempotency_key) |

### No Placeholder Scan

- All code blocks are complete implementations — no TODOs, no TBDs.
- `_run_placeholder` is intentional (the spec explicitly lists those job types as placeholders).

### Type Consistency Check

- `ScanJob.job_id` → used as FK in `ScanJobRun.job_id` ✓
- `ScanJobRun.run_id` → used as FK in `ScanJobRunLog.run_id` ✓
- `create_run()` adds `ScanJobRun` → `run.run_id` returned ✓
- `execute_run_with_retries(run_id)` → `_execute_run(run_id)` → `db.get(ScanJobRun, run_id)` ✓
- `schedule_scan_job(job)` takes a `ScanJob` instance; `job.job_id`, `job.schedule_frequency`, `job.cron_expr`, `job.timezone` all used ✓
- `_make_scan_runner(job_id)` → creates `create_run_for_scheduler(job_id=job_id, db=db)` ✓
- `_job_dict` / `_run_dict` / `_log_dict` field names match model column names ✓

---

## Next Integration Notes for Results Storage

When Results Storage (Module 5) is built, integrate with this orchestration layer at these hook points:

1. **`_run_metadata_discovery`** — after `run_discovery()` completes, emit a `scan.completed` event with `run_id`, `assets_scanned`, `errors_count` for downstream storage.
2. **`ScanJobRun.result_summary`** — extend the VARIANT column to include richer output (e.g. per-table scan results) as results storage evolves.
3. **`ScanJobRunLog`** — can be streamed to an external log aggregator (e.g. Snowflake STREAM, Kafka) by adding an event emitter in `append_log`.
4. **`_run_placeholder` job types** (`profile_scan_placeholder`, `rule_scan_placeholder`) — replace with real implementations that call the profiling and rule engine services respectively once those modules are complete.
5. **Concurrency control** — `execute_run_with_retries` currently runs one job at a time per FastAPI background task. Add a global semaphore in `dispatch_handler` keyed by `connection_id` when per-source concurrency limits are needed.
