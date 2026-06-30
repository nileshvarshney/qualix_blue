"""auto-rule naming: strip trailing [TABLE_NAME] suffix from existing rule_name values"""

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("dq_rules", "rule_versions"):
        op.execute(
            f"UPDATE {table} "
            r"SET rule_name = REGEXP_REPLACE(rule_name, ' \\[[^\\]]+\\]$', '') "
            "WHERE rule_name LIKE 'Auto: %[%]'"
        )


def downgrade() -> None:
    pass
