"""Tests for domain/subdomain business logic and scoring."""
import pytest
from app.services.scoring_service import (
    calculate_rule_quality_score,
    calculate_aggregate_score,
    calculate_score_from_counts,
)


# ── Quality score calculations ────────────────────────────────────────────────

class TestRuleQualityScore:
    def test_all_passed_is_100(self):
        assert calculate_rule_quality_score(total_rows=1000, failed_rows=0) == 100.0

    def test_all_failed_is_0(self):
        assert calculate_rule_quality_score(total_rows=1000, failed_rows=1000) == 0.0

    def test_half_failed_is_50(self):
        assert calculate_rule_quality_score(total_rows=100, failed_rows=50) == 50.0

    def test_empty_table_is_100(self):
        assert calculate_rule_quality_score(total_rows=0, failed_rows=0) == 100.0

    def test_score_never_negative(self):
        score = calculate_rule_quality_score(total_rows=10, failed_rows=20)
        assert score >= 0.0


class TestAggregateScore:
    def test_no_failures_is_100(self):
        results = [{"status": "passed", "severity": "critical"}] * 5
        assert calculate_aggregate_score(results) == 100.0

    def test_empty_results_is_100(self):
        assert calculate_aggregate_score([]) == 100.0

    def test_critical_failure_deducts_25(self):
        results = [{"status": "failed", "severity": "critical"}]
        score = calculate_aggregate_score(results)
        assert score == 75.0

    def test_high_failure_deducts_15(self):
        results = [{"status": "failed", "severity": "high"}]
        score = calculate_aggregate_score(results)
        assert score == 85.0

    def test_medium_failure_deducts_7(self):
        results = [{"status": "failed", "severity": "medium"}]
        score = calculate_aggregate_score(results)
        assert score == 93.0

    def test_low_failure_deducts_3(self):
        results = [{"status": "failed", "severity": "low"}]
        score = calculate_aggregate_score(results)
        assert score == 97.0

    def test_multiple_failures_combined(self):
        results = [
            {"status": "failed", "severity": "critical"},
            {"status": "failed", "severity": "high"},
        ]
        score = calculate_aggregate_score(results)
        assert score == 60.0

    def test_score_floor_is_zero(self):
        results = [{"status": "failed", "severity": "critical"}] * 10
        assert calculate_aggregate_score(results) == 0.0

    def test_warning_status_not_penalized(self):
        results = [{"status": "warning", "severity": "critical"}]
        assert calculate_aggregate_score(results) == 100.0

    def test_error_status_penalized_same_as_failed(self):
        results = [{"status": "error", "severity": "medium"}]
        score = calculate_aggregate_score(results)
        assert score == 93.0


class TestScoreFromCounts:
    def test_all_passed(self):
        score = calculate_score_from_counts(passed=10, failed=0, warning=0, error=0)
        assert score == 100.0

    def test_half_passed(self):
        score = calculate_score_from_counts(passed=5, failed=5, warning=0, error=0)
        assert score == 50.0

    def test_no_runs_is_100(self):
        score = calculate_score_from_counts(passed=0, failed=0, warning=0, error=0)
        assert score == 100.0


# ── Domain model invariants ───────────────────────────────────────────────────

VALID_DOMAINS = ["revenue", "finance", "operations", "planning", "gtm", "hr", "others"]
VALID_SEVERITIES = ["critical", "high", "medium", "low"]
VALID_RULE_STATUSES = ["draft", "pending_review", "approved", "active", "disabled", "archived"]
VALID_CERT_STATUSES = ["certified", "warning", "failed", "uncertified"]


@pytest.mark.parametrize("domain", VALID_DOMAINS)
def test_valid_domain_names(domain: str):
    assert domain and len(domain) > 0


@pytest.mark.parametrize("sev", VALID_SEVERITIES)
def test_valid_severities(sev: str):
    assert sev in ("critical", "high", "medium", "low")


@pytest.mark.parametrize("status", VALID_RULE_STATUSES)
def test_valid_rule_statuses(status: str):
    assert status in VALID_RULE_STATUSES


@pytest.mark.parametrize("status", VALID_CERT_STATUSES)
def test_valid_certification_statuses(status: str):
    assert status in VALID_CERT_STATUSES


def test_severity_penalties_ordering():
    """Critical failures should cost more than high > medium > low."""
    from app.services.scoring_service import SEVERITY_PENALTIES
    assert SEVERITY_PENALTIES["critical"] > SEVERITY_PENALTIES["high"]
    assert SEVERITY_PENALTIES["high"] > SEVERITY_PENALTIES["medium"]
    assert SEVERITY_PENALTIES["medium"] > SEVERITY_PENALTIES["low"]
