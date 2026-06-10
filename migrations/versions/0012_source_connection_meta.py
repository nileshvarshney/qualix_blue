"""Add environment, last_successful_scan_at, scan_readiness_status to snowflake_connections

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-10
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "snowflake_connections",
        sa.Column("environment", sa.String(20), nullable=True),
    )
    op.add_column(
        "snowflake_connections",
        sa.Column("last_successful_scan_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "snowflake_connections",
        sa.Column(
            "scan_readiness_status",
            sa.String(20),
            nullable=True,
            server_default="not_tested",
        ),
    )


def downgrade() -> None:
    op.drop_column("snowflake_connections", "scan_readiness_status")
    op.drop_column("snowflake_connections", "last_successful_scan_at")
    op.drop_column("snowflake_connections", "environment")
