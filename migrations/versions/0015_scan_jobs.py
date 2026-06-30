"""Add scan_jobs, scan_job_runs, scan_job_run_logs for scan orchestration

Revision ID: 0015
Revises: 0014
Create Date: 2026-06-10
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0015'
down_revision = '0014'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'scan_jobs',
        sa.Column('job_id', sa.String(36), primary_key=True),
        sa.Column('connection_id', sa.String(36),
                  sa.ForeignKey('snowflake_connections.connection_id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('job_name', sa.String(200), nullable=False),
        sa.Column('job_type', sa.String(50), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('schedule_frequency', sa.String(20), nullable=False, server_default='on_demand'),
        sa.Column('cron_expr', sa.String(100), nullable=True),
        sa.Column('timezone', sa.String(50), nullable=False, server_default='UTC'),
        sa.Column('max_retries', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('timeout_seconds', sa.Integer(), nullable=False, server_default='300'),
        sa.Column('parameters', VARIANT(), nullable=True),
        sa.Column('last_run_at', sa.DateTime(), nullable=True),
        sa.Column('last_run_status', sa.String(20), nullable=True),
        sa.Column('created_by', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'scan_job_runs',
        sa.Column('run_id', sa.String(36), primary_key=True),
        sa.Column('job_id', sa.String(36),
                  sa.ForeignKey('scan_jobs.job_id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='queued'),
        sa.Column('trigger_type', sa.String(20), nullable=False, server_default='manual'),
        sa.Column('triggered_by', sa.String(200), nullable=True),
        sa.Column('attempt', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('assets_scanned', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('errors_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('warnings_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('result_summary', VARIANT(), nullable=True),
        sa.Column('parameters', VARIANT(), nullable=True),
        sa.Column('idempotency_key', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'scan_job_run_logs',
        sa.Column('log_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('level', sa.String(10), nullable=False, server_default='INFO'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('context', VARIANT(), nullable=True),
        sa.Column('logged_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('scan_job_run_logs')
    op.drop_table('scan_job_runs')
    op.drop_table('scan_jobs')
