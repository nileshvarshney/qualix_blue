"""Column profiling: add ordinal_position, std_dev, top_values to column_metadata

Revision ID: 0004
Revises: 0002
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('column_metadata', sa.Column('ordinal_position', sa.Integer(), nullable=True))
    op.add_column('column_metadata', sa.Column('std_dev',          sa.Float(),   nullable=True))
    op.add_column('column_metadata', sa.Column('top_values',       sa.Text(),    nullable=True))


def downgrade() -> None:
    op.drop_column('column_metadata', 'top_values')
    op.drop_column('column_metadata', 'std_dev')
    op.drop_column('column_metadata', 'ordinal_position')
