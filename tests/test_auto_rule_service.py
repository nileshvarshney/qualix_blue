import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.auto_rule_service import (
    _table_ref,
    _phase1_candidates,
    _build_dedup_set,
)


def _make_asset(**kwargs):
    a = MagicMock()
    a.asset_id = kwargs.get("asset_id", "asset-001")
    a.sf_database_name = kwargs.get("sf_database_name", "MY_DB")
    a.sf_schema_name = kwargs.get("sf_schema_name", "MY_SCHEMA")
    a.sf_table_name = kwargs.get("sf_table_name", "ORDERS")
    a.domain_id = kwargs.get("domain_id", "domain-001")
    a.subdomain_id = kwargs.get("subdomain_id", "sub-001")
    return a


def _make_columns():
    return [
        {"column_name": "order_id",    "data_type": "NUMBER",        "is_nullable": "NO"},
        {"column_name": "customer_id", "data_type": "VARCHAR",       "is_nullable": "NO"},
        {"column_name": "status",      "data_type": "VARCHAR",       "is_nullable": "YES"},
        {"column_name": "amount",      "data_type": "NUMBER",        "is_nullable": "YES"},
        {"column_name": "created_at",  "data_type": "TIMESTAMP_NTZ", "is_nullable": "YES"},
    ]


class TestTableRef:
    def test_with_database(self):
        asset = _make_asset(sf_database_name="DB", sf_schema_name="SCH", sf_table_name="TBL")
        assert _table_ref(asset) == '"DB"."SCH"."TBL"'

    def test_without_database(self):
        asset = _make_asset(sf_database_name=None, sf_schema_name="SCH", sf_table_name="TBL")
        assert _table_ref(asset) == '"SCH"."TBL"'


