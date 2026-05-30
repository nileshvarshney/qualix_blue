import pytest
from app.services.sql_generator import SQLGenerator

gen = SQLGenerator()
TABLE = '"revenue_dw"."invoices"'


def test_null_check():
    sql = gen.generate("null_check", {}, TABLE, "invoice_id")
    assert 'IS NULL' in sql
    assert '"invoice_id"' in sql


def test_uniqueness_check():
    sql = gen.generate("uniqueness_check", {}, TABLE, "invoice_id")
    assert 'GROUP BY' in sql
    assert 'HAVING COUNT(*) > 1' in sql


def test_accepted_values_check():
    config = {"accepted_values": ["PAID", "PENDING", "FAILED"]}
    sql = gen.generate("accepted_values_check", config, TABLE, "invoice_status")
    assert 'NOT IN' in sql
    assert "'PAID'" in sql


def test_range_check_min_only():
    sql = gen.generate("range_check", {"min_value": 0}, TABLE, "invoice_amount")
    assert '"invoice_amount" < 0' in sql


def test_range_check_both():
    sql = gen.generate("range_check", {"min_value": 0, "max_value": 1000000}, TABLE, "amount")
    assert '< 0' in sql
    assert '> 1000000' in sql


def test_regex_check():
    config = {"pattern": "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"}
    sql = gen.generate("regex_check", config, TABLE, "email")
    assert '~' in sql or 'REGEXP' in sql


def test_custom_sql():
    custom = "SELECT COUNT(*) AS failed_count FROM orders WHERE ship_date < order_date"
    sql = gen.generate("custom_sql_check", {"sql": custom}, TABLE, None)
    assert sql == custom


def test_null_check_missing_column():
    with pytest.raises(ValueError):
        gen.generate("null_check", {}, TABLE, None)


def test_unknown_rule_type():
    with pytest.raises(ValueError):
        gen.generate("unknown_type", {}, TABLE, "col")
