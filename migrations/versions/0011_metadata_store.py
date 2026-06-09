"""Add metadata store: extend assets, asset_source_meta, column_metadata; add asset_metadata_snapshots

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-08
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Extend assets — operational + quality placeholders
    op.add_column('assets', sa.Column('last_scanned_at', sa.DateTime(), nullable=True))
    op.add_column('assets', sa.Column('scan_status', sa.String(20), nullable=True))
    op.add_column('assets', sa.Column('scan_duration_ms', sa.Integer(), nullable=True))
    op.add_column('assets', sa.Column('scan_version', sa.String(50), nullable=True))
    op.add_column('assets', sa.Column('latest_profile_score', sa.Float(), nullable=True))
    op.add_column('assets', sa.Column('latest_quality_status', sa.String(20), nullable=True))
    op.add_column('assets', sa.Column('is_critical_data_element', sa.Boolean(),
                                     nullable=False, server_default=sa.text('false')))
    op.add_column('assets', sa.Column('attached_rule_count', sa.Integer(),
                                     nullable=False, server_default=sa.text('0')))

    # 2. Extend asset_source_meta
    op.add_column('asset_source_meta', sa.Column('partition_info', VARIANT(), nullable=True))
    op.add_column('asset_source_meta', sa.Column('last_modified_at', sa.DateTime(), nullable=True))
    op.add_column('asset_source_meta', sa.Column('table_created_at', sa.DateTime(), nullable=True))

    # 3. Extend column_metadata
    op.add_column('column_metadata', sa.Column('precision', sa.Integer(), nullable=True))
    op.add_column('column_metadata', sa.Column('scale', sa.Integer(), nullable=True))
    op.add_column('column_metadata', sa.Column('character_max_length', sa.Integer(), nullable=True))
    op.add_column('column_metadata', sa.Column('default_value', sa.Text(), nullable=True))
    op.add_column('column_metadata', sa.Column('is_partition_key', sa.Boolean(),
                                               nullable=False, server_default=sa.text('false')))
    op.add_column('column_metadata', sa.Column('partition_key_index', sa.Integer(), nullable=True))

    # 4. Create asset_metadata_snapshots
    op.create_table(
        'asset_metadata_snapshots',
        sa.Column('snapshot_id', sa.String(36), primary_key=True),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('scan_version', sa.String(50), nullable=True),
        sa.Column('scan_status', sa.String(20), nullable=True),
        sa.Column('scan_duration_ms', sa.Integer(), nullable=True),
        sa.Column('row_count', sa.BigInteger(), nullable=True),
        sa.Column('bytes', sa.BigInteger(), nullable=True),
        sa.Column('last_modified_at', sa.DateTime(), nullable=True),
        sa.Column('column_count', sa.Integer(), nullable=True),
        sa.Column('schema_hash', sa.String(64), nullable=True),
        sa.Column('latest_profile_score', sa.Float(), nullable=True),
        sa.Column('latest_quality_status', sa.String(20), nullable=True),
        sa.Column('attached_rule_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('asset_id', 'snapshot_date', name='uq_ams_asset_date'),
    )
    op.create_index('ix_ams_asset_date', 'asset_metadata_snapshots',
                    ['asset_id', 'snapshot_date'])

    # 5. Backfill attached_rule_count from existing active rules
    op.execute(sa.text("""
        UPDATE assets
        SET attached_rule_count = (
            SELECT COUNT(*) FROM dq_rules
            WHERE dq_rules.asset_id = assets.asset_id
            AND dq_rules.is_active = TRUE
        )
    """))


def downgrade() -> None:
    op.drop_table('asset_metadata_snapshots')
    for col in ['last_modified_at', 'table_created_at', 'partition_info']:
        op.drop_column('asset_source_meta', col)
    for col in ['partition_key_index', 'is_partition_key', 'default_value',
                'character_max_length', 'scale', 'precision']:
        op.drop_column('column_metadata', col)
    for col in ['attached_rule_count', 'is_critical_data_element', 'latest_quality_status',
                'latest_profile_score', 'scan_version', 'scan_duration_ms',
                'scan_status', 'last_scanned_at']:
        op.drop_column('assets', col)
