import pytest
from unittest.mock import AsyncMock, MagicMock


# ── Pure diff function tests (no DB needed) ──────────────────────────────

def test_compute_diff_column_added():
    from app.services.schema_drift_service import _compute_diff
    baseline = [{"column_name": "id", "data_type": "NUMBER", "is_nullable": False}]
    current  = [
        {"column_name": "id",    "data_type": "NUMBER",  "is_nullable": False},
        {"column_name": "email", "data_type": "VARCHAR", "is_nullable": True},
    ]
    events = _compute_diff(baseline, current)
    assert len(events) == 1
    ev = events[0]
    assert ev["change_type"] == "column_added"
    assert ev["column_name"] == "email"
    assert ev["old_value"] is None
    assert ev["new_value"] == "VARCHAR"


def test_compute_diff_column_deleted():
    from app.services.schema_drift_service import _compute_diff
    baseline = [
        {"column_name": "id",        "data_type": "NUMBER",  "is_nullable": False},
        {"column_name": "legacy_col","data_type": "VARCHAR", "is_nullable": True},
    ]
    current = [{"column_name": "id", "data_type": "NUMBER", "is_nullable": False}]
    events = _compute_diff(baseline, current)
    assert len(events) == 1
    ev = events[0]
    assert ev["change_type"] == "column_deleted"
    assert ev["column_name"] == "legacy_col"
    assert ev["old_value"] == "VARCHAR"
    assert ev["new_value"] is None


def test_compute_diff_type_changed():
    from app.services.schema_drift_service import _compute_diff
    baseline = [{"column_name": "amount", "data_type": "FLOAT",   "is_nullable": True}]
    current  = [{"column_name": "amount", "data_type": "NUMBER",  "is_nullable": True}]
    events = _compute_diff(baseline, current)
    assert len(events) == 1
    ev = events[0]
    assert ev["change_type"] == "type_changed"
    assert ev["old_value"] == "FLOAT"
    assert ev["new_value"] == "NUMBER"


def test_compute_diff_nullability_changed():
    from app.services.schema_drift_service import _compute_diff
    baseline = [{"column_name": "email", "data_type": "VARCHAR", "is_nullable": True}]
    current  = [{"column_name": "email", "data_type": "VARCHAR", "is_nullable": False}]
    events = _compute_diff(baseline, current)
    assert len(events) == 1
    ev = events[0]
    assert ev["change_type"] == "nullability_changed"
    assert ev["old_value"] == "True"
    assert ev["new_value"] == "False"


def test_compute_diff_no_changes():
    from app.services.schema_drift_service import _compute_diff
    cols = [{"column_name": "id", "data_type": "NUMBER", "is_nullable": False}]
    events = _compute_diff(cols, cols)
    assert events == []


def test_compute_diff_multiple_changes():
    from app.services.schema_drift_service import _compute_diff
    baseline = [
        {"column_name": "id",    "data_type": "NUMBER",  "is_nullable": False},
        {"column_name": "old_col","data_type": "VARCHAR", "is_nullable": True},
    ]
    current = [
        {"column_name": "id",      "data_type": "BIGINT", "is_nullable": False},
        {"column_name": "new_col", "data_type": "TEXT",   "is_nullable": True},
    ]
    events = _compute_diff(baseline, current)
    types = {e["change_type"] for e in events}
    assert "column_deleted" in types   # old_col removed
    assert "column_added"   in types   # new_col added
    assert "type_changed"   in types   # id: NUMBER → BIGINT


def test_summarize_changes_single():
    from app.services.schema_drift_service import _summarize_changes
    diff = [{"change_type": "column_deleted", "column_name": "x", "old_value": "VARCHAR", "new_value": None}]
    summary = _summarize_changes(diff)
    assert "1 column(s) deleted" in summary


def test_summarize_changes_mixed():
    from app.services.schema_drift_service import _summarize_changes
    diff = [
        {"change_type": "column_deleted",      "column_name": "a", "old_value": "INT",     "new_value": None},
        {"change_type": "column_added",        "column_name": "b", "old_value": None,      "new_value": "TEXT"},
        {"change_type": "nullability_changed", "column_name": "c", "old_value": "True",    "new_value": "False"},
    ]
    summary = _summarize_changes(diff)
    assert "deleted" in summary
    assert "added"   in summary
