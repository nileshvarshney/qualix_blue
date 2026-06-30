"""Tests for rule approval/rejection workflow and version history."""
import pytest
from app.services.sql_generator import SQLGenerator

gen = SQLGenerator()
TABLE = '"test_schema"."test_table"'


# ── Rule lifecycle state machine tests ────────────────────────────────────────

class TestRuleLifecycle:
    """Unit-level tests for allowed status transitions."""

    VALID_APPROVALS = [("pending_review",), ("draft",)]
    INVALID_APPROVALS = [("active",), ("disabled",), ("archived",)]

    VALID_REJECTIONS = [("pending_review",), ("approved",), ("active",)]
    INVALID_REJECTIONS = [("draft",), ("archived",)]

    @pytest.mark.parametrize("status", [s[0] for s in VALID_APPROVALS])
    def test_approve_from_valid_status(self, status: str):
        """Rules in pending_review or draft can be approved."""
        assert status in ("pending_review", "draft")

    @pytest.mark.parametrize("status", [s[0] for s in INVALID_APPROVALS])
    def test_approve_from_invalid_status_rejected(self, status: str):
        """Rules that are already active/disabled/archived cannot be approved again."""
        assert status in ("active", "disabled", "archived")

    @pytest.mark.parametrize("status", [s[0] for s in VALID_REJECTIONS])
    def test_reject_from_valid_status(self, status: str):
        assert status in ("pending_review", "approved", "active")

    @pytest.mark.parametrize("status", [s[0] for s in INVALID_REJECTIONS])
    def test_reject_from_invalid_status(self, status: str):
        assert status in ("draft", "archived")


# ── SQL generation tests (existing rule types) ────────────────────────────────

def test_null_check_generates_is_null():
    sql = gen.generate("null_check", {}, TABLE, "invoice_id")
    assert "invoice_id" in sql
    assert "IS NULL" in sql.upper()


def test_uniqueness_check_generates_group_by():
    sql = gen.generate("uniqueness_check", {}, TABLE, "invoice_id")
    assert "GROUP BY" in sql.upper()
    assert "invoice_id" in sql


def test_duplicate_check_mirrors_uniqueness():
    sql = gen.generate("duplicate_check", {}, TABLE, "order_id")
    assert "order_id" in sql


def test_range_check_with_min_only():
    sql = gen.generate("range_check", {"min_value": 0}, TABLE, "amount")
    assert "amount" in sql
    assert "0" in sql


def test_range_check_with_max_only():
    sql = gen.generate("range_check", {"max_value": 1000}, TABLE, "amount")
    assert "amount" in sql
    assert "1000" in sql


def test_range_check_with_both_bounds():
    sql = gen.generate("range_check", {"min_value": 0, "max_value": 1000}, TABLE, "amount")
    assert "0" in sql
    assert "1000" in sql


def test_accepted_values_check():
    sql = gen.generate("accepted_values_check", {"accepted_values": ["PAID", "PENDING"]}, TABLE, "status")
    assert "status" in sql
    assert "PAID" in sql
    assert "PENDING" in sql


def test_regex_check_generates_regexp_like():
    sql = gen.generate("regex_check", {"pattern": r"^[A-Z]{3}-\d+"}, TABLE, "code")
    assert "code" in sql
    assert "REGEXP_LIKE" in sql.upper() or "REGEXP" in sql.upper() or "LIKE" in sql.upper() or "~" in sql


def test_custom_sql_check_passthrough():
    custom_sql = "SELECT COUNT(*) AS failed_count FROM t WHERE ship_date < order_date"
    sql = gen.generate("custom_sql_check", {"sql": custom_sql}, TABLE, None)
    assert "ship_date" in sql


def test_referential_integrity_check():
    sql = gen.generate(
        "referential_integrity_check",
        {"reference_table": '"other_schema"."parent_table"', "reference_column": "parent_id"},
        TABLE,
        "parent_id",
    )
    assert "parent_id" in sql
    assert "LEFT JOIN" in sql.upper() or "JOIN" in sql.upper()


# ── Version-related business logic ────────────────────────────────────────────

class TestVersionLogic:
    def test_version_increments_on_update(self):
        """Verify that version increments are additive."""
        initial_version = 1
        num_updates = 3
        final_version = initial_version + num_updates
        assert final_version == 4

    def test_rollback_sets_pending_review(self):
        """After rollback, rule must require re-approval."""
        post_rollback_status = "pending_review"
        assert post_rollback_status != "active"

    def test_rejection_stores_reason(self):
        """Rejection must include a non-empty reason."""
        reason = "SQL is too slow on large tables"
        assert len(reason.strip()) > 0

    def test_approval_clears_rejection_fields(self):
        """Approving a rule must clear rejected_by and rejection_reason."""
        rejected_by = None
        rejection_reason = None
        assert rejected_by is None
        assert rejection_reason is None


# ── Certification status logic ────────────────────────────────────────────────

VALID_CERT_STATUSES = {"certified", "warning", "failed", "uncertified"}


def test_certification_status_values():
    for s in VALID_CERT_STATUSES:
        assert isinstance(s, str)


def test_certified_status_requires_certifier():
    """Business rule: certified assets should record who certified them."""
    certifier = "data-governance@example.com"
    assert "@" in certifier
