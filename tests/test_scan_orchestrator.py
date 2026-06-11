import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ─── Model smoke tests ────────────────────────────────────────────────────────

def test_scan_job_model_has_required_fields():
    from app.db.models import ScanJob, ScanJobRun, ScanJobRunLog

    job = ScanJob(job_name="Test", job_type="connection_test")
    assert job.job_id is not None
    assert len(job.job_id) == 36   # valid UUID string

    run = ScanJobRun(job_id=job.job_id)
    assert run.run_id is not None
    assert run.job_id == job.job_id

    log = ScanJobRunLog(run_id=run.run_id, message="hello")
    assert log.log_id is not None
    assert log.run_id == run.run_id


def test_migration_file_exists():
    import os
    path = "migrations/versions/0015_scan_jobs.py"
    assert os.path.exists(path), f"Migration file missing: {path}"


def test_scan_job_create_validates_job_type():
    from pydantic import ValidationError
    from app.schemas.scan_job import ScanJobCreate

    req = ScanJobCreate(job_name="My Job", job_type="connection_test")
    assert req.job_type == "connection_test"
    assert req.schedule_frequency == "on_demand"
    assert req.max_retries == 2
    assert req.timeout_seconds == 300

    with pytest.raises(ValidationError):
        ScanJobCreate(job_name="Bad", job_type="invalid_type")


def test_scan_job_create_validates_frequency():
    from pydantic import ValidationError
    from app.schemas.scan_job import ScanJobCreate

    req = ScanJobCreate(job_name="Sched", job_type="metadata_discovery", schedule_frequency="daily")
    assert req.schedule_frequency == "daily"

    with pytest.raises(ValidationError):
        ScanJobCreate(job_name="Bad", job_type="connection_test", schedule_frequency="yearly")


def test_trigger_request_optional_fields():
    from app.schemas.scan_job import TriggerRequest

    empty = TriggerRequest()
    assert empty.idempotency_key is None
    assert empty.parameters_override is None

    with_key = TriggerRequest(idempotency_key="abc-123", parameters_override={"key": "val"})
    assert with_key.idempotency_key == "abc-123"


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
