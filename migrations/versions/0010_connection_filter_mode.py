"""Add filter_mode, included_databases, included_schemas to snowflake_connections

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-08
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('snowflake_connections', sa.Column('filter_mode', sa.String(20), nullable=False, server_default='exclude'))
    op.add_column('snowflake_connections', sa.Column('included_databases', VARIANT(), nullable=True))
    op.add_column('snowflake_connections', sa.Column('included_schemas', VARIANT(), nullable=True))


def downgrade() -> None:
    op.drop_column('snowflake_connections', 'included_schemas')
    op.drop_column('snowflake_connections', 'included_databases')
    op.drop_column('snowflake_connections', 'filter_mode')
