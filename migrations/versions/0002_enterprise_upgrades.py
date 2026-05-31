"""Enterprise governance upgrades: rule versions, asset certification, rule ownership

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-05
"""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- data_assets: certification_status + technical owner ---
    op.add_column('data_assets', sa.Column('technical_owner_name', sa.String(200), nullable=True))
    op.add_column('data_assets', sa.Column('technical_owner_email', sa.String(200), nullable=True))
    op.add_column('data_assets', sa.Column('certification_status', sa.String(20), server_default='uncertified', nullable=False))
    op.add_column('data_assets', sa.Column('certified_by', sa.String(200), nullable=True))
    op.add_column('data_assets', sa.Column('certified_at', sa.DateTime(), nullable=True))

    # --- dq_rules: rejection fields + business owner ---
    op.add_column('dq_rules', sa.Column('rejected_by', sa.String(200), nullable=True))
    op.add_column('dq_rules', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.add_column('dq_rules', sa.Column('business_owner_name', sa.String(200), nullable=True))
    op.add_column('dq_rules', sa.Column('business_owner_email', sa.String(200), nullable=True))

    # --- rule_versions: immutable snapshots ---
    op.create_table(
        'rule_versions',
        sa.Column('version_id', sa.String(36), nullable=False),
        sa.Column('rule_id', sa.String(36), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('rule_name', sa.String(200), nullable=False),
        sa.Column('rule_description', sa.Text(), nullable=True),
        sa.Column('rule_type', sa.String(50), nullable=False),
        sa.Column('target_column', sa.String(200), nullable=True),
        sa.Column('rule_sql', sa.Text(), nullable=True),
        sa.Column('rule_config', sa.JSON(), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('status', sa.String(30), nullable=False),
        sa.Column('changed_by', sa.String(200), nullable=True),
        sa.Column('change_reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['rule_id'], ['dq_rules.rule_id']),
        sa.PrimaryKeyConstraint('version_id'),
    )
    op.create_index('ix_rule_versions_rule_id', 'rule_versions', ['rule_id'])


def downgrade() -> None:
    op.drop_index('ix_rule_versions_rule_id', table_name='rule_versions')
    op.drop_table('rule_versions')

    op.drop_column('dq_rules', 'business_owner_email')
    op.drop_column('dq_rules', 'business_owner_name')
    op.drop_column('dq_rules', 'rejection_reason')
    op.drop_column('dq_rules', 'rejected_by')

    op.drop_column('data_assets', 'certified_at')
    op.drop_column('data_assets', 'certified_by')
    op.drop_column('data_assets', 'certification_status')
    op.drop_column('data_assets', 'technical_owner_email')
    op.drop_column('data_assets', 'technical_owner_name')
