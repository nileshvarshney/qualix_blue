from app.db.models import Issue, ISSUE_TRANSITIONS


def test_issue_table_name():
    assert Issue.__tablename__ == "dq_issues"


def test_issue_columns():
    cols = {c.name for c in Issue.__table__.columns}
    expected = {
        "issue_id", "title", "description", "issue_type", "status", "severity",
        "domain_id", "subdomain_id", "asset_id", "source_id", "rule_id", "run_id",
        "alert_id", "assigned_team_id", "assigned_to", "created_by", "created_at",
        "updated_at", "resolved_at", "closed_at", "reopen_count", "resolution_note",
    }
    assert expected.issubset(cols)


def test_issue_transitions_table():
    assert ISSUE_TRANSITIONS["new"] == {"confirmed", "closed"}
    assert ISSUE_TRANSITIONS["confirmed"] == {"in_progress", "closed"}
    assert ISSUE_TRANSITIONS["in_progress"] == {"blocked", "resolved", "confirmed"}
    assert ISSUE_TRANSITIONS["blocked"] == {"in_progress"}
    assert ISSUE_TRANSITIONS["resolved"] == {"closed", "reopened"}
    assert ISSUE_TRANSITIONS["closed"] == {"reopened"}
    assert ISSUE_TRANSITIONS["reopened"] == {"confirmed", "in_progress"}