class TestPhase1Candidates:
    def test_schema_drift_always_created(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "schema_drift_check" in types

    def test_schema_drift_has_all_columns(self):
        asset = _make_asset()
        cols = _make_columns()
        rules = _phase1_candidates(asset, cols)
        drift = next(r for r in rules if r.rule_type == "schema_drift_check")
        assert drift.rule_config["expected_columns"] == [c["column_name"] for c in cols]

    def test_null_check_created_for_not_null_columns(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "null_check" in types

    def test_null_check_covers_only_not_null_columns(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        nc = next(r for r in rules if r.rule_type == "null_check")
        assert set(nc.rule_config["columns"]) == {"order_id", "customer_id"}

    def test_null_check_skipped_when_all_nullable(self):
        asset = _make_asset()
        all_nullable = [
            {"column_name": "a", "data_type": "VARCHAR", "is_nullable": "YES"},
            {"column_name": "b", "data_type": "NUMBER",  "is_nullable": "YES"},
        ]
        rules = _phase1_candidates(asset, all_nullable)
        types = [r.rule_type for r in rules]
        assert "null_check" not in types

    def test_freshness_check_created_for_timestamp_columns(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "freshness_check" in types

    def test_freshness_check_uses_correct_column(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        fc = next(r for r in rules if r.rule_type == "freshness_check")
        assert fc.target_column == "created_at"
        assert fc.rule_config["max_hours"] == 48

    def test_freshness_check_skipped_when_no_temporal_column(self):
        asset = _make_asset()
        no_dates = [
            {"column_name": "id",   "data_type": "NUMBER",  "is_nullable": "NO"},
            {"column_name": "name", "data_type": "VARCHAR", "is_nullable": "YES"},
        ]
        rules = _phase1_candidates(asset, no_dates)
        types = [r.rule_type for r in rules]
        assert "freshness_check" not in types

    def test_uniqueness_check_for_pk_named_column(self):
        asset = _make_asset(sf_table_name="ORDERS")
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "uniqueness_check" in types

    def test_uniqueness_check_target_column_is_pk(self):
        asset = _make_asset(sf_table_name="ORDERS")
        rules = _phase1_candidates(asset, _make_columns())
        uc = next(r for r in rules if r.rule_type == "uniqueness_check")
        assert uc.target_column == "order_id"

    def test_volume_check_always_created(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "volume_check" in types

    def test_all_rules_have_pending_review_status(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        for r in rules:
            assert r.status == "pending_review"
            assert r.is_active is False
            assert r.created_by == "auto_discovery"

    def test_rule_names_prefixed_with_auto(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        for r in rules:
            assert r.rule_name.startswith("Auto:")


@pytest.mark.asyncio
class TestBuildDedupSet:
    async def test_returns_set_of_tuples(self):
        mock_row1 = MagicMock()
        mock_row1.rule_type = "schema_drift_check"
        mock_row1.target_column = None

        mock_row2 = MagicMock()
        mock_row2.rule_type = "null_check"
        mock_row2.target_column = None

        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([mock_row1, mock_row2]))

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await _build_dedup_set("asset-001", mock_db)
        assert ("schema_drift_check", None) in result
        assert ("null_check", None) in result

    async def test_returns_empty_set_when_no_rules(self):
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([]))
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await _build_dedup_set("asset-001", mock_db)
        assert result == set()


class TestPhase2Candidates:
    def _make_col_profile(self, **kwargs):
        col = MagicMock()
        col.column_name   = kwargs.get("column_name", "amount")
        col.data_type     = kwargs.get("data_type", "NUMBER")
        col.min_value     = kwargs.get("min_value", "10.0")
        col.max_value     = kwargs.get("max_value", "1000.0")
        col.avg_value     = kwargs.get("avg_value", 200.0)
        col.std_dev       = kwargs.get("std_dev", 50.0)
        col.cardinality_pct = kwargs.get("cardinality_pct", 80.0)
        col.unique_count  = kwargs.get("unique_count", 800)
        col.top_values    = kwargs.get("top_values", json.dumps([]))
        col.sample_values = kwargs.get("sample_values", json.dumps([]))
        return col

    def test_range_check_created_for_numeric_with_stats(self):
        from app.services.auto_rule_service import _phase2_candidates
        asset = _make_asset()
        tref = '"MY_DB"."MY_SCHEMA"."ORDERS"'
        col = self._make_col_profile(column_name="amount", data_type="NUMBER",
                                     min_value="10.0", max_value="1000.0")
        rules = _phase2_candidates(asset, [col], tref)
        types = [r.rule_type for r in rules]
        assert "range_check" in types

    def test_range_check_applies_ten_pct_buffer(self):
        from app.services.auto_rule_service import _phase2_candidates
        asset = _make_asset()
        tref = '"MY_DB"."MY_SCHEMA"."ORDERS"'
        col = self._make_col_profile(column_name="amount", data_type="NUMBER",
                                     min_value="100.0", max_value="1000.0")
        rules = _phase2_candidates(asset, [col], tref)
        rc = next(r for r in rules if r.rule_type == "range_check")
        assert rc.rule_config["min_value"] == pytest.approx(90.0)
        assert rc.rule_config["max_value"] == pytest.approx(1100.0)

    def test_range_check_buffer_correct_for_negative_min(self):
        from app.services.auto_rule_service import _phase2_candidates
        asset = _make_asset()
        tref = '"MY_DB"."MY_SCHEMA"."ORDERS"'
        col = self._make_col_profile(column_name="delta", data_type="NUMBER",
                                     min_value="-100.0", max_value="1000.0")
        rules = _phase2_candidates(asset, [col], tref)
        rc = next(r for r in rules if r.rule_type == "range_check")
        # -100 - abs(-100)*0.1 = -100 - 10 = -110
        assert rc.rule_config["min_value"] == pytest.approx(-110.0)
        assert rc.rule_config["max_value"] == pytest.approx(1100.0)

    def test_range_check_skipped_for_non_numeric(self):
        from app.services.auto_rule_service import _phase2_candidates
        asset = _make_asset()
        tref = '"MY_DB"."MY_SCHEMA"."ORDERS"'
        col = self._make_col_profile(column_name="status", data_type="VARCHAR",
                                     min_value=None, max_value=None)
        rules = _phase2_candidates(asset, [col], tref)
        types = [r.rule_type for r in rules]
        assert "range_check" not in types

    def test_accepted_values_check_for_low_cardinality(self):
        from app.services.auto_rule_service import _phase2_candidates
        asset = _make_asset()
        tref = '"MY_DB"."MY_SCHEMA"."ORDERS"'
        top = json.dumps([
            {"value": "active",   "count": 900},
            {"value": "inactive", "count": 100},
        ])
        col = self._make_col_profile(column_name="status", data_type="VARCHAR",
                                     min_value=None, max_value=None,
                                     cardinality_pct=2.0, unique_count=2,
                                     top_values=top)
        rules = _phase2_candidates(asset, [col], tref)
        types = [r.rule_type for r in rules]
        assert "accepted_values_check" in types

    def test_accepted_values_check_skipped_high_cardinality(self):
        from app.services.auto_rule_service import _phase2_candidates
        asset = _make_asset()
        tref = '"MY_DB"."MY_SCHEMA"."ORDERS"'
        col = self._make_col_profile(column_name="email", data_type="VARCHAR",
                                     min_value=None, max_value=None,
                                     cardinality_pct=95.0, unique_count=9500,
                                     top_values=json.dumps([]))
        rules = _phase2_candidates(asset, [col], tref)
        types = [r.rule_type for r in rules]
        assert "accepted_values_check" not in types

    def test_distribution_check_for_numeric_with_stats(self):
        from app.services.auto_rule_service import _phase2_candidates
        asset = _make_asset()
        tref = '"MY_DB"."MY_SCHEMA"."ORDERS"'
        col = self._make_col_profile(column_name="amount", data_type="NUMBER",
                                     avg_value=200.0, std_dev=50.0)
        rules = _phase2_candidates(asset, [col], tref)
        types = [r.rule_type for r in rules]
        assert "distribution_consistency_check" in types

    def test_distribution_check_config_has_baseline(self):
        from app.services.auto_rule_service import _phase2_candidates
        asset = _make_asset()
        tref = '"MY_DB"."MY_SCHEMA"."ORDERS"'
        col = self._make_col_profile(column_name="amount", data_type="FLOAT",
                                     avg_value=200.0, std_dev=50.0)
        rules = _phase2_candidates(asset, [col], tref)
        dc = next(r for r in rules if r.rule_type == "distribution_consistency_check")
        assert dc.rule_config["baseline_mean"] == 200.0
        assert dc.rule_config["tolerance_pct"] == 20


@pytest.mark.asyncio
class TestCreatePhase1Rules:
    async def test_feature_flag_off_returns_empty(self):
        from app.services.auto_rule_service import create_phase1_rules
        mock_db = AsyncMock()
        asset = _make_asset()
        with patch("app.services.auto_rule_service.settings") as s:
            s.auto_rules_enabled = False
            result = await create_phase1_rules(asset, _make_columns(), mock_db)
        assert result == []
        mock_db.execute.assert_not_called()

    async def test_deduplication_skips_existing_rule_types(self):
        from app.services.auto_rule_service import create_phase1_rules
        # Simulate schema_drift_check already exists (is_active doesn't matter)
        mock_row = MagicMock()
        mock_row.rule_type = "schema_drift_check"
        mock_row.target_column = None
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        asset = _make_asset()
        with patch("app.services.auto_rule_service.settings") as s:
            s.auto_rules_enabled = True
            s.auto_rules_max_per_table = 10
            result = await create_phase1_rules(asset, _make_columns(), mock_db)

        created_types = [r.rule_type for r in result]
        assert "schema_drift_check" not in created_types

    async def test_max_cap_respected(self):
        from app.services.auto_rule_service import create_phase1_rules
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([]))
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        asset = _make_asset()
        with patch("app.services.auto_rule_service.settings") as s:
            s.auto_rules_enabled = True
            s.auto_rules_max_per_table = 2  # cap at 2
            result = await create_phase1_rules(asset, _make_columns(), mock_db)

        assert len(result) <= 2


@pytest.mark.asyncio
class TestSuggestDataQualityRules:
    async def test_returns_list_of_dicts(self):
        from app.services.ai_service import suggest_data_quality_rules

        mock_provider = AsyncMock()
        mock_provider.complete = AsyncMock(return_value=json.dumps([
            {
                "rule_type": "business_rule_check",
                "rule_name": "Order date before ship date",
                "target_column": None,
                "rule_config": {"condition": "order_date <= ship_date"},
                "severity": "high",
            }
        ]))

        mock_db = AsyncMock()
        with patch("app.services.ai_service.get_provider_from_db",
                   AsyncMock(return_value=mock_provider)):
            result = await suggest_data_quality_rules(
                table_name="ORDERS",
                columns_with_samples=[
                    {"column_name": "order_date", "data_type": "DATE", "sample_values": []},
                    {"column_name": "ship_date",  "data_type": "DATE", "sample_values": []},
                ],
                n_rules=2,
                provider_name=None,
                db=mock_db,
            )

        assert isinstance(result, list)
        assert result[0]["rule_type"] == "business_rule_check"

    async def test_returns_empty_list_on_llm_failure(self):
        from app.services.ai_service import suggest_data_quality_rules

        mock_db = AsyncMock()
        with patch("app.services.ai_service.get_provider_from_db",
                   AsyncMock(side_effect=RuntimeError("LLM down"))):
            result = await suggest_data_quality_rules(
                table_name="ORDERS",
                columns_with_samples=[],
                n_rules=2,
                provider_name=None,
                db=mock_db,
            )

        assert result == []

    async def test_returns_empty_list_on_malformed_json(self):
        from app.services.ai_service import suggest_data_quality_rules

        mock_provider = AsyncMock()
        mock_provider.complete = AsyncMock(return_value="not json at all")
        mock_db = AsyncMock()
        with patch("app.services.ai_service.get_provider_from_db",
                   AsyncMock(return_value=mock_provider)):
            result = await suggest_data_quality_rules(
                table_name="ORDERS",
                columns_with_samples=[],
                n_rules=2,
                provider_name=None,
                db=mock_db,
            )

        assert result == []
