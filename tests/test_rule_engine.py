import pytest
from app.services.sql_generator import SQLGenerator

gen = SQLGenerator()
TABLE = '"test_db"."test_schema"."test_table"'


def test_freshness_check_generates_valid_sql():
    sql = gen.generate("freshness_check", {"max_hours": 24}, TABLE, "updated_at")
    assert "updated_at" in sql
    assert "24" in sql


def test_volume_check_generates_count():
    sql = gen.generate("volume_check", {"date_column": "created_at"}, TABLE, None)
    assert "COUNT(*)" in sql
    assert "CURRENT_DATE" in sql


def test_business_rule_check():
    config = {"condition": "ship_date >= order_date"}
    sql = gen.generate("business_rule_check", config, TABLE, None)
    assert "ship_date >= order_date" in sql


def test_range_check_no_bounds_raises():
    with pytest.raises(ValueError):
        gen.generate("range_check", {}, TABLE, "amount")


def test_accepted_values_no_values_raises():
    with pytest.raises(ValueError):
        gen.generate("accepted_values_check", {}, TABLE, "status")


def test_custom_sql_no_sql_raises():
    with pytest.raises(ValueError):
        gen.generate("custom_sql_check", {}, TABLE, None)


def test_referential_integrity_no_ref_table_raises():
    with pytest.raises(ValueError):
        gen.generate("referential_integrity_check", {}, TABLE, "parent_id")
