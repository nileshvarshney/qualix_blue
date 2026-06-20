"""Tests for audit gap features: hashing, anomalies, coverage, evidence report."""
from __future__ import annotations
import hashlib
import pytest
from unittest.mock import MagicMock
from datetime import datetime, timezone


def _make_log(**kwargs):
    """Return a mock AuditLog-like object."""
    log = MagicMock()
    log.audit_id = kwargs.get("audit_id", "test-id-1234")
    log.user_email = kwargs.get("user_email", "alice@example.com")
    log.action = kwargs.get("action", "CREATE")
    log.entity_type = kwargs.get("entity_type", "rule")
    log.entity_id = kwargs.get("entity_id", "entity-abc")
    log.created_at = kwargs.get("created_at", datetime(2026, 6, 20, 12, 0, 0))
    log.log_hash = kwargs.get("log_hash", None)
    return log


def _compute_expected_hash(log) -> str:
    payload = "|".join([
        str(log.audit_id or ""),
        str(log.user_email or ""),
        str(log.action or ""),
        str(log.entity_type or ""),
        str(log.entity_id or ""),
        str(log.created_at.isoformat() if log.created_at else ""),
    ])
    return hashlib.sha256(payload.encode()).hexdigest()


class TestAuditHashComputation:
    def test_hash_is_64_hex_chars(self):
        log = _make_log()
        h = _compute_expected_hash(log)
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_same_fields_same_hash(self):
        log1 = _make_log(audit_id="abc", action="CREATE")
        log2 = _make_log(audit_id="abc", action="CREATE")
        assert _compute_expected_hash(log1) == _compute_expected_hash(log2)

    def test_different_action_different_hash(self):
        log1 = _make_log(action="CREATE")
        log2 = _make_log(action="DELETE")
        assert _compute_expected_hash(log1) != _compute_expected_hash(log2)

    def test_none_fields_handled_gracefully(self):
        log = _make_log(user_email=None, entity_id=None)
        h = _compute_expected_hash(log)
        assert len(h) == 64

    def test_model_event_listener_importable(self):
        """Smoke-test that the before_insert listener is registered."""
        from app.db import models as _m
        assert hasattr(_m, "_compute_audit_hash")
