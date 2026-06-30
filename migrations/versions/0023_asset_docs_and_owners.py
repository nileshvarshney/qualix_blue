"""asset registry: add asset_documents and asset_owners tables for multi-link docs and additional owners"""

from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset_documents",
        sa.Column("doc_id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("created_by", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_asset_documents_asset_id", "asset_documents", ["asset_id"])

    op.create_table(
        "asset_owners",
        sa.Column("owner_id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_type", sa.String(30), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_asset_owners_asset_id", "asset_owners", ["asset_id"])
    op.create_index("ix_asset_owners_asset_type", "asset_owners", ["asset_id", "owner_type"])


def downgrade() -> None:
    op.drop_index("ix_asset_owners_asset_type", table_name="asset_owners")
    op.drop_index("ix_asset_owners_asset_id", table_name="asset_owners")
    op.drop_table("asset_owners")
    op.drop_index("ix_asset_documents_asset_id", table_name="asset_documents")
    op.drop_table("asset_documents")
