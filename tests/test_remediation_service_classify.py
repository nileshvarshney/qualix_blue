from unittest.mock import MagicMock
from app.services.remediation_service import classify_and_compute


def _rule(rule_type, config=None):
    r = MagicMock()
    r.rule_type = rule_type
    r.rule_config = config or {}
    return r


def _run(total_rows_scanned=1000):
    run = MagicMock()
    run.total_rows_scanned = total_rows_scanned
    return run


def test_freshness_check_proposes_bumped_max_hours():
    rule = _rule("freshness_check", {"max_hours": 24})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "auto_fixable"
    assert fix == ("max_hours", "24", "30")


def test_volume_check_below_min_proposes_lower_min_rows():
    rule = _rule("volume_check", {"min_rows": 1000})
    classification, fix = classify_and_compute(rule, _run(total_rows_scanned=800))
    assert classification == "auto_fixable"
    assert fix == ("min_rows", "1000", "720")


def test_volume_check_above_max_proposes_higher_max_rows():
    rule = _rule("volume_check", {"max_rows": 1000})
    classification, fix = classify_and_compute(rule, _run(total_rows_scanned=1500))
    assert classification == "auto_fixable"
    assert fix == ("max_rows", "1000", "1650")


def test_volume_check_with_no_bounds_is_escalation_only():
    rule = _rule("volume_check", {})
    classification, fix = classify_and_compute(rule, _run(total_rows_scanned=500))
    assert classification == "escalation_only"
    assert fix is None


def test_range_check_widens_max_value():
    rule = _rule("range_check", {"max_value": 100.0, "min_value": 0.0})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "auto_fixable"
    assert fix == ("max_value", "100.0", "105.0")


def test_range_check_with_only_min_value_widens_min_value():
    rule = _rule("range_check", {"min_value": 10.0})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "auto_fixable"
    assert fix == ("min_value", "10.0", "9.5")


def test_distribution_consistency_check_bumps_tolerance():
    rule = _rule("distribution_consistency_check", {"tolerance_pct": 20})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "auto_fixable"
    assert fix == ("tolerance_pct", "20", "30")


def test_null_check_is_always_escalation_only():
    rule = _rule("null_check", {"columns": ["email"]})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "escalation_only"
    assert fix is None


def test_schema_drift_check_is_always_escalation_only():
    rule = _rule("schema_drift_check", {"expected_columns": ["id"]})
    classification, fix = classify_and_compute(rule, _run())
    assert classification == "escalation_only"
    assert fix is None
