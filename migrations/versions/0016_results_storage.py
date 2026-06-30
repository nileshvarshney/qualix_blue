"""Add results storage tables: scan_run_summaries, asset_scan_summaries,
scan_metrics_history, scan_evidence_logs, and three Phase-2 placeholders.

Revision ID: 0016
Revises: 0015
Create Date: 2026-06-10
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0016'
down_revision = '0015'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'scan_run_summaries',
        sa.Column('summary_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'),
                  nullable=False, unique=True),
        sa.Column('job_id', sa.String(36),
                  sa.ForeignKey('scan_jobs.job_id', ondelete='SET NULL'), nullable=True),
        sa.Column('connection_id', sa.String(36), nullable=True),
        sa.Column('scan_type', sa.String(50), nullable=True),
        sa.Column('new_assets_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_assets_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('removed_assets_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed_assets_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('schema_changes_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('quality_score_avg', sa.Float(), nullable=True),
        sa.Column('scan_parameters', VARIANT(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'asset_scan_summaries',
        sa.Column('asset_summary_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('job_id', sa.String(36),
                  sa.ForeignKey('scan_jobs.job_id', ondelete='SET NULL'), nullable=True),
        sa.Column('scan_status', sa.String(20), nullable=False, server_default='succeeded'),
        sa.Column('scan_duration_ms', sa.Integer(), nullable=True),
        sa.Column('row_count', sa.BigInteger(), nullable=True),
        sa.Column('bytes', sa.BigInteger(), nullable=True),
        sa.Column('column_count', sa.Integer(), nullable=True),
        sa.Column('schema_hash', sa.String(64), nullable=True),
        sa.Column('columns_added', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('columns_removed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('columns_changed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('schema_drift_detected', sa.Boolean(), nullable=False, server_default='FALSE'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('quality_score', sa.Float(), nullable=True),
        sa.Column('null_ratio_avg', sa.Float(), nullable=True),
        sa.Column('distinct_ratio_avg', sa.Float(), nullable=True),
        sa.Column('volume_change_pct', sa.Float(), nullable=True),
        sa.Column('freshness_hours', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('run_id', 'asset_id', name='uq_asset_scan_summary_run_asset'),
    )

    op.create_table(
        'scan_metrics_history',
        sa.Column('metric_id', sa.String(36), primary_key=True),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='SET NULL'), nullable=True),
        sa.Column('metric_date', sa.Date(), nullable=True),
        sa.Column('metric_name', sa.String(100), nullable=False),
        sa.Column('metric_value_num', sa.Float(), nullable=True),
        sa.Column('metric_value_str', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('asset_id', 'metric_name', 'metric_date', name='uq_scan_metrics_asset_metric_date'),
    )

    op.create_table(
        'scan_evidence_logs',
        sa.Column('evidence_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='SET NULL'), nullable=True),
        sa.Column('evidence_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='info'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('payload', VARIANT(), nullable=True),
        sa.Column('retention_expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'profiling_result_placeholders',
        sa.Column('profiling_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('column_name', sa.String(200), nullable=False),
        sa.Column('null_count', sa.BigInteger(), nullable=True),
        sa.Column('null_ratio', sa.Float(), nullable=True),
        sa.Column('distinct_count', sa.BigInteger(), nullable=True),
        sa.Column('distinct_ratio', sa.Float(), nullable=True),
        sa.Column('min_value', sa.Text(), nullable=True),
        sa.Column('max_value', sa.Text(), nullable=True),
        sa.Column('avg_value', sa.Float(), nullable=True),
        sa.Column('std_dev', sa.Float(), nullable=True),
        sa.Column('top_values', VARIANT(), nullable=True),
        sa.Column('pattern_frequency', VARIANT(), nullable=True),
        sa.Column('is_placeholder', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('profiled_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('run_id', 'asset_id', 'column_name', name='uq_profiling_result_run_asset_col'),
    )

    op.create_table(
        'rule_result_placeholders',
        sa.Column('result_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('rule_id', sa.String(36),
                  sa.ForeignKey('dq_rules.rule_id', ondelete='SET NULL'), nullable=True),
        sa.Column('rule_name', sa.String(200), nullable=False),
        sa.Column('rule_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('rows_scanned', sa.BigInteger(), nullable=True),
        sa.Column('rows_failed', sa.BigInteger(), nullable=True),
        sa.Column('failure_pct', sa.Float(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('is_placeholder', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'failed_sample_record_placeholders',
        sa.Column('sample_id', sa.String(36), primary_key=True),
        sa.Column('run_id', sa.String(36),
                  sa.ForeignKey('scan_job_runs.run_id', ondelete='CASCADE'), nullable=False),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('rule_result_id', sa.String(36),
                  sa.ForeignKey('rule_result_placeholders.result_id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('failed_record', VARIANT(), nullable=True),
        sa.Column('retention_expires_at', sa.DateTime(), nullable=True),
        sa.Column('is_placeholder', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_index('ix_asset_scan_summaries_run_id', 'asset_scan_summaries', ['run_id'])
    op.create_index('ix_asset_scan_summaries_asset_id', 'asset_scan_summaries', ['asset_id'])
    op.create_index('ix_scan_metrics_history_asset_id', 'scan_metrics_history', ['asset_id'])
    op.create_index('ix_scan_evidence_logs_run_id', 'scan_evidence_logs', ['run_id'])


def downgrade() -> None:
    op.drop_index('ix_scan_evidence_logs_run_id', table_name='scan_evidence_logs')
    op.drop_index('ix_scan_metrics_history_asset_id', table_name='scan_metrics_history')
    op.drop_index('ix_asset_scan_summaries_asset_id', table_name='asset_scan_summaries')
    op.drop_index('ix_asset_scan_summaries_run_id', table_name='asset_scan_summaries')
    op.drop_table('failed_sample_record_placeholders')
    op.drop_table('rule_result_placeholders')
    op.drop_table('profiling_result_placeholders')
    op.drop_table('scan_evidence_logs')
    op.drop_table('scan_metrics_history')
    op.drop_table('asset_scan_summaries')
    op.drop_table('scan_run_summaries')
