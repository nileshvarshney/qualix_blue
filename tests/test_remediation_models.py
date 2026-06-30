from app.db.models import RemediationProposal, RemediationExecution


def test_remediation_proposal_table_name():
    assert RemediationProposal.__tablename__ == "dq_remediation_proposals"


def test_remediation_proposal_columns():
    cols = {c.name for c in RemediationProposal.__table__.columns}
    expected = {
        "proposal_id", "issue_id", "rule_id", "run_id", "asset_id", "rule_type",
        "classification", "proposed_action", "config_field", "old_value", "new_value",
        "confidence", "status", "decided_by", "decided_at", "rerun_run_id", "created_at",
    }
    assert expected.issubset(cols)


def test_remediation_execution_table_name():
    assert RemediationExecution.__tablename__ == "dq_remediation_executions"


def test_remediation_execution_columns():
    cols = {c.name for c in RemediationExecution.__table__.columns}
    expected = {
        "execution_id", "proposal_id", "applied_field", "applied_old_value",
        "applied_new_value", "triggered_by", "rerun_status", "rerun_run_id",
        "error_message", "created_at",
    }
    assert expected.issubset(cols)
