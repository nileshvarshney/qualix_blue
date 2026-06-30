from __future__ import annotations

"""remediation: add dq_remediation_proposals, dq_remediation_executions"""

from alembic import op
import sqlalchemy as sa

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    try:
        bind.execute(sa.text(f"SELECT 1 FROM {name} LIMIT 1"))
        return True
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "dq_remediation_proposals"):
        op.create_table(
            "dq_remediation_proposals",
            sa.Column("proposal_id", sa.String(36), primary_key=True),
            sa.Column("issue_id", sa.String(36), sa.ForeignKey("dq_issues.issue_id"), nullable=False),
            sa.Column("rule_id", sa.String(36), sa.ForeignKey("dq_rules.rule_id"), nullable=False),
            sa.Column("run_id", sa.String(36), sa.ForeignKey("dq_rule_runs.run_id"), nullable=False),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("rule_type", sa.String(50), nullable=False),
            sa.Column("classification", sa.String(20), nullable=False),
            sa.Column("proposed_action", sa.Text(), nullable=False),
            sa.Column("config_field", sa.String(50), nullable=True),
            sa.Column("old_value", sa.String(50), nullable=True),
            sa.Column("new_value", sa.String(50), nullable=True),
            sa.Column("confidence", sa.String(20), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="'pending'"),
            sa.Column("decided_by", sa.String(200), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("rerun_run_id", sa.String(36), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _table_exists(bind, "dq_remediation_executions"):
        op.create_table(
            "dq_remediation_executions",
            sa.Column("execution_id", sa.String(36), primary_key=True),
            sa.Column("proposal_id", sa.String(36), sa.ForeignKey("dq_remediation_proposals.proposal_id"), nullable=False),
            sa.Column("applied_field", sa.String(50), nullable=False),
            sa.Column("applied_old_value", sa.String(50), nullable=True),
            sa.Column("applied_new_value", sa.String(50), nullable=True),
            sa.Column("triggered_by", sa.String(200), nullable=False),
            sa.Column("rerun_status", sa.String(20), nullable=True),
            sa.Column("rerun_run_id", sa.String(36), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("dq_remediation_executions")
    op.drop_table("dq_remediation_proposals")
