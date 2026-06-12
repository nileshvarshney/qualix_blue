"""quality scoring: add dq_dimension_scores table for per-asset dimension scores"""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dq_dimension_scores",
        sa.Column("score_id", sa.String(36), primary_key=True),
        sa.Column("score_date", sa.Date(), nullable=False),
        sa.Column("score_level", sa.String(20), nullable=False),
        sa.Column("domain_id", sa.String(36), nullable=True),
        sa.Column("subdomain_id", sa.String(36), nullable=True),
        sa.Column("asset_id", sa.String(36), nullable=True),
        sa.Column("dimension", sa.String(20), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("source", sa.String(20), nullable=False, server_default="none"),
        sa.Column("total_rules", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("passed_rules", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_rules", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "score_date", "score_level", "domain_id", "subdomain_id", "asset_id", "dimension",
            name="uq_dimension_score",
        ),
    )
    op.create_index(
        "ix_dq_dimension_scores_asset_date",
        "dq_dimension_scores",
        ["asset_id", "score_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_dq_dimension_scores_asset_date", table_name="dq_dimension_scores")
    op.drop_table("dq_dimension_scores")
