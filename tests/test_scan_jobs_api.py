"""Tests for scan_jobs API serializers and router structure."""
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
