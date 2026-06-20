"""privacy & compliance tables: add DSR, consent, residency; ensure compliance tables exist"""

from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    try:
        bind.execute(sa.text(f"SELECT 1 FROM {name} LIMIT 1"))
        return True
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "compliance_frameworks"):
        op.create_table(
            "compliance_frameworks",
            sa.Column("framework_id", sa.String(36), primary_key=True),
            sa.Column("framework_name", sa.String(100), nullable=False, unique=True),
            sa.Column("version", sa.String(20), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        )

    if not _table_exists(bind, "compliance_requirements"):
        op.create_table(
            "compliance_requirements",
            sa.Column("req_id", sa.String(36), primary_key=True),
            sa.Column("framework_id", sa.String(36), sa.ForeignKey("compliance_frameworks.framework_id"), nullable=False),
            sa.Column("req_code", sa.String(50), nullable=True),
            sa.Column("req_name", sa.String(200), nullable=True),
            sa.Column("req_description", sa.Text(), nullable=True),
            sa.Column("dq_rule_types", sa.Text(), nullable=True),
        )
        op.create_index("ix_compliance_req_framework", "compliance_requirements", ["framework_id"])

    if not _table_exists(bind, "compliance_mappings"):
        op.create_table(
            "compliance_mappings",
            sa.Column("mapping_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("framework_id", sa.String(36), sa.ForeignKey("compliance_frameworks.framework_id"), nullable=False),
            sa.Column("req_id", sa.String(36), sa.ForeignKey("compliance_requirements.req_id"), nullable=True),
            sa.Column("rule_id", sa.String(36), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="mapped"),
            sa.Column("evidence_note", sa.Text(), nullable=True),
            sa.Column("mapped_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_compliance_mapping_framework", "compliance_mappings", ["framework_id", "asset_id"])

    if not _table_exists(bind, "masking_policies"):
        op.create_table(
            "masking_policies",
            sa.Column("policy_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("column_name", sa.String(200), nullable=False),
            sa.Column("masking_type", sa.String(30), nullable=False),
            sa.Column("applies_to_roles", sa.Text(), nullable=True),
            sa.Column("unmasked_roles", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_masking_policies_asset", "masking_policies", ["asset_id"])

    if not _table_exists(bind, "data_classifications"):
        op.create_table(
            "data_classifications",
            sa.Column("classification_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("column_name", sa.String(200), nullable=True),
            sa.Column("classification", sa.String(30), nullable=False),
            sa.Column("justification", sa.Text(), nullable=True),
            sa.Column("applied_by", sa.String(200), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_data_classifications_asset", "data_classifications", ["asset_id"])

    if not _table_exists(bind, "data_subject_requests"):
        op.create_table(
            "data_subject_requests",
            sa.Column("dsr_id", sa.String(36), primary_key=True),
            sa.Column("subject_email", sa.String(200), nullable=False),
            sa.Column("request_type", sa.String(30), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("affected_tables", sa.Text(), nullable=True),
            sa.Column("assigned_to", sa.String(200), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("requested_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_dsr_status", "data_subject_requests", ["status"])
        op.create_index("ix_dsr_subject", "data_subject_requests", ["subject_email"])

    if not _table_exists(bind, "consent_records"):
        op.create_table(
            "consent_records",
            sa.Column("consent_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), nullable=True),
            sa.Column("purpose", sa.String(300), nullable=False),
            sa.Column("legal_basis", sa.String(50), nullable=False),
            sa.Column("data_subject_type", sa.String(100), nullable=True),
            sa.Column("requires_explicit_consent", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("opt_in", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("recorded_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_consent_records_asset", "consent_records", ["asset_id"])

    if not _table_exists(bind, "data_residency_policies"):
        op.create_table(
            "data_residency_policies",
            sa.Column("residency_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), nullable=True),
            sa.Column("domain_id", sa.String(36), nullable=True),
            sa.Column("allowed_regions", sa.Text(), nullable=True),
            sa.Column("prohibited_regions", sa.Text(), nullable=True),
            sa.Column("data_sovereignty_country", sa.String(100), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_residency_asset", "data_residency_policies", ["asset_id"])


def downgrade() -> None:
    bind = op.get_bind()
    for tbl, idx in [
        ("data_residency_policies", "ix_residency_asset"),
        ("consent_records", "ix_consent_records_asset"),
        ("data_classifications", "ix_data_classifications_asset"),
        ("masking_policies", "ix_masking_policies_asset"),
        ("compliance_mappings", "ix_compliance_mapping_framework"),
        ("compliance_requirements", "ix_compliance_req_framework"),
        ("compliance_frameworks", None),
    ]:
        if _table_exists(bind, tbl):
            if idx:
                try:
                    op.drop_index(idx, table_name=tbl)
                except Exception:
                    pass
            op.drop_table(tbl)

    # Handle data_subject_requests separately to drop both indexes before the table
    if _table_exists(bind, "data_subject_requests"):
        for idx in ["ix_dsr_status", "ix_dsr_subject"]:
            try:
                op.drop_index(idx, table_name="data_subject_requests")
            except Exception:
                pass
        op.drop_table("data_subject_requests")
