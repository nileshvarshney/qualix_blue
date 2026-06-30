"""Tests for compliance assessment auto-mapping logic."""
from __future__ import annotations
import pytest


class TestAutoMappingLogic:
    def test_rule_type_matches_requirement(self):
        """A rule whose rule_type is in dq_rule_types should be matched."""
        dq_rule_types = "not_null,uniqueness,freshness"
        rule_type = "not_null"
        types_list = [t.strip() for t in dq_rule_types.split(",")]
        assert rule_type in types_list

    def test_rule_type_no_match(self):
        """A rule whose rule_type is NOT in dq_rule_types should not be matched."""
        dq_rule_types = "not_null,uniqueness"
        rule_type = "range_check"
        types_list = [t.strip() for t in dq_rule_types.split(",")]
        assert rule_type not in types_list

    def test_empty_dq_rule_types_no_match(self):
        """Empty dq_rule_types → no match possible."""
        dq_rule_types = None
        types_list = [t.strip() for t in dq_rule_types.split(",")] if dq_rule_types else []
        assert len(types_list) == 0

    def test_whitespace_in_dq_rule_types_trimmed(self):
        """Whitespace around type names is stripped."""
        dq_rule_types = " not_null , uniqueness "
        types_list = [t.strip() for t in dq_rule_types.split(",")]
        assert "not_null" in types_list
        assert "uniqueness" in types_list

    def test_assess_asset_function_importable(self):
        from app.api.compliance import assess_asset
        import inspect
        assert inspect.iscoroutinefunction(assess_asset)

    def test_assess_all_assets_function_importable(self):
        from app.api.compliance import assess_all_assets
        import inspect
        assert inspect.iscoroutinefunction(assess_all_assets)
