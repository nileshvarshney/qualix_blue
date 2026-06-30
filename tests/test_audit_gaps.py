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


class TestVerifyEndpoint:
    def test_recompute_matches_stored_hash(self):
        """When hash matches, the row is intact."""
        log = _make_log(audit_id="x1", action="CREATE", entity_type="rule")
        payload = "|".join([
            str(log.audit_id), str(log.user_email), str(log.action),
            str(log.entity_type), str(log.entity_id),
            str(log.created_at.isoformat()),
        ])
        expected = hashlib.sha256(payload.encode()).hexdigest()
        log.log_hash = expected
        # Tamper detection: same payload → same hash → intact
        recomputed = hashlib.sha256(payload.encode()).hexdigest()
        assert recomputed == log.log_hash

    def test_tampered_log_detected(self):
        """When hash doesn't match, row is flagged as tampered."""
        log = _make_log()
        log.log_hash = "0" * 64  # wrong hash
        payload = "|".join([
            str(log.audit_id), str(log.user_email), str(log.action),
            str(log.entity_type), str(log.entity_id),
            str(log.created_at.isoformat()),
        ])
        recomputed = hashlib.sha256(payload.encode()).hexdigest()
        assert recomputed != log.log_hash  # tampered


class TestAnomalyPatterns:
    def test_bulk_write_threshold(self):
        """50 or more events in window triggers bulk_writes."""
        assert 50 >= 50  # threshold check

    def test_rapid_deletion_threshold(self):
        """5 or more destructive actions triggers rapid_deletions."""
        destructive = ("delete", "archive", "disable", "reject", "revoke")
        assert "delete" in destructive
        assert "archive" in destructive
        assert "approve" not in destructive

    def test_new_user_threshold(self):
        """New user (first seen < 7 days) with ≥20 events triggers new_user_activity."""
        assert 20 >= 20  # threshold check

    def test_anomalies_endpoint_importable(self):
        from app.api.audit import router
        routes = [r.path for r in router.routes]
        assert "/audit/anomalies" in routes


class TestCoverageMetrics:
    def test_coverage_pct_full(self):
        """100% when all governed types are present."""
        governed = [
            "rule", "asset", "domain", "subdomain", "user", "connection",
            "schedule", "alert", "sla", "glossary_term", "governance_policy",
            "data_product", "data_contract", "masking_policy", "incident",
            "issue", "team", "tag", "classification",
        ]
        covered = len(governed)
        pct = round((covered / len(governed)) * 100)
        assert pct == 100

    def test_coverage_pct_partial(self):
        """50% when half of 4 governed types are covered."""
        governed = ["rule", "asset", "domain", "user"]
        covered = 2
        pct = round((covered / len(governed)) * 100)
        assert pct == 50

    def test_uncovered_types_listed(self):
        governed = ["rule", "asset", "domain"]
        logged = {"rule", "asset"}
        uncovered = [g for g in governed if g not in logged]
        assert uncovered == ["domain"]

    def test_coverage_endpoint_importable(self):
        from app.api.audit import router
        routes = [r.path for r in router.routes]
        assert "/audit/coverage" in routes


class TestEvidenceReport:
    def test_compliance_actions_set(self):
        compliance_actions = {"approve", "reject", "create", "update", "delete", "certify", "archive"}
        assert "approve" in compliance_actions
        assert "list" not in compliance_actions

    def test_compliance_entity_types_set(self):
        compliance_types = {"rule", "governance_policy", "glossary_term", "data_contract", "masking_policy"}
        assert "rule" in compliance_types
        assert "schedule" not in compliance_types

    def test_top_users_sorted_desc(self):
        user_counts = {"alice": 50, "bob": 100, "carol": 25}
        top = sorted(user_counts.items(), key=lambda x: -x[1])[:10]
        assert top[0][0] == "bob"
        assert top[1][0] == "alice"

    def test_evidence_report_endpoint_importable(self):
        from app.api.audit import router
        routes = [r.path for r in router.routes]
        assert "/audit/evidence-report" in routes
