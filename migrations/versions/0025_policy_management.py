"""policy management: add status to governance_policies, create approval_requests, governance_policy_versions, notifications"""

from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = "0025"
down_revision = "0024"
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

    # Add status column to governance_policies (idempotent)
    try:
        op.add_column(
            "governance_policies",
            sa.Column("status", sa.String(20), nullable=True, server_default="active"),
        )
        op.execute(
            "UPDATE governance_policies SET status = CASE WHEN is_active THEN 'active' ELSE 'draft' END WHERE status IS NULL"
        )
    except Exception:
        pass  # column already exists

    if not _table_exists(bind, "approval_requests"):
        op.create_table(
            "approval_requests",
            sa.Column("approval_id", sa.String(36), primary_key=True),
            sa.Column("entity_type", sa.String(50), nullable=False),
            sa.Column("entity_id", sa.String(36), nullable=False),
            sa.Column("entity_snapshot", VARIANT(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("requested_by", sa.String(200), nullable=False),
            sa.Column("reviewed_by", sa.String(200), nullable=True),
            sa.Column("feedback", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_approval_requests_entity", "approval_requests", ["entity_type", "entity_id"])
        op.create_index("ix_approval_requests_status", "approval_requests", ["status"])

    if not _table_exists(bind, "governance_policy_versions"):
        op.create_table(
            "governance_policy_versions",
            sa.Column("version_id", sa.String(36), primary_key=True),
            sa.Column("policy_id", sa.String(36), sa.ForeignKey("governance_policies.policy_id"), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("changed_by", sa.String(200), nullable=False),
            sa.Column("changed_at", sa.DateTime(), nullable=False),
            sa.Column("change_summary", sa.String(500), nullable=True),
            sa.Column("field_diffs", VARIANT(), nullable=True),
            sa.Column("snapshot", VARIANT(), nullable=True),
        )
        op.create_index("ix_policy_versions_policy_id", "governance_policy_versions", ["policy_id"])

    if not _table_exists(bind, "notifications"):
        op.create_table(
            "notifications",
            sa.Column("notification_id", sa.String(36), primary_key=True),
            sa.Column("user_email", sa.String(200), nullable=False),
            sa.Column("type", sa.String(50), nullable=False),
            sa.Column("title", sa.String(500), nullable=False),
            sa.Column("body", sa.Text(), nullable=True),
            sa.Column("entity_type", sa.String(50), nullable=True),
            sa.Column("entity_id", sa.String(36), nullable=True),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("email_sent", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_notifications_user_email", "notifications", ["user_email", "is_read"])


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "notifications"):
        op.drop_index("ix_notifications_user_email", table_name="notifications")
        op.drop_table("notifications")
    if _table_exists(bind, "governance_policy_versions"):
        op.drop_index("ix_policy_versions_policy_id", table_name="governance_policy_versions")
        op.drop_table("governance_policy_versions")
    if _table_exists(bind, "approval_requests"):
        op.drop_index("ix_approval_requests_status", table_name="approval_requests")
        op.drop_index("ix_approval_requests_entity", table_name="approval_requests")
        op.drop_table("approval_requests")
    try:
        op.drop_column("governance_policies", "status")
    except Exception:
        pass
