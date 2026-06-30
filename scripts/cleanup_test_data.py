"""
One-time cleanup script: removes the seeded test asset (revenue_dw.invoices)
and every row that references it — rules, runs, samples, alerts, quality scores,
schedules, rule versions, rule tags, and related audit log entries.

Run from the project root:
    python scripts/cleanup_test_data.py
"""
import asyncio
import sys
import os

# Allow imports from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text, bindparam
from app.db.database import AsyncSessionLocal, create_tables


# Target: the fake test asset
TARGET_SCHEMA = "revenue_dw"
TARGET_TABLE  = "invoices"


def _in(col: str, ids: list) -> text:
    """Return a text() clause for col IN (:ids) with Snowflake-compatible expanding bindparam."""
    return text(f"{col} IN :ids").bindparams(bindparam("ids", expanding=True))


async def cleanup():
    async with AsyncSessionLocal() as db:

        # ── 1. Find the asset ─────────────────────────────────────────────────
        result = await db.execute(
            text("SELECT asset_id FROM data_assets WHERE sf_schema_name = :schema AND sf_table_name = :table"),
            {"schema": TARGET_SCHEMA, "table": TARGET_TABLE},
        )
        assets = result.fetchall()

        if not assets:
            print(f"No asset found matching '{TARGET_SCHEMA}.{TARGET_TABLE}' — nothing to clean up.")
            return

        asset_ids = [row[0] for row in assets]
        print(f"Found {len(asset_ids)} asset(s): {asset_ids}")

        # ── 2. Find all rules for those assets ────────────────────────────────
        result = await db.execute(
            text("SELECT rule_id FROM dq_rules WHERE asset_id IN :ids").bindparams(bindparam("ids", expanding=True)),
            {"ids": asset_ids},
        )
        rule_ids = [row[0] for row in result.fetchall()]
        print(f"  Rules to remove: {len(rule_ids)}")

        # ── 3. Find all runs for those rules ──────────────────────────────────
        run_ids: list[str] = []
        if rule_ids:
            result = await db.execute(
                text("SELECT run_id FROM dq_rule_runs WHERE rule_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": rule_ids},
            )
            run_ids = [row[0] for row in result.fetchall()]
            print(f"  Rule runs to remove: {len(run_ids)}")

        # ── 4. Delete in FK dependency order ──────────────────────────────────

        # 4a. dq_rule_run_samples  (FK → dq_rule_runs)
        if run_ids:
            r = await db.execute(
                text("DELETE FROM dq_rule_run_samples WHERE run_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": run_ids},
            )
            print(f"  Deleted {r.rowcount} rule run sample(s)")

        # 4b. dq_alerts  (FK → dq_rule_runs, dq_rules, data_assets)
        if run_ids:
            r = await db.execute(
                text("DELETE FROM dq_alerts WHERE run_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": run_ids},
            )
            print(f"  Deleted {r.rowcount} alert(s) by run_id")

        if rule_ids:
            r = await db.execute(
                text("DELETE FROM dq_alerts WHERE rule_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": rule_ids},
            )
            print(f"  Deleted {r.rowcount} alert(s) by rule_id")

        if asset_ids:
            r = await db.execute(
                text("DELETE FROM dq_alerts WHERE asset_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": asset_ids},
            )
            print(f"  Deleted {r.rowcount} alert(s) by asset_id")

        # 4c. dq_rule_runs  (FK → dq_rules, data_assets)
        if run_ids:
            r = await db.execute(
                text("DELETE FROM dq_rule_runs WHERE run_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": run_ids},
            )
            print(f"  Deleted {r.rowcount} rule run(s)")

        # 4d. dq_quality_scores  (FK → data_assets)
        if asset_ids:
            r = await db.execute(
                text("DELETE FROM dq_quality_scores WHERE asset_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": asset_ids},
            )
            print(f"  Deleted {r.rowcount} quality score(s)")

        # 4e. rule_versions  (FK → dq_rules)
        if rule_ids:
            r = await db.execute(
                text("DELETE FROM rule_versions WHERE rule_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": rule_ids},
            )
            print(f"  Deleted {r.rowcount} rule version(s)")

        # 4f. rule_tags  (FK → dq_rules)
        if rule_ids:
            r = await db.execute(
                text("DELETE FROM rule_tags WHERE rule_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": rule_ids},
            )
            print(f"  Deleted {r.rowcount} rule tag(s)")

        # 4g. dq_schedules  (FK → dq_rules, data_assets)
        if rule_ids:
            r = await db.execute(
                text("DELETE FROM dq_schedules WHERE rule_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": rule_ids},
            )
            print(f"  Deleted {r.rowcount} schedule(s) by rule_id")

        if asset_ids:
            r = await db.execute(
                text("DELETE FROM dq_schedules WHERE asset_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": asset_ids},
            )
            print(f"  Deleted {r.rowcount} schedule(s) by asset_id")

        # 4h. sla_configs  (uses entity_type + entity_id pattern, no direct FK)
        all_entity_ids = asset_ids + rule_ids
        if all_entity_ids:
            r = await db.execute(
                text("DELETE FROM sla_configs WHERE entity_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": all_entity_ids},
            )
            print(f"  Deleted {r.rowcount} SLA config(s)")

        # 4i. audit_logs  (no FK, but entity_id references rules and assets)
        if rule_ids:
            r = await db.execute(
                text("DELETE FROM audit_logs WHERE entity_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": rule_ids},
            )
            print(f"  Deleted {r.rowcount} audit log entry(s) for rules")

        if asset_ids:
            r = await db.execute(
                text("DELETE FROM audit_logs WHERE entity_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": asset_ids},
            )
            print(f"  Deleted {r.rowcount} audit log entry(s) for asset")

        # 4j. dq_rules  (FK → data_assets)
        if rule_ids:
            r = await db.execute(
                text("DELETE FROM dq_rules WHERE rule_id IN :ids").bindparams(bindparam("ids", expanding=True)),
                {"ids": rule_ids},
            )
            print(f"  Deleted {r.rowcount} rule(s)")

        # 4k. data_assets  (the asset itself)
        r = await db.execute(
            text("DELETE FROM data_assets WHERE asset_id IN :ids").bindparams(bindparam("ids", expanding=True)),
            {"ids": asset_ids},
        )
        print(f"  Deleted {r.rowcount} asset(s)")

        await db.commit()
        print(f"\nCleanup complete. '{TARGET_SCHEMA}.{TARGET_TABLE}' and all related data removed.")


if __name__ == "__main__":
    asyncio.run(cleanup())
