import pytest
from app.services.scoring_service import calculate_rule_quality_score, calculate_aggregate_score


def test_perfect_score():
    assert calculate_rule_quality_score(1000, 0) == 100.0


def test_all_fail():
    assert calculate_rule_quality_score(100, 100) == 0.0


def test_half_fail():
    score = calculate_rule_quality_score(100, 50)
    assert score == 50.0


def test_empty_table():
    assert calculate_rule_quality_score(0, 0) == 100.0


def test_aggregate_all_pass():
    rules = [{"status": "passed", "severity": "critical"}, {"status": "passed", "severity": "high"}]
    assert calculate_aggregate_score(rules) == 100.0


def test_aggregate_critical_failure():
    rules = [{"status": "failed", "severity": "critical"}]
    score = calculate_aggregate_score(rules)
    assert score == 75.0


def test_aggregate_high_failure():
    rules = [{"status": "failed", "severity": "high"}]
    score = calculate_aggregate_score(rules)
    assert score == 85.0


def test_aggregate_multiple_failures():
    rules = [
        {"status": "failed", "severity": "critical"},
        {"status": "failed", "severity": "high"},
        {"status": "passed", "severity": "medium"},
    ]
    score = calculate_aggregate_score(rules)
    assert score == 60.0  # 100 - 25 - 15


def test_aggregate_never_below_zero():
    rules = [{"status": "failed", "severity": "critical"}] * 10
    score = calculate_aggregate_score(rules)
    assert score == 0.0


def test_aggregate_empty():
    assert calculate_aggregate_score([]) == 100.0
