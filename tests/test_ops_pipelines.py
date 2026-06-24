"""Unit tests for the pipelines API module (no real DB)."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock
from datetime import datetime


def _make_pipeline(**kwargs):
    p = MagicMock()
    p.pipeline_id = kwargs.get("pipeline_id", "pid-1")
    p.name = kwargs.get("name", "Test Pipeline")
    p.description = kwargs.get("description", None)
    p.trigger_type = kwargs.get("trigger_type", "manual")
    p.cron_expr = kwargs.get("cron_expr", None)
    p.trigger_config = kwargs.get("trigger_config", None)
    p.connection_ids = kwargs.get("connection_ids", [])
    p.is_active = kwargs.get("is_active", True)
    p.timeout_seconds = kwargs.get("timeout_seconds", 3600)
    p.max_retries = kwargs.get("max_retries", 0)
    p.created_by = kwargs.get("created_by", "user@test.com")
    p.created_at = kwargs.get("created_at", datetime(2026, 1, 1))
    p.updated_at = kwargs.get("updated_at", datetime(2026, 1, 1))
    p.steps = kwargs.get("steps", [])
    return p


def _make_step(**kwargs):
    s = MagicMock()
    s.step_id = kwargs.get("step_id", "step-1")
    s.pipeline_id = kwargs.get("pipeline_id", "pid-1")
    s.name = kwargs.get("name", "My Step")
    s.step_order = kwargs.get("step_order", 0)
    s.step_type = kwargs.get("step_type", "scan_job")
    s.step_config = kwargs.get("step_config", None)
    s.depends_on = kwargs.get("depends_on", [])
    s.timeout_seconds = kwargs.get("timeout_seconds", 1800)
    s.max_retries = kwargs.get("max_retries", 0)
    s.created_at = kwargs.get("created_at", datetime(2026, 1, 1))
    s.updated_at = kwargs.get("updated_at", datetime(2026, 1, 1))
    return s


def _make_run(**kwargs):
    r = MagicMock()
    r.run_id = kwargs.get("run_id", "run-1")
    r.pipeline_id = kwargs.get("pipeline_id", "pid-1")
    r.status = kwargs.get("status", "queued")
    r.triggered_by = kwargs.get("triggered_by", "user@test.com")
    r.trigger_type = kwargs.get("trigger_type", "manual")
    r.started_at = kwargs.get("started_at", None)
    r.finished_at = kwargs.get("finished_at", None)
    r.error_message = kwargs.get("error_message", None)
    r.created_at = kwargs.get("created_at", datetime(2026, 1, 1))
    r.step_runs = kwargs.get("step_runs", [])
    return r


class TestFmtPipeline:
    def setup_method(self):
        from app.api.pipelines import _fmt_pipeline
        self._fmt = _fmt_pipeline

    def test_basic_fields(self):
        p = _make_pipeline()
        out = self._fmt(p)
        assert out["pipeline_id"] == "pid-1"
        assert out["name"] == "Test Pipeline"
        assert out["trigger_type"] == "manual"
        assert out["is_active"] is True
        assert out["step_count"] == 0

    def test_include_steps_false_by_default(self):
        p = _make_pipeline(steps=[_make_step()])
        out = self._fmt(p)
        assert "steps" not in out

    def test_include_steps(self):
        p = _make_pipeline(steps=[_make_step()])
        out = self._fmt(p, include_steps=True)
        assert "steps" in out
        assert len(out["steps"]) == 1
        assert out["step_count"] == 1

    def test_connection_ids_defaults_to_empty_list(self):
        p = _make_pipeline(connection_ids=None)
        out = self._fmt(p)
        assert out["connection_ids"] == []

    def test_datetimes_are_iso_strings(self):
        dt = datetime(2026, 6, 23, 12, 0, 0)
        p = _make_pipeline(created_at=dt, updated_at=dt)
        out = self._fmt(p)
        assert out["created_at"] == "2026-06-23T12:00:00"
        assert out["updated_at"] == "2026-06-23T12:00:00"

    def test_none_datetimes(self):
        p = _make_pipeline(created_at=None, updated_at=None)
        out = self._fmt(p)
        assert out["created_at"] is None
        assert out["updated_at"] is None


class TestFmtStep:
    def setup_method(self):
        from app.api.pipelines import _fmt_step
        self._fmt = _fmt_step

    def test_basic_fields(self):
        s = _make_step()
        out = self._fmt(s)
        assert out["step_id"] == "step-1"
        assert out["step_type"] == "scan_job"
        assert out["step_order"] == 0

    def test_depends_on_defaults_to_empty_list(self):
        s = _make_step(depends_on=None)
        out = self._fmt(s)
        assert out["depends_on"] == []


class TestFmtRun:
    def setup_method(self):
        from app.api.pipelines import _fmt_run
        self._fmt = _fmt_run

    def test_basic_fields(self):
        r = _make_run()
        out = self._fmt(r)
        assert out["run_id"] == "run-1"
        assert out["status"] == "queued"
        assert "step_runs" not in out

    def test_include_steps(self):
        r = _make_run(step_runs=[])
        out = self._fmt(r, include_steps=True)
        assert "step_runs" in out
        assert out["step_runs"] == []


class TestValidTriggerTypes:
    def test_valid_trigger_types_defined(self):
        from app.api.pipelines import VALID_TRIGGER_TYPES
        assert "manual" in VALID_TRIGGER_TYPES
        assert "schedule" in VALID_TRIGGER_TYPES
        assert "event" in VALID_TRIGGER_TYPES

    def test_invalid_trigger_type_not_in_set(self):
        from app.api.pipelines import VALID_TRIGGER_TYPES
        assert "cron" not in VALID_TRIGGER_TYPES


class TestValidStepTypes:
    def test_valid_step_types_cover_etl_tools(self):
        from app.api.pipelines import VALID_STEP_TYPES
        assert "dbt_run" in VALID_STEP_TYPES
        assert "fivetran_sync" in VALID_STEP_TYPES
        assert "airbyte_sync" in VALID_STEP_TYPES
        assert "scan_job" in VALID_STEP_TYPES
        assert "webhook" in VALID_STEP_TYPES
        assert "custom_sql" in VALID_STEP_TYPES
        assert "wait" in VALID_STEP_TYPES
