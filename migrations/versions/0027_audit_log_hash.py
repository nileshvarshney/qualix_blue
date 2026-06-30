"""audit_logs: add log_hash column for tamper-evident storage

Revision ID: 0027
Revises: 0026
Create Date: 2026-06-20
"""
from alembic import op
import sqlalchemy as sa

revision = '0027'
down_revision = '0026'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('audit_logs', sa.Column('log_hash', sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column('audit_logs', 'log_hash')
