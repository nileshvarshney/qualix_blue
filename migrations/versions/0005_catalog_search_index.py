"""Catalog search index materialized view + saved_searches table

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-15
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE MATERIALIZED VIEW catalog_search_index AS
        SELECT
            'asset'           AS entity_type,
            da.asset_id       AS entity_id,
            da.sf_table_name  AS title,
            d.domain_name     AS domain,
            da.table_description AS description,
            da.owner_name     AS owner,
            da.criticality    AS tags,
            da.certification_status,
            da.domain_id,
            to_tsvector('english',
                coalesce(da.sf_table_name,'')     || ' ' ||
                coalesce(da.sf_schema_name,'')    || ' ' ||
                coalesce(da.table_description,'') || ' ' ||
                coalesce(d.domain_name,'')        || ' ' ||
                coalesce(da.owner_name,'')        || ' ' ||
                coalesce(da.owner_email,'')
            ) AS search_vector
        FROM data_assets da
        LEFT JOIN domains d ON da.domain_id = d.domain_id
        WHERE da.is_active = true
        UNION ALL
        SELECT
            'glossary', term_id, term_name, '', definition, owner_email,
            synonyms, 'active', domain_id,
            to_tsvector('english',
                coalesce(term_name,'') || ' ' ||
                coalesce(definition,'') || ' ' ||
                coalesce(synonyms,'') || ' ' ||
                coalesce(owner_email,'')
            )
        FROM glossary_terms WHERE status = 'active'
        UNION ALL
        SELECT
            'data_product', product_id, product_name, '', description,
            owner_email, tags, status, domain_id,
            to_tsvector('english',
                coalesce(product_name,'') || ' ' ||
                coalesce(description,'') || ' ' ||
                coalesce(tags,'') || ' ' ||
                coalesce(owner_email,'')
            )
        FROM data_products WHERE status != 'deprecated'
    """)

    op.execute("""
        CREATE UNIQUE INDEX ix_catalog_search_pk
        ON catalog_search_index(entity_type, entity_id)
    """)
    op.execute("""
        CREATE INDEX ix_catalog_search_fts
        ON catalog_search_index USING GIN(search_vector)
    """)

    op.create_table(
        'saved_searches',
        sa.Column('search_id',  sa.String(36),  nullable=False),
        sa.Column('user_email', sa.String(200), nullable=False),
        sa.Column('name',       sa.String(200), nullable=False),
        sa.Column('query',      sa.String(500), nullable=True),
        sa.Column('filters',    sa.JSON(),       nullable=True),
        sa.Column('created_at', sa.DateTime(),  nullable=False,
                  server_default=sa.text('NOW()')),
        sa.PrimaryKeyConstraint('search_id'),
    )
    op.create_index('ix_saved_searches_user', 'saved_searches', ['user_email'])


def downgrade() -> None:
    op.drop_index('ix_saved_searches_user', table_name='saved_searches')
    op.drop_table('saved_searches')
    op.execute('DROP MATERIALIZED VIEW IF EXISTS catalog_search_index CASCADE')
