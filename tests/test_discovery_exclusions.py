"""Tests for discovery exclusion filtering logic."""
import pytest
from unittest.mock import MagicMock


def _build_exclusion_sets(conn):
    """Mirror the logic from run_discovery."""
    excluded_db_set = set(conn.excluded_databases or [])
    excluded_schema_set = {
        (e["database"], e["schema"])
        for e in (conn.excluded_schemas or [])
    }
    return excluded_db_set, excluded_schema_set


def _make_conn_with_exclusions(excluded_databases=None, excluded_schemas=None):
    m = MagicMock()
    m.excluded_databases = excluded_databases
    m.excluded_schemas = excluded_schemas
    return m


def _should_skip(sel, excluded_db_set, excluded_schema_set):
    """Mirror the skip logic from run_discovery."""
    if sel["database"] in excluded_db_set:
        return True, "database excluded by connection config"
    if (sel["database"], sel["schema"]) in excluded_schema_set:
        return True, "schema excluded by connection config"
    return False, None


def test_no_exclusions_skips_nothing():
    conn = _make_conn_with_exclusions()
    db_set, schema_set = _build_exclusion_sets(conn)
    skipped, _ = _should_skip({"database": "PROD", "schema": "PUBLIC"}, db_set, schema_set)
    assert not skipped


def test_excluded_database_skips_all_its_schemas():
    conn = _make_conn_with_exclusions(excluded_databases=["SANDBOX"])
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, reason = _should_skip({"database": "SANDBOX", "schema": "ANY_SCHEMA"}, db_set, schema_set)
    assert skipped
    assert reason == "database excluded by connection config"


def test_excluded_database_does_not_skip_other_databases():
    conn = _make_conn_with_exclusions(excluded_databases=["SANDBOX"])
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, _ = _should_skip({"database": "PROD", "schema": "PUBLIC"}, db_set, schema_set)
    assert not skipped


def test_excluded_schema_skips_only_that_schema():
    conn = _make_conn_with_exclusions(
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}]
    )
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, reason = _should_skip({"database": "PROD", "schema": "STAGING"}, db_set, schema_set)
    assert skipped
    assert reason == "schema excluded by connection config"


def test_excluded_schema_does_not_skip_other_schemas_in_same_db():
    conn = _make_conn_with_exclusions(
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}]
    )
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, _ = _should_skip({"database": "PROD", "schema": "PUBLIC"}, db_set, schema_set)
    assert not skipped


def test_excluded_schema_does_not_skip_same_schema_name_in_other_db():
    conn = _make_conn_with_exclusions(
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}]
    )
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, _ = _should_skip({"database": "DEV", "schema": "STAGING"}, db_set, schema_set)
    assert not skipped


def test_multiple_exclusions():
    conn = _make_conn_with_exclusions(
        excluded_databases=["SANDBOX", "TEST_DB"],
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}, {"database": "PROD", "schema": "DEV"}],
    )
    db_set, schema_set = _build_exclusion_sets(conn)

    assert _should_skip({"database": "SANDBOX", "schema": "ANYTHING"}, db_set, schema_set)[0]
    assert _should_skip({"database": "TEST_DB", "schema": "ANY"}, db_set, schema_set)[0]
    assert _should_skip({"database": "PROD", "schema": "STAGING"}, db_set, schema_set)[0]
    assert _should_skip({"database": "PROD", "schema": "DEV"}, db_set, schema_set)[0]
    assert not _should_skip({"database": "PROD", "schema": "PUBLIC"}, db_set, schema_set)[0]


def test_excluded_database_not_added_to_scanned_databases():
    """Excluded databases must not enter scanned_databases (exclude mode).

    Mirrors the fixed run_discovery loop: scanned_databases.add() only fires
    after _browse_tables_sync succeeds, not before the filter checks.
    """
    conn = _make_conn_with_exclusions(excluded_databases=["SANDBOX"])
    excluded_db_set, excluded_schema_set = _build_exclusion_sets(conn)
    scanned_databases: set = set()
    for sel in [{"database": "SANDBOX", "schema": "PUBLIC"}, {"database": "PROD", "schema": "PUBLIC"}]:
        skipped, _ = _should_skip(sel, excluded_db_set, excluded_schema_set)
        if skipped:
            continue
        scanned_databases.add(sel["database"])
    assert "SANDBOX" not in scanned_databases
    assert "PROD" in scanned_databases


def test_include_mode_excluded_database_not_added_to_scanned_databases():
    """Databases not on the allowlist must not enter scanned_databases (include mode)."""
    included_db_set = {"PROD"}
    scanned_databases: set = set()
    for sel in [{"database": "SANDBOX", "schema": "PUBLIC"}, {"database": "PROD", "schema": "PUBLIC"}]:
        if included_db_set and sel["database"] not in included_db_set:
            continue
        scanned_databases.add(sel["database"])
    assert "SANDBOX" not in scanned_databases
    assert "PROD" in scanned_databases
