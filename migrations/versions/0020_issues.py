"""issue intake & lifecycle: add dq_issues table"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dq_issues",
        sa.Column("issue_id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("issue_type", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("severity", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("domain_id", sa.String(36), nullable=True),
        sa.Column("subdomain_id", sa.String(36), nullable=True),
        sa.Column("asset_id", sa.String(36), nullable=True),
        sa.Column("source_id", sa.String(36), nullable=True),
        sa.Column("rule_id", sa.String(36), nullable=True),
        sa.Column("run_id", sa.String(36), nullable=True),
        sa.Column("alert_id", sa.String(36), nullable=True),
        sa.Column("assigned_team_id", sa.String(36), nullable=True),
        sa.Column("assigned_to", sa.String(200), nullable=True),
        sa.Column("created_by", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("reopen_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("resolution_note", sa.Text(), nullable=True),
    )
    op.create_index("ix_dq_issues_status", "dq_issues", ["status"])
    op.create_index("ix_dq_issues_asset_id", "dq_issues", ["asset_id"])
    op.create_index("ix_dq_issues_domain_id", "dq_issues", ["domain_id"])


def downgrade() -> None:
    op.drop_index("ix_dq_issues_domain_id", table_name="dq_issues")
    op.drop_index("ix_dq_issues_asset_id", table_name="dq_issues")
    op.drop_index("ix_dq_issues_status", table_name="dq_issues")
    op.drop_table("dq_issues")
