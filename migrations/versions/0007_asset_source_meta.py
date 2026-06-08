"""Add asset_source_meta table and description column

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-07
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('data_assets', sa.Column('description', sa.Text(), nullable=True))

    op.create_table(
        'asset_source_meta',
        sa.Column('asset_id', sa.String(36), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False, server_default='snowflake'),
        sa.Column('sf_account', sa.String(200), nullable=True),
        sa.Column('sf_database_name', sa.String(200), nullable=True),
        sa.Column('sf_schema_name', sa.String(200), nullable=True),
        sa.Column('sf_table_name', sa.String(200), nullable=True),
        sa.Column('sf_table_type', sa.String(50), nullable=True),
        sa.Column('view_definition', sa.Text(), nullable=True),
        sa.Column('row_count', sa.BigInteger(), nullable=True),
        sa.Column('bytes', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('asset_id'),
        sa.ForeignKeyConstraint(
            ['asset_id'], ['data_assets.asset_id'],
            name='fk_asm_data_assets', ondelete='CASCADE'
        ),
    )
    op.create_index('ix_asm_sf_table_name', 'asset_source_meta', ['sf_table_name'])
    op.create_index('ix_asm_sf_schema_name', 'asset_source_meta', ['sf_schema_name'])

    conn = op.get_bind()
    conn.execute(sa.text("""
        INSERT INTO asset_source_meta
            (asset_id, provider, sf_account, sf_database_name, sf_schema_name,
             sf_table_name, sf_table_type, view_definition, row_count, bytes,
             created_at, updated_at)
        SELECT asset_id, 'snowflake',
               snowflake_account, sf_database_name, sf_schema_name,
               sf_table_name, table_type, view_definition, row_count, bytes,
               created_at, updated_at
        FROM data_assets
        WHERE connection_id IS NOT NULL
          AND sf_table_name IS NOT NULL
    """))

    conn.execute(sa.text("""
        UPDATE data_assets
        SET description = table_description
        WHERE table_description IS NOT NULL AND description IS NULL
    """))


def downgrade() -> None:
    op.drop_index('ix_asm_sf_table_name', 'asset_source_meta')
    op.drop_index('ix_asm_sf_schema_name', 'asset_source_meta')
    op.drop_table('asset_source_meta')
    op.drop_column('data_assets', 'description')
