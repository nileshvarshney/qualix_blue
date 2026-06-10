# tests/test_asset_lifecycle.py
import pytest
from app.services.asset_registry import VALID_ASSET_STATUSES, transition_status


def test_valid_statuses_contains_all_five():
    required = {"active", "missing", "deprecated", "scan_failed", "disabled"}
    assert required == VALID_ASSET_STATUSES


def test_transition_to_valid_status_succeeds():
    result = transition_status("active", "missing")
    assert result == "missing"


def test_transition_to_invalid_status_raises():
    with pytest.raises(ValueError, match="Invalid status"):
        transition_status("active", "archived")


def test_disabled_to_active_is_blocked():
    with pytest.raises(ValueError, match="blocked"):
        transition_status("disabled", "active")


def test_disabled_to_deprecated_is_allowed():
    result = transition_status("disabled", "deprecated")
    assert result == "deprecated"


def test_active_to_deprecated_is_allowed():
    result = transition_status("active", "deprecated")
    assert result == "deprecated"


def test_missing_to_active_is_allowed():
    result = transition_status("missing", "active")
    assert result == "active"
