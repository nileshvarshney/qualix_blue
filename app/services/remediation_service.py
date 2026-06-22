from __future__ import annotations
import logging
import math
from typing import Optional

logger = logging.getLogger("dq_platform.remediation")

MIN_HISTORY_RUNS = 3

ESCALATION_ONLY_TYPES: set[str] = {
    "null_check", "uniqueness_check", "duplicate_check", "schema_drift_check",
    "referential_integrity_check", "referential_sanity_check", "business_rule_check",
    "business_metric_check", "custom_sql_check", "llm_semantic_check",
    "semantic_consistency_check", "accepted_values_check", "regex_check", "comparison_check",
}


def _fmt(value) -> str:
    return str(value)


def _compute_freshness_fix(rule) -> tuple[str, str, str]:
    config = rule.rule_config or {}
    current = config.get("max_hours", 24)
    new_value = math.ceil(current * 1.25)
    if new_value <= current:
        new_value = current + 1
    return "max_hours", _fmt(current), _fmt(new_value)


def _compute_volume_fix(rule, run) -> Optional[tuple[str, str, str]]:
    config = rule.rule_config or {}
    min_rows = config.get("min_rows")
    max_rows = config.get("max_rows")
    observed = run.total_rows_scanned or 0
    if min_rows is not None and observed < min_rows:
        new_value = max(0, math.floor(observed * 0.9))
        return "min_rows", _fmt(min_rows), _fmt(new_value)
    if max_rows is not None and observed > max_rows:
        new_value = math.ceil(round(observed * 1.1, 6))
        return "max_rows", _fmt(max_rows), _fmt(new_value)
    return None


def _compute_range_fix(rule) -> Optional[tuple[str, str, str]]:
    config = rule.rule_config or {}
    max_val = config.get("max_value")
    min_val = config.get("min_value")
    # Tie-break: when both bounds are configured, widen the upper bound —
    # the more common "ceiling drift" case in practice.
    if max_val is not None:
        step = abs(float(max_val)) * 0.05 if max_val != 0 else 1
        return "max_value", _fmt(max_val), _fmt(round(float(max_val) + step, 4))
    if min_val is not None:
        step = abs(float(min_val)) * 0.05 if min_val != 0 else 1
        return "min_value", _fmt(min_val), _fmt(round(float(min_val) - step, 4))
    return None


def _compute_distribution_fix(rule) -> tuple[str, str, str]:
    config = rule.rule_config or {}
    current = config.get("tolerance_pct", 20)
    new_value = current + 10
    return "tolerance_pct", _fmt(current), _fmt(new_value)


def classify_and_compute(rule, run) -> tuple[str, Optional[tuple[str, str, str]]]:
    """Classify a failed rule and, for auto-fixable types, compute the concrete config change.

    Returns (classification, fix) where classification is "auto_fixable" or
    "escalation_only", and fix is (config_field, old_value_str, new_value_str) or None.
    """
    if rule.rule_type == "freshness_check":
        return "auto_fixable", _compute_freshness_fix(rule)
    if rule.rule_type == "volume_check":
        fix = _compute_volume_fix(rule, run)
        return ("auto_fixable", fix) if fix else ("escalation_only", None)
    if rule.rule_type == "range_check":
        fix = _compute_range_fix(rule)
        return ("auto_fixable", fix) if fix else ("escalation_only", None)
    if rule.rule_type == "distribution_consistency_check":
        return "auto_fixable", _compute_distribution_fix(rule)
    return "escalation_only", None
