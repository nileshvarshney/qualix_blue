"""Rename data_assets → assets, drop Snowflake-specific columns

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-07
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None

SNOWFLAKE_COLS = [
    'snowflake_account', 'sf_database_name', 'sf_schema_name',
    'sf_table_name', 'table_type', 'table_description',
    'view_definition', 'row_count', 'bytes',
]


def upgrade() -> None:
    # PostgreSQL keeps all existing FK constraints valid after rename (tracked by OID)
    op.rename_table('data_assets', 'assets')

    for col in SNOWFLAKE_COLS:
        op.drop_column('assets', col)

    # Re-create asset_source_meta FK to reference renamed table
    op.drop_constraint('fk_asm_data_assets', 'asset_source_meta', type_='foreignkey')
    op.create_foreign_key(
        'fk_asm_asset_id', 'asset_source_meta', 'assets',
        ['asset_id'], ['asset_id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_asm_asset_id', 'asset_source_meta', type_='foreignkey')
    op.create_foreign_key(
        'fk_asm_data_assets', 'asset_source_meta', 'data_assets',
        ['asset_id'], ['asset_id'], ondelete='CASCADE'
    )
    op.rename_table('assets', 'data_assets')
    # Dropped Snowflake columns are NOT restored — data lives in asset_source_meta
