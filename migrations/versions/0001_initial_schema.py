"""Initial schema with all tables

Revision ID: 0001
Revises:
Create Date: 2026-05-05

"""
from alembic import op
import sqlalchemy as sa

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('user_id', sa.String(36), nullable=False),
        sa.Column('email', sa.String(200), nullable=False),
        sa.Column('hashed_password', sa.Text(), nullable=False),
        sa.Column('full_name', sa.String(200), nullable=False),
        sa.Column('role', sa.String(30), nullable=False, server_default='viewer'),
        sa.Column('domain_id', sa.String(36), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('is_verified', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('user_id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_users_email', 'users', ['email'])

    op.create_table(
        'domains',
        sa.Column('domain_id', sa.String(36), nullable=False),
        sa.Column('domain_name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_name', sa.String(200), nullable=True),
        sa.Column('owner_email', sa.String(200), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('domain_id'),
        sa.UniqueConstraint('domain_name'),
    )

    op.create_table(
        'subdomains',
        sa.Column('subdomain_id', sa.String(36), nullable=False),
        sa.Column('domain_id', sa.String(36), nullable=False),
        sa.Column('subdomain_name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('owner_name', sa.String(200), nullable=True),
        sa.Column('owner_email', sa.String(200), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['domain_id'], ['domains.domain_id']),
        sa.PrimaryKeyConstraint('subdomain_id'),
    )

    op.create_table(
        'snowflake_connections',
        sa.Column('connection_id', sa.String(36), nullable=False),
        sa.Column('connection_name', sa.String(200), nullable=False),
        sa.Column('account', sa.String(300), nullable=False),
        sa.Column('sf_user', sa.String(200), nullable=False),
        sa.Column('password', sa.Text(), nullable=True),
        sa.Column('warehouse', sa.String(200), server_default='DQ_EXECUTION_WH'),
        sa.Column('role', sa.String(200), nullable=True),
        sa.Column('default_database', sa.String(200), nullable=True),
        sa.Column('default_schema', sa.String(200), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('connection_id'),
    )

    op.create_table(
        'data_assets',
        sa.Column('asset_id', sa.String(36), nullable=False),
        sa.Column('domain_id', sa.String(36), nullable=False),
        sa.Column('subdomain_id', sa.String(36), nullable=False),
        sa.Column('connection_id', sa.String(36), nullable=True),
        sa.Column('snowflake_account', sa.String(200), nullable=True),
        sa.Column('sf_database_name', sa.String(200), nullable=True),
        sa.Column('sf_schema_name', sa.String(200), nullable=False),
        sa.Column('sf_table_name', sa.String(200), nullable=False),
        sa.Column('table_type', sa.String(50), nullable=True),
        sa.Column('table_description', sa.Text(), nullable=True),
        sa.Column('owner_name', sa.String(200), nullable=True),
        sa.Column('owner_email', sa.String(200), nullable=True),
        sa.Column('criticality', sa.String(20), server_default='medium'),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['domain_id'], ['domains.domain_id']),
        sa.ForeignKeyConstraint(['subdomain_id'], ['subdomains.subdomain_id']),
        sa.PrimaryKeyConstraint('asset_id'),
    )

    op.create_table(
        'sla_configs',
        sa.Column('sla_id', sa.String(36), nullable=False),
        sa.Column('entity_type', sa.String(20), nullable=False),
        sa.Column('entity_id', sa.String(36), nullable=False),
        sa.Column('min_quality_score', sa.Float(), server_default='95.0'),
        sa.Column('max_failure_pct', sa.Float(), server_default='5.0'),
        sa.Column('alert_on_breach', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('notification_emails', sa.Text(), nullable=True),
        sa.Column('notification_slack_channel', sa.String(200), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('sla_id'),
    )
    op.create_index('ix_sla_configs_entity_id', 'sla_configs', ['entity_id'])

    op.create_table(
        'dq_rules',
        sa.Column('rule_id', sa.String(36), nullable=False),
        sa.Column('rule_name', sa.String(200), nullable=False),
        sa.Column('rule_description', sa.Text(), nullable=True),
        sa.Column('domain_id', sa.String(36), nullable=False),
        sa.Column('subdomain_id', sa.String(36), nullable=False),
        sa.Column('asset_id', sa.String(36), nullable=False),
        sa.Column('rule_type', sa.String(50), nullable=False),
        sa.Column('rule_category', sa.String(50), nullable=True),
        sa.Column('target_column', sa.String(200), nullable=True),
        sa.Column('rule_sql', sa.Text(), nullable=True),
        sa.Column('rule_config', sa.JSON(), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('status', sa.String(30), server_default='active'),
        sa.Column('version', sa.Integer(), server_default='1'),
        sa.Column('sla_threshold', sa.Float(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('approved_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['domain_id'], ['domains.domain_id']),
        sa.ForeignKeyConstraint(['subdomain_id'], ['subdomains.subdomain_id']),
        sa.ForeignKeyConstraint(['asset_id'], ['data_assets.asset_id']),
        sa.PrimaryKeyConstraint('rule_id'),
    )

    op.create_table(
        'rule_tags',
        sa.Column('tag_id', sa.String(36), nullable=False),
        sa.Column('rule_id', sa.String(36), nullable=False),
        sa.Column('tag_name', sa.String(100), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['rule_id'], ['dq_rules.rule_id']),
        sa.PrimaryKeyConstraint('tag_id'),
    )
    op.create_index('ix_rule_tags_rule_id', 'rule_tags', ['rule_id'])

    op.create_table(
        'dq_schedules',
        sa.Column('schedule_id', sa.String(36), nullable=False),
        sa.Column('rule_id', sa.String(36), nullable=True),
        sa.Column('asset_id', sa.String(36), nullable=True),
        sa.Column('subdomain_id', sa.String(36), nullable=True),
        sa.Column('domain_id', sa.String(36), nullable=True),
        sa.Column('schedule_level', sa.String(20), nullable=False),
        sa.Column('frequency', sa.String(20), nullable=False),
        sa.Column('cron_expression', sa.String(100), nullable=True),
        sa.Column('timezone', sa.String(50), server_default='America/Los_Angeles'),
        sa.Column('run_at_hour', sa.Integer(), nullable=True),
        sa.Column('run_at_minute', sa.Integer(), nullable=True),
        sa.Column('start_time', sa.DateTime(), nullable=True),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['rule_id'], ['dq_rules.rule_id']),
        sa.PrimaryKeyConstraint('schedule_id'),
    )

    op.create_table(
        'dq_rule_runs',
        sa.Column('run_id', sa.String(36), nullable=False),
        sa.Column('rule_id', sa.String(36), nullable=False),
        sa.Column('asset_id', sa.String(36), nullable=False),
        sa.Column('domain_id', sa.String(36), nullable=False),
        sa.Column('subdomain_id', sa.String(36), nullable=False),
        sa.Column('execution_start_time', sa.DateTime(), nullable=True),
        sa.Column('execution_end_time', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('total_rows_scanned', sa.Integer(), nullable=True),
        sa.Column('failed_rows_count', sa.Integer(), nullable=True),
        sa.Column('passed_rows_count', sa.Integer(), nullable=True),
        sa.Column('failure_percentage', sa.Float(), nullable=True),
        sa.Column('quality_score', sa.Float(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('executed_sql', sa.Text(), nullable=True),
        sa.Column('ai_explanation', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['rule_id'], ['dq_rules.rule_id']),
        sa.ForeignKeyConstraint(['asset_id'], ['data_assets.asset_id']),
        sa.ForeignKeyConstraint(['domain_id'], ['domains.domain_id']),
        sa.ForeignKeyConstraint(['subdomain_id'], ['subdomains.subdomain_id']),
        sa.PrimaryKeyConstraint('run_id'),
    )

    op.create_table(
        'dq_rule_run_samples',
        sa.Column('sample_id', sa.String(36), nullable=False),
        sa.Column('run_id', sa.String(36), nullable=False),
        sa.Column('rule_id', sa.String(36), nullable=False),
        sa.Column('failed_record', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['run_id'], ['dq_rule_runs.run_id']),
        sa.PrimaryKeyConstraint('sample_id'),
    )

    op.create_table(
        'dq_quality_scores',
        sa.Column('score_id', sa.String(36), nullable=False),
        sa.Column('score_date', sa.Date(), nullable=False),
        sa.Column('score_level', sa.String(20), nullable=False),
        sa.Column('domain_id', sa.String(36), nullable=True),
        sa.Column('subdomain_id', sa.String(36), nullable=True),
        sa.Column('asset_id', sa.String(36), nullable=True),
        sa.Column('total_rules', sa.Integer(), server_default='0'),
        sa.Column('passed_rules', sa.Integer(), server_default='0'),
        sa.Column('failed_rules', sa.Integer(), server_default='0'),
        sa.Column('warning_rules', sa.Integer(), server_default='0'),
        sa.Column('error_rules', sa.Integer(), server_default='0'),
        sa.Column('quality_score', sa.Float(), server_default='100.0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('score_id'),
    )

    op.create_table(
        'dq_alerts',
        sa.Column('alert_id', sa.String(36), nullable=False),
        sa.Column('run_id', sa.String(36), nullable=False),
        sa.Column('rule_id', sa.String(36), nullable=False),
        sa.Column('domain_id', sa.String(36), nullable=False),
        sa.Column('subdomain_id', sa.String(36), nullable=False),
        sa.Column('asset_id', sa.String(36), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('alert_status', sa.String(20), server_default='open'),
        sa.Column('alert_message', sa.Text(), nullable=True),
        sa.Column('notified_to', sa.String(500), nullable=True),
        sa.Column('notification_channel', sa.String(50), nullable=True),
        sa.Column('notification_sent', sa.Boolean(), server_default=sa.text('false')),
        sa.Column('notification_sent_at', sa.DateTime(), nullable=True),
        sa.Column('acknowledged_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('alert_id'),
    )
    op.create_index('ix_dq_alerts_rule_id', 'dq_alerts', ['rule_id'])
    op.create_index('ix_dq_alerts_domain_id', 'dq_alerts', ['domain_id'])
    op.create_index('ix_dq_alerts_alert_status', 'dq_alerts', ['alert_status'])

    op.create_table(
        'audit_logs',
        sa.Column('audit_id', sa.String(36), nullable=False),
        sa.Column('user_email', sa.String(200), nullable=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('entity_type', sa.String(50), nullable=False),
        sa.Column('entity_id', sa.String(36), nullable=True),
        sa.Column('old_value', sa.JSON(), nullable=True),
        sa.Column('new_value', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('audit_id'),
    )

    op.create_table(
        'app_config',
        sa.Column('config_id', sa.String(36), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('is_secret', sa.Boolean(), server_default=sa.text('false')),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('updated_by', sa.String(200), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('config_id'),
        sa.UniqueConstraint('key'),
    )


def downgrade() -> None:
    op.drop_table('app_config')
    op.drop_table('audit_logs')
    op.drop_table('dq_alerts')
    op.drop_table('dq_quality_scores')
    op.drop_table('dq_rule_run_samples')
    op.drop_table('dq_rule_runs')
    op.drop_table('dq_schedules')
    op.drop_table('rule_tags')
    op.drop_table('dq_rules')
    op.drop_table('sla_configs')
    op.drop_table('data_assets')
    op.drop_table('snowflake_connections')
    op.drop_table('subdomains')
    op.drop_table('domains')
    op.drop_table('users')
