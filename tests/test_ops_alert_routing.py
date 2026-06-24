"""Unit tests for the alert routing API module (no real DB)."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock
from datetime import datetime


def _make_rule(**kwargs):
    r = MagicMock()
    r.rule_id = kwargs.get("rule_id", "rule-1")
    r.name = kwargs.get("name", "Critical → PagerDuty")
    r.description = kwargs.get("description", None)
    r.priority = kwargs.get("priority", 1)
    r.match_conditions = kwargs.get("match_conditions", {})
    r.notification_channels = kwargs.get("notification_channels", [])
    r.escalation_policy_id = kwargs.get("escalation_policy_id", None)
    r.is_active = kwargs.get("is_active", True)
    r.created_by = kwargs.get("created_by", "admin@test.com")
    r.created_at = kwargs.get("created_at", datetime(2026, 1, 1))
    r.updated_at = kwargs.get("updated_at", datetime(2026, 1, 1))
    return r


def _make_window(**kwargs):
    w = MagicMock()
    w.window_id = kwargs.get("window_id", "win-1")
    w.name = kwargs.get("name", "Nightly Deployment")
    w.description = kwargs.get("description", None)
    w.scope = kwargs.get("scope", {})
    w.start_at = kwargs.get("start_at", datetime(2026, 6, 23, 2, 0))
    w.end_at = kwargs.get("end_at", datetime(2026, 6, 23, 4, 0))
    w.recurrence = kwargs.get("recurrence", "daily")
    w.suppress_alerts = kwargs.get("suppress_alerts", True)
    w.suppress_scans = kwargs.get("suppress_scans", False)
    w.created_by = kwargs.get("created_by", "admin@test.com")
    w.created_at = kwargs.get("created_at", datetime(2026, 1, 1))
    w.updated_at = kwargs.get("updated_at", datetime(2026, 1, 1))
    return w


def _make_flap(**kwargs):
    c = MagicMock()
    c.config_id = kwargs.get("config_id", "cfg-1")
    c.is_enabled = kwargs.get("is_enabled", True)
    c.flap_threshold = kwargs.get("flap_threshold", 3)
    c.window_minutes = kwargs.get("window_minutes", 30)
    c.suppress_duration_minutes = kwargs.get("suppress_duration_minutes", 60)
    c.updated_by = kwargs.get("updated_by", None)
    c.updated_at = kwargs.get("updated_at", None)
    return c


class TestFmtRule:
    def setup_method(self):
        from app.api.alert_routing import _fmt_rule
        self._fmt = _fmt_rule

    def test_basic_fields(self):
        r = _make_rule()
        out = self._fmt(r)
        assert out["rule_id"] == "rule-1"
        assert out["name"] == "Critical → PagerDuty"
        assert out["priority"] == 1
        assert out["is_active"] is True

    def test_match_conditions_defaults_to_empty_dict(self):
        r = _make_rule(match_conditions=None)
        out = self._fmt(r)
        assert out["match_conditions"] == {}

    def test_notification_channels_defaults_to_empty_list(self):
        r = _make_rule(notification_channels=None)
        out = self._fmt(r)
        assert out["notification_channels"] == []

    def test_escalation_policy_id_can_be_none(self):
        r = _make_rule(escalation_policy_id=None)
        out = self._fmt(r)
        assert out["escalation_policy_id"] is None

    def test_datetimes_are_iso_strings(self):
        dt = datetime(2026, 6, 23, 10, 0, 0)
        r = _make_rule(created_at=dt, updated_at=dt)
        out = self._fmt(r)
        assert out["created_at"] == "2026-06-23T10:00:00"


class TestFmtWindow:
    def setup_method(self):
        from app.api.alert_routing import _fmt_window
        self._fmt = _fmt_window

    def test_basic_fields(self):
        w = _make_window()
        out = self._fmt(w)
        assert out["window_id"] == "win-1"
        assert out["name"] == "Nightly Deployment"
        assert out["recurrence"] == "daily"
        assert out["suppress_alerts"] is True
        assert out["suppress_scans"] is False

    def test_scope_defaults_to_empty_dict(self):
        w = _make_window(scope=None)
        out = self._fmt(w)
        assert out["scope"] == {}

    def test_start_end_are_iso_strings(self):
        w = _make_window()
        out = self._fmt(w)
        assert "T" in out["start_at"]
        assert "T" in out["end_at"]


class TestFmtFlap:
    def setup_method(self):
        from app.api.alert_routing import _fmt_flap
        self._fmt = _fmt_flap

    def test_basic_fields(self):
        c = _make_flap()
        out = self._fmt(c)
        assert out["config_id"] == "cfg-1"
        assert out["is_enabled"] is True
        assert out["flap_threshold"] == 3
        assert out["window_minutes"] == 30
        assert out["suppress_duration_minutes"] == 60

    def test_updated_at_none(self):
        c = _make_flap(updated_at=None)
        out = self._fmt(c)
        assert out["updated_at"] is None

    def test_updated_at_iso(self):
        dt = datetime(2026, 6, 23, 15, 0, 0)
        c = _make_flap(updated_at=dt)
        out = self._fmt(c)
        assert out["updated_at"] == "2026-06-23T15:00:00"


class TestValidRecurrences:
    def test_valid_recurrences_defined(self):
        from app.api.alert_routing import VALID_RECURRENCES
        assert "none" in VALID_RECURRENCES
        assert "daily" in VALID_RECURRENCES
        assert "weekly" in VALID_RECURRENCES
        assert "monthly" in VALID_RECURRENCES

    def test_invalid_recurrence_not_in_set(self):
        from app.api.alert_routing import VALID_RECURRENCES
        assert "yearly" not in VALID_RECURRENCES
        assert "hourly" not in VALID_RECURRENCES
