"""profiling engine: add data_type and row_count to profiling_result_placeholders; add run_id to column_profile_history"""

from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiling_result_placeholders",
        sa.Column("data_type", sa.String(100), nullable=True),
    )
    op.add_column(
        "profiling_result_placeholders",
        sa.Column("row_count", sa.BigInteger(), nullable=True),
    )
    op.add_column(
        "column_profile_history",
        sa.Column(
            "run_id",
            sa.String(36),
            sa.ForeignKey("scan_job_runs.run_id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("column_profile_history", "run_id")
    op.drop_column("profiling_result_placeholders", "row_count")
    op.drop_column("profiling_result_placeholders", "data_type")
