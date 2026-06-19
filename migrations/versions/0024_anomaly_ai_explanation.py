"""anomaly_detections: add ai_explanation column for LLM-generated anomaly context"""

from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "anomaly_detections",
        sa.Column("ai_explanation", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("anomaly_detections", "ai_explanation")
