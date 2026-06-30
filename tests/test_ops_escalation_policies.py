"""Unit tests for the escalation policies API module (no real DB)."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock
from datetime import datetime


def _make_policy(**kwargs):
    p = MagicMock()
    p.policy_id = kwargs.get("policy_id", "pol-1")
    p.name = kwargs.get("name", "Critical Escalation")
    p.description = kwargs.get("description", None)
    p.severity = kwargs.get("severity", "critical")
    p.steps = kwargs.get("steps", [])
    p.oncall_rotation = kwargs.get("oncall_rotation", [])
    p.repeat_interval_minutes = kwargs.get("repeat_interval_minutes", 60)
    p.max_escalations = kwargs.get("max_escalations", 3)
    p.is_active = kwargs.get("is_active", True)
    p.created_by = kwargs.get("created_by", "admin@test.com")
    p.created_at = kwargs.get("created_at", datetime(2026, 1, 1))
    p.updated_at = kwargs.get("updated_at", datetime(2026, 1, 1))
    return p


class TestFmtPolicy:
    def setup_method(self):
        from app.api.escalation_policies import _fmt_policy
        self._fmt = _fmt_policy

    def test_basic_fields(self):
        p = _make_policy()
        out = self._fmt(p)
        assert out["policy_id"] == "pol-1"
        assert out["name"] == "Critical Escalation"
        assert out["severity"] == "critical"
        assert out["is_active"] is True
        assert out["max_escalations"] == 3

    def test_steps_defaults_to_empty_list(self):
        p = _make_policy(steps=None)
        out = self._fmt(p)
        assert out["steps"] == []

    def test_oncall_rotation_defaults_to_empty_list(self):
        p = _make_policy(oncall_rotation=None)
        out = self._fmt(p)
        assert out["oncall_rotation"] == []

    def test_datetimes_are_iso_strings(self):
        dt = datetime(2026, 6, 23, 8, 30, 0)
        p = _make_policy(created_at=dt, updated_at=dt)
        out = self._fmt(p)
        assert out["created_at"] == "2026-06-23T08:30:00"

    def test_none_datetimes(self):
        p = _make_policy(created_at=None, updated_at=None)
        out = self._fmt(p)
        assert out["created_at"] is None
        assert out["updated_at"] is None


class TestValidSeverities:
    def test_all_severities_defined(self):
        from app.api.escalation_policies import VALID_SEVERITIES
        assert "critical" in VALID_SEVERITIES
        assert "high" in VALID_SEVERITIES
        assert "medium" in VALID_SEVERITIES
        assert "low" in VALID_SEVERITIES
        assert "all" in VALID_SEVERITIES

    def test_unknown_severity_not_in_set(self):
        from app.api.escalation_policies import VALID_SEVERITIES
        assert "warning" not in VALID_SEVERITIES
        assert "info" not in VALID_SEVERITIES
