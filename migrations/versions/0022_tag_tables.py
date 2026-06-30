"""tagging system: add tags, asset_tags, custom_attributes tables (fixes missing migration for pre-existing models)"""

from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("tag_id", sa.String(36), primary_key=True),
        sa.Column("tag_name", sa.String(100), nullable=False, unique=True),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6366f1"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "asset_tags",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tag_id", sa.String(36), sa.ForeignKey("tags.tag_id"), nullable=False),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=False),
        sa.Column("created_by", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tag_id", "entity_type", "entity_id", name="uq_asset_tag"),
    )
    op.create_index("ix_asset_tags_entity", "asset_tags", ["entity_type", "entity_id"])

    op.create_table(
        "custom_attributes",
        sa.Column("attr_id", sa.String(36), primary_key=True),
        sa.Column("attr_key", sa.String(100), nullable=False),
        sa.Column("attr_value", sa.Text(), nullable=True),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", sa.String(36), nullable=False),
        sa.Column("updated_by", sa.String(200), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("attr_key", "entity_type", "entity_id", name="uq_custom_attr"),
    )
    op.create_index("ix_custom_attributes_entity", "custom_attributes", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_index("ix_custom_attributes_entity", table_name="custom_attributes")
    op.drop_table("custom_attributes")
    op.drop_index("ix_asset_tags_entity", table_name="asset_tags")
    op.drop_table("asset_tags")
    op.drop_table("tags")
