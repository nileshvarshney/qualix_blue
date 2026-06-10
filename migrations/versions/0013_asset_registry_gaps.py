"""Asset Registry Phase 1 gaps: generic source meta fields, hierarchy indexes.

Revision ID: 0013
Revises: 0012
Create Date: 2026-06-10
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add provider-agnostic fields to asset_source_meta
    op.add_column("asset_source_meta",
        sa.Column("generic_database_name", sa.String(200), nullable=True))
    op.add_column("asset_source_meta",
        sa.Column("generic_schema_name", sa.String(200), nullable=True))
    op.add_column("asset_source_meta",
        sa.Column("generic_object_name", sa.String(200), nullable=True))
    op.add_column("asset_source_meta",
        sa.Column("generic_object_type", sa.String(50), nullable=True))

    # 2. Backfill from sf_* for existing Snowflake rows
    op.execute(sa.text("""
        UPDATE asset_source_meta
        SET generic_database_name = sf_database_name,
            generic_schema_name   = sf_schema_name,
            generic_object_name   = sf_table_name,
            generic_object_type   = sf_table_type
        WHERE provider = 'snowflake'
          AND sf_table_name IS NOT NULL
    """))

    # 3. Add indexes on assets table
    # NOTE: Migration 0006 created ix_da_* indexes on data_assets (renamed to assets in 0008).
    # Those index names remain in the DB catalog. Use ix_assets_* prefix to avoid collisions.
    op.create_index("ix_assets_parent_asset_id",        "assets", ["parent_asset_id"])
    op.create_index("ix_assets_connection_asset_type",  "assets", ["connection_id", "asset_type"])
    op.create_index("ix_assets_qualified_name",         "assets", ["qualified_name"])
    op.create_index("ix_assets_status",                 "assets", ["status"])


def downgrade() -> None:
    op.drop_index("ix_assets_status",                "assets")
    op.drop_index("ix_assets_qualified_name",        "assets")
    op.drop_index("ix_assets_connection_asset_type", "assets")
    op.drop_index("ix_assets_parent_asset_id",       "assets")
    for col in ["generic_object_type", "generic_object_name",
                "generic_schema_name", "generic_database_name"]:
        op.drop_column("asset_source_meta", col)
