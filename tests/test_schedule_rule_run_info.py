from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.api.schedules import _format_rule_run_info
from app.db.models import DQRuleRun


def _make_run(**overrides):
    run = MagicMock(spec=DQRuleRun)
    run.rule_id = overrides.get("rule_id", "rule-1")
    run.status = overrides.get("status", "passed")
    run.execution_start_time = overrides.get(
        "execution_start_time", datetime(2026, 6, 13, 2, 0, 0, tzinfo=timezone.utc)
    )
    run.execution_end_time = overrides.get(
        "execution_end_time", datetime(2026, 6, 13, 2, 0, 1, 400000, tzinfo=timezone.utc)
    )
    # created_at defaults to execution_end_time if not overridden, but always set to something
    default_created_at = run.execution_end_time or datetime(2026, 6, 13, 2, 0, 1, 400000, tzinfo=timezone.utc)
    run.created_at = overrides.get("created_at", default_created_at)
    run.failed_rows_count = overrides.get("failed_rows_count", 0)
    run.total_rows_scanned = overrides.get("total_rows_scanned", 50000)
    run.failure_percentage = overrides.get("failure_percentage", 0.0)
    run.error_message = overrides.get("error_message", None)
    run.ai_explanation = overrides.get("ai_explanation", None)
    return run


def test_active_rule_with_run_returns_full_info():
    run = _make_run()
    info = _format_rule_run_info(run, "active", "2026-06-14T02:00:00")

    assert info["status"] == "active"
    assert info["last_run_status"] == "passed"
    assert info["last_run_at"] == "2026-06-13T02:00:01.400000+00:00"
    assert info["last_duration_ms"] == 1400
    assert info["next_run"] == "2026-06-14T02:00:00"
    assert info["failed_rows_count"] == 0
    assert info["total_rows_scanned"] == 50000
    assert info["failure_percentage"] == 0.0
    assert info["error_message"] is None
    assert info["ai_explanation"] is None


def test_disabled_rule_has_no_next_run():
    run = _make_run()
    info = _format_rule_run_info(run, "disabled", "2026-06-14T02:00:00")

    assert info["status"] == "disabled"
    assert info["next_run"] is None


def test_rule_with_no_run_returns_nulls():
    info = _format_rule_run_info(None, "active", "2026-06-14T02:00:00")

    assert info["status"] == "active"
    assert info["last_run_status"] is None
    assert info["last_run_at"] is None
    assert info["last_duration_ms"] is None
    assert info["next_run"] == "2026-06-14T02:00:00"
    assert info["failed_rows_count"] is None
    assert info["total_rows_scanned"] is None
    assert info["failure_percentage"] is None
    assert info["error_message"] is None
    assert info["ai_explanation"] is None


def test_run_missing_end_time_has_no_duration():
    run = _make_run(execution_end_time=None)
    info = _format_rule_run_info(run, "active", None)

    assert info["last_duration_ms"] is None
    assert info["last_run_at"] == run.created_at.isoformat()
