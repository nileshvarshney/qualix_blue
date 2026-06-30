import pytest
from app.services.scoring_service import calculate_rule_quality_score, calculate_aggregate_score
from app.services.scoring_service import (
    DIMENSION_RULE_TYPE_MAP,
    DIMENSIONS,
    score_dimension,
    calculate_dimension_scores_for_asset,
)


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


def test_dimension_map_covers_six_dimensions():
    assert set(DIMENSIONS) == {
        "completeness", "validity", "uniqueness", "timeliness", "consistency", "integrity",
    }
    assert set(DIMENSION_RULE_TYPE_MAP.keys()) == set(DIMENSIONS)


def test_score_dimension_all_pass():
    rows = [("null_check", "passed"), ("null_check", "passed")]
    result = score_dimension(rows, "completeness")
    assert result == {"score": 100.0, "source": "rules", "total": 2, "passed": 2, "failed": 0}


def test_score_dimension_mixed():
    rows = [("range_check", "passed"), ("range_check", "failed"), ("accepted_values_check", "passed")]
    result = score_dimension(rows, "validity")
    assert result["score"] == pytest.approx(66.67, rel=1e-2)
    assert result["source"] == "rules"
    assert result["total"] == 3
    assert result["passed"] == 2
    assert result["failed"] == 1


def test_score_dimension_no_matching_rules():
    rows = [("freshness_check", "passed")]
    result = score_dimension(rows, "uniqueness")
    assert result == {"score": None, "source": "none", "total": 0, "passed": 0, "failed": 0}


def test_score_dimension_ignores_other_dimensions_rule_types():
    rows = [("null_check", "passed"), ("freshness_check", "failed")]
    result = score_dimension(rows, "completeness")
    assert result["total"] == 1
    assert result["score"] == 100.0


def test_calculate_dimension_scores_completeness_from_rules():
    rows = [("null_check", "passed"), ("null_check", "failed")]
    result = calculate_dimension_scores_for_asset(rows, profile_score=0.5)
    assert result["completeness"]["score"] == 50.0
    assert result["completeness"]["source"] == "rules"


def test_calculate_dimension_scores_completeness_falls_back_to_profiling():
    rows = [("freshness_check", "passed")]
    result = calculate_dimension_scores_for_asset(rows, profile_score=0.8)
    assert result["completeness"]["score"] == 80.0
    assert result["completeness"]["source"] == "profiling"


def test_calculate_dimension_scores_completeness_none_when_no_data():
    result = calculate_dimension_scores_for_asset([], profile_score=None)
    assert result["completeness"]["score"] is None
    assert result["completeness"]["source"] == "none"


def test_calculate_dimension_scores_overall_is_average_of_non_null():
    rows = [
        ("null_check", "passed"),       # completeness 100
        ("range_check", "failed"),      # validity 0
    ]
    result = calculate_dimension_scores_for_asset(rows, profile_score=None)
    assert result["overall"]["score"] == 50.0
    assert result["overall"]["source"] == "computed"


def test_calculate_dimension_scores_overall_none_when_all_dimensions_empty():
    result = calculate_dimension_scores_for_asset([], profile_score=None)
    assert result["overall"]["score"] is None
