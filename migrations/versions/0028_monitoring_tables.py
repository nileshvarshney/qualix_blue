from __future__ import annotations

"""monitoring: add asset_monitoring_metrics, sla_breach_predictions, correlated_incidents"""

from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = "0028"
down_revision = "0027"
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

    if not _table_exists(bind, "asset_monitoring_metrics"):
        op.create_table(
            "asset_monitoring_metrics",
            sa.Column("metric_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("metric_date", sa.Date(), nullable=False),
            sa.Column("row_count", sa.BigInteger(), nullable=True),
            sa.Column("freshness_hours", sa.Float(), nullable=True),
            sa.Column("null_rate_avg", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )

    if not _table_exists(bind, "sla_breach_predictions"):
        op.create_table(
            "sla_breach_predictions",
            sa.Column("prediction_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("predicted_at", sa.DateTime(), nullable=False),
            sa.Column("horizon_days", sa.Integer(), nullable=False, server_default="7"),
            sa.Column("forecast_scores", VARIANT(), nullable=True),
            sa.Column("lower_band", VARIANT(), nullable=True),
            sa.Column("upper_band", VARIANT(), nullable=True),
            sa.Column("breach_day", sa.Integer(), nullable=True),
            sa.Column("breach_probability", sa.Float(), nullable=True),
            sa.Column("is_at_risk", sa.Boolean(), nullable=False, server_default="false"),
        )

    if not _table_exists(bind, "correlated_incidents"):
        op.create_table(
            "correlated_incidents",
            sa.Column("incident_id", sa.String(36), primary_key=True),
            sa.Column("detected_at", sa.DateTime(), nullable=False),
            sa.Column("window_start", sa.DateTime(), nullable=False),
            sa.Column("window_end", sa.DateTime(), nullable=False),
            sa.Column("asset_ids", VARIANT(), nullable=True),
            sa.Column("anomaly_ids", VARIANT(), nullable=True),
            sa.Column("asset_count", sa.Integer(), nullable=False),
            sa.Column("severity", sa.String(20), nullable=False, server_default="'medium'"),
            sa.Column("status", sa.String(20), nullable=False, server_default="'open'"),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("correlated_incidents")
    op.drop_table("sla_breach_predictions")
    op.drop_table("asset_monitoring_metrics")
