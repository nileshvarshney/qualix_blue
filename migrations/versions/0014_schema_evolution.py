"""Add schema_baselines and schema_drift_events tables for schema evolution tracking

Revision ID: 0014
Revises: 0013
Create Date: 2026-06-10
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0014'
down_revision = '0013'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'schema_baselines',
        sa.Column('baseline_id', sa.String(36), primary_key=True),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='active'),
        sa.Column('columns_snapshot', VARIANT(), nullable=True),
        sa.Column('approved_by', sa.String(36), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'schema_drift_events',
        sa.Column('event_id', sa.String(36), primary_key=True),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('baseline_id', sa.String(36),
                  sa.ForeignKey('schema_baselines.baseline_id'), nullable=False),
        sa.Column('detected_at', sa.DateTime(), nullable=False),
        sa.Column('change_type', sa.String(30), nullable=False),
        sa.Column('column_name', sa.String(200), nullable=False),
        sa.Column('old_value', sa.String(500), nullable=True),
        sa.Column('new_value', sa.String(500), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_by', sa.String(36), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('schema_drift_events')
    op.drop_table('schema_baselines')
