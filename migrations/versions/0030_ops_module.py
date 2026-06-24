from __future__ import annotations

"""ops_module: add pipeline, escalation policy, alert routing tables"""

from alembic import op
import sqlalchemy as sa

revision = "0030"
down_revision = "0029"
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

    if not _table_exists(bind, "ops_pipelines"):
        op.create_table(
            "ops_pipelines",
            sa.Column("pipeline_id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("trigger_type", sa.String(30), nullable=False, server_default=sa.text("'manual'")),
            sa.Column("cron_expr", sa.String(100), nullable=True),
            sa.Column("trigger_config", sa.Text(), nullable=True),
            sa.Column("connection_ids", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default=sa.text("3600")),
            sa.Column("max_retries", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(bind, "ops_pipeline_steps"):
        op.create_table(
            "ops_pipeline_steps",
            sa.Column("step_id", sa.String(36), primary_key=True),
            sa.Column("pipeline_id", sa.String(36), sa.ForeignKey("ops_pipelines.pipeline_id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("step_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("step_type", sa.String(50), nullable=False),
            sa.Column("step_config", sa.Text(), nullable=True),
            sa.Column("depends_on", sa.Text(), nullable=True),
            sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default=sa.text("1800")),
            sa.Column("max_retries", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(bind, "ops_pipeline_runs"):
        op.create_table(
            "ops_pipeline_runs",
            sa.Column("run_id", sa.String(36), primary_key=True),
            sa.Column("pipeline_id", sa.String(36), sa.ForeignKey("ops_pipelines.pipeline_id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'queued'")),
            sa.Column("triggered_by", sa.String(200), nullable=True),
            sa.Column("trigger_type", sa.String(30), nullable=False, server_default=sa.text("'manual'")),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(bind, "ops_pipeline_step_runs"):
        op.create_table(
            "ops_pipeline_step_runs",
            sa.Column("step_run_id", sa.String(36), primary_key=True),
            sa.Column("run_id", sa.String(36), sa.ForeignKey("ops_pipeline_runs.run_id", ondelete="CASCADE"), nullable=False),
            sa.Column("step_id", sa.String(36), nullable=False),
            sa.Column("step_name", sa.String(200), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'pending'")),
            sa.Column("attempt", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("output_summary", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(bind, "ops_escalation_policies"):
        op.create_table(
            "ops_escalation_policies",
            sa.Column("policy_id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("severity", sa.String(20), nullable=False, server_default=sa.text("'all'")),
            sa.Column("steps", sa.Text(), nullable=True),
            sa.Column("oncall_rotation", sa.Text(), nullable=True),
            sa.Column("repeat_interval_minutes", sa.Integer(), nullable=False, server_default=sa.text("60")),
            sa.Column("max_escalations", sa.Integer(), nullable=False, server_default=sa.text("3")),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("created_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(bind, "ops_alert_routing_rules"):
        op.create_table(
            "ops_alert_routing_rules",
            sa.Column("rule_id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("priority", sa.Integer(), nullable=False, server_default=sa.text("100")),
            sa.Column("match_conditions", sa.Text(), nullable=True),
            sa.Column("notification_channels", sa.Text(), nullable=True),
            sa.Column("escalation_policy_id", sa.String(36),
                      sa.ForeignKey("ops_escalation_policies.policy_id", ondelete="SET NULL"), nullable=True),
            sa.Column("is_active", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("created_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(bind, "ops_maintenance_windows"):
        op.create_table(
            "ops_maintenance_windows",
            sa.Column("window_id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("scope", sa.Text(), nullable=True),
            sa.Column("start_at", sa.DateTime(), nullable=False),
            sa.Column("end_at", sa.DateTime(), nullable=False),
            sa.Column("recurrence", sa.String(20), nullable=False, server_default=sa.text("'none'")),
            sa.Column("suppress_alerts", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("suppress_scans", sa.Boolean(), server_default=sa.text("false")),
            sa.Column("created_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(bind, "ops_flap_detection_config"):
        op.create_table(
            "ops_flap_detection_config",
            sa.Column("config_id", sa.String(36), primary_key=True),
            sa.Column("is_enabled", sa.Boolean(), server_default=sa.text("true")),
            sa.Column("flap_threshold", sa.Integer(), nullable=False, server_default=sa.text("3")),
            sa.Column("window_minutes", sa.Integer(), nullable=False, server_default=sa.text("30")),
            sa.Column("suppress_duration_minutes", sa.Integer(), nullable=False, server_default=sa.text("60")),
            sa.Column("updated_by", sa.String(200), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("ops_flap_detection_config")
    op.drop_table("ops_maintenance_windows")
    op.drop_table("ops_alert_routing_rules")
    op.drop_table("ops_escalation_policies")
    op.drop_table("ops_pipeline_step_runs")
    op.drop_table("ops_pipeline_runs")
    op.drop_table("ops_pipeline_steps")
    op.drop_table("ops_pipelines")
