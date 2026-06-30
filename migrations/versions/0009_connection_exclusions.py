"""Add excluded_databases and excluded_schemas to snowflake_connections

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-08
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('snowflake_connections', sa.Column('excluded_databases', VARIANT(), nullable=True))
    op.add_column('snowflake_connections', sa.Column('excluded_schemas', VARIANT(), nullable=True))


def downgrade() -> None:
    op.drop_column('snowflake_connections', 'excluded_schemas')
    op.drop_column('snowflake_connections', 'excluded_databases')
