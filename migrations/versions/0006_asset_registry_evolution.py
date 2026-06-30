"""Asset Registry evolution: add hierarchy fields, status enum, stable IDs

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-07
"""
from __future__ import annotations
from datetime import datetime
import uuid

from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None

_REGISTRY_NS = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')


def _sid(path: str) -> str:
    return str(uuid.uuid5(_REGISTRY_NS, path))


def upgrade() -> None:
    # ── Phase 1: make domain_id / subdomain_id nullable for hierarchy assets ─
    op.alter_column('data_assets', 'domain_id',
                    existing_type=sa.String(36), nullable=True)
    op.alter_column('data_assets', 'subdomain_id',
                    existing_type=sa.String(36), nullable=True)

    # ── Phase 2: add new columns ─────────────────────────────────────────────
    op.add_column('data_assets',
        sa.Column('parent_asset_id', sa.String(36), nullable=True))
    op.add_column('data_assets',
        sa.Column('asset_type', sa.String(50), server_default='table', nullable=False))
    op.add_column('data_assets',
        sa.Column('physical_name', sa.String(500), nullable=True))
    op.add_column('data_assets',
        sa.Column('display_name', sa.String(500), nullable=True))
    op.add_column('data_assets',
        sa.Column('qualified_name', sa.String(2000), nullable=True))
    op.add_column('data_assets',
        sa.Column('path', sa.String(2000), nullable=True))
    op.add_column('data_assets',
        sa.Column('status', sa.String(50), server_default='active', nullable=False))
    op.add_column('data_assets',
        sa.Column('owner_user_id', sa.String(36), nullable=True))
    op.add_column('data_assets',
        sa.Column('owner_team_id', sa.String(36), nullable=True))
    op.add_column('data_assets',
        sa.Column('steward_user_id', sa.String(36), nullable=True))
    op.add_column('data_assets',
        sa.Column('domain', sa.String(500), nullable=True))
    op.add_column('data_assets',
        sa.Column('sensitivity', sa.String(50), nullable=True))
    op.add_column('data_assets',
        sa.Column('discovered_at', sa.DateTime(), nullable=True))
    op.add_column('data_assets',
        sa.Column('last_seen_at', sa.DateTime(), nullable=True))

    op.create_index('ix_da_qualified_name', 'data_assets', ['qualified_name'])
    op.create_index('ix_da_parent_asset_id', 'data_assets', ['parent_asset_id'])
    op.create_index('ix_da_asset_type', 'data_assets', ['asset_type'])
    op.create_index('ix_da_status', 'data_assets', ['status'])

    op.create_foreign_key(
        'fk_da_parent', 'data_assets', 'data_assets',
        ['parent_asset_id'], ['asset_id'],
    )

    # ── Phase 3: backfill existing table records ──────────────────────────────
    conn = op.get_bind()
    now = datetime.utcnow()

    conn.execute(sa.text("""
        UPDATE data_assets SET
            physical_name = sf_table_name,
            display_name  = sf_table_name
        WHERE asset_type = 'table' AND sf_table_name IS NOT NULL
    """))

    conn.execute(sa.text("""
        UPDATE data_assets SET
            qualified_name = connection_id || '/' ||
                             COALESCE(sf_database_name, '') || '/' ||
                             COALESCE(sf_schema_name, '') || '/' || sf_table_name
        WHERE asset_type = 'table' AND sf_table_name IS NOT NULL
          AND qualified_name IS NULL
    """))

    conn.execute(sa.text("""
        UPDATE data_assets SET status = 'disabled'
        WHERE is_active = FALSE AND status = 'active'
    """))

    conn.execute(sa.text("""
        UPDATE data_assets SET
            discovered_at = created_at,
            last_seen_at  = updated_at
        WHERE discovered_at IS NULL
    """))

    # ── Phase 4: generate Source assets (one per connection) ─────────────────
    src_rows = conn.execute(sa.text(
        "SELECT DISTINCT connection_id FROM data_assets "
        "WHERE connection_id IS NOT NULL"
    )).fetchall()

    for (conn_id,) in src_rows:
        src_id = _sid(f"source:{conn_id}")
        existing = conn.execute(
            sa.text("SELECT 1 FROM data_assets WHERE asset_id = :id"),
            {"id": src_id}
        ).scalar()
        if not existing:
            conn.execute(sa.text("""
                INSERT INTO data_assets
                    (asset_id, asset_type, physical_name, display_name,
                     qualified_name, status, connection_id,
                     created_at, updated_at, discovered_at, last_seen_at)
                VALUES
                    (:aid, 'source', :name, :name,
                     :conn_id, 'active', :conn_id,
                     :now, :now, :now, :now)
            """), {"aid": src_id, "name": conn_id, "conn_id": conn_id, "now": now})

    # ── Phase 5: generate Database assets ────────────────────────────────────
    db_rows = conn.execute(sa.text(
        "SELECT DISTINCT connection_id, sf_database_name FROM data_assets "
        "WHERE connection_id IS NOT NULL AND sf_database_name IS NOT NULL"
    )).fetchall()

    for (conn_id, db_name) in db_rows:
        src_id = _sid(f"source:{conn_id}")
        db_id = _sid(f"database:{conn_id}:{db_name}")
        existing = conn.execute(
            sa.text("SELECT 1 FROM data_assets WHERE asset_id = :id"),
            {"id": db_id}
        ).scalar()
        if not existing:
            conn.execute(sa.text("""
                INSERT INTO data_assets
                    (asset_id, asset_type, physical_name, display_name,
                     qualified_name, status, connection_id, parent_asset_id,
                     created_at, updated_at, discovered_at, last_seen_at)
                VALUES
                    (:aid, 'database', :db_name, :db_name,
                     :conn_id || '/' || :db_name,
                     'active', :conn_id, :src_id,
                     :now, :now, :now, :now)
            """), {"aid": db_id, "db_name": db_name, "conn_id": conn_id,
                   "src_id": src_id, "now": now})

    # ── Phase 6: generate Schema assets ──────────────────────────────────────
    sch_rows = conn.execute(sa.text(
        "SELECT DISTINCT connection_id, sf_database_name, sf_schema_name "
        "FROM data_assets "
        "WHERE connection_id IS NOT NULL AND sf_database_name IS NOT NULL "
        "  AND sf_schema_name IS NOT NULL"
    )).fetchall()

    for (conn_id, db_name, sch_name) in sch_rows:
        db_id = _sid(f"database:{conn_id}:{db_name}")
        sch_id = _sid(f"schema:{conn_id}:{db_name}:{sch_name}")
        existing = conn.execute(
            sa.text("SELECT 1 FROM data_assets WHERE asset_id = :id"),
            {"id": sch_id}
        ).scalar()
        if not existing:
            conn.execute(sa.text("""
                INSERT INTO data_assets
                    (asset_id, asset_type, physical_name, display_name,
                     qualified_name, status, connection_id, parent_asset_id,
                     created_at, updated_at, discovered_at, last_seen_at)
                VALUES
                    (:aid, 'schema', :sch_name, :sch_name,
                     :conn_id || '/' || :db_name || '/' || :sch_name,
                     'active', :conn_id, :db_id,
                     :now, :now, :now, :now)
            """), {"aid": sch_id, "sch_name": sch_name, "conn_id": conn_id,
                   "db_name": db_name, "db_id": db_id, "now": now})

    # ── Phase 7: link existing table records to their schema parent ───────────
    tbl_rows = conn.execute(sa.text(
        "SELECT asset_id, connection_id, sf_database_name, sf_schema_name "
        "FROM data_assets "
        "WHERE asset_type = 'table' AND connection_id IS NOT NULL "
        "  AND sf_database_name IS NOT NULL AND sf_schema_name IS NOT NULL "
        "  AND parent_asset_id IS NULL"
    )).fetchall()

    for (asset_id, conn_id, db_name, sch_name) in tbl_rows:
        sch_id = _sid(f"schema:{conn_id}:{db_name}:{sch_name}")
        conn.execute(sa.text(
            "UPDATE data_assets SET parent_asset_id = :parent "
            "WHERE asset_id = :aid"
        ), {"parent": sch_id, "aid": asset_id})

    # ── Phase 8: create column assets from column_metadata ───────────────────
    col_rows = conn.execute(sa.text(
        "SELECT cm.col_id, cm.asset_id AS table_asset_id, cm.column_name, "
        "       da.qualified_name AS table_qn, da.connection_id "
        "FROM column_metadata cm "
        "JOIN data_assets da ON da.asset_id = cm.asset_id"
    )).fetchall()

    for (col_id, table_asset_id, col_name, table_qn, conn_id) in col_rows:
        col_asset_id = _sid(f"column:{table_asset_id}:{col_name}")
        col_qn = f"{table_qn}/{col_name}" if table_qn else col_name
        existing = conn.execute(
            sa.text("SELECT 1 FROM data_assets WHERE asset_id = :id"),
            {"id": col_asset_id}
        ).scalar()
        if not existing:
            conn.execute(sa.text("""
                INSERT INTO data_assets
                    (asset_id, asset_type, physical_name, display_name,
                     qualified_name, status, parent_asset_id, connection_id,
                     created_at, updated_at, discovered_at, last_seen_at)
                VALUES
                    (:aid, 'column', :col_name, :col_name, :col_qn,
                     'active', :parent_id, :conn_id,
                     :now, :now, :now, :now)
            """), {"aid": col_asset_id, "col_name": col_name, "col_qn": col_qn,
                   "parent_id": table_asset_id, "conn_id": conn_id, "now": now})


def downgrade() -> None:
    # Remove generated hierarchy/column assets first (FK constraint requires this)
    op.get_bind().execute(sa.text(
        "DELETE FROM data_assets "
        "WHERE asset_type IN ('source', 'database', 'schema', 'column')"
    ))

    op.drop_constraint('fk_da_parent', 'data_assets', type_='foreignkey')
    op.drop_index('ix_da_qualified_name', 'data_assets')
    op.drop_index('ix_da_parent_asset_id', 'data_assets')
    op.drop_index('ix_da_asset_type', 'data_assets')
    op.drop_index('ix_da_status', 'data_assets')

    for col in ('parent_asset_id', 'asset_type', 'physical_name', 'display_name',
                'qualified_name', 'path', 'status', 'owner_user_id', 'owner_team_id',
                'steward_user_id', 'domain', 'sensitivity', 'discovered_at', 'last_seen_at'):
        op.drop_column('data_assets', col)

