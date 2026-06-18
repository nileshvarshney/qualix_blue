"""
Seed realistic DQ issues into the platform database.
Requires assets to already be seeded (run seed_demo_data.py first).
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal, create_tables
from app.db.models import Asset, AssetSourceMeta, DQRule, Issue, Team


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def days_ago(n: int) -> datetime:
    return (datetime.now(timezone.utc) - timedelta(days=n)).replace(tzinfo=None)


ISSUE_TEMPLATES = [
    {
        "title": "Null customer emails in CUSTOMERS table",
        "description": "23% of customer records have NULL email addresses, violating the NOT NULL constraint and breaking email campaign pipelines.",
        "issue_type": "rule_violation",
        "severity": "critical",
        "status": "in_progress",
        "table": "CUSTOMERS",
        "assigned_to": "alice@example.com",
        "created_days_ago": 5,
    },
    {
        "title": "Duplicate order IDs detected in ORDERS",
        "description": "Duplicate ORDER_ID values found in 3 records from the last ETL run. This causes double-counting in revenue reports.",
        "issue_type": "rule_violation",
        "severity": "critical",
        "status": "confirmed",
        "table": "ORDERS",
        "assigned_to": "bob@example.com",
        "created_days_ago": 3,
    },
    {
        "title": "FACT_SALES missing channel attribution",
        "description": "412 sales records added in the last 48 hours have empty CHANNEL values. Revenue attribution reports will be inaccurate.",
        "issue_type": "completeness",
        "severity": "critical",
        "status": "new",
        "table": "FACT_SALES",
        "assigned_to": None,
        "created_days_ago": 1,
    },
    {
        "title": "FACT_REVENUE stale — data older than 48 hours",
        "description": "FACT_REVENUE table has not been refreshed since 2 days ago. Real-time revenue metrics are unreliable.",
        "issue_type": "freshness",
        "severity": "high",
        "status": "blocked",
        "table": "FACT_REVENUE",
        "assigned_to": "carol@example.com",
        "created_days_ago": 4,
    },
    {
        "title": "Negative unit prices in PRODUCTS",
        "description": "14 product records have UNIT_PRICE < 0, which is invalid and causes downstream pricing errors.",
        "issue_type": "rule_violation",
        "severity": "high",
        "status": "resolved",
        "table": "PRODUCTS",
        "assigned_to": "alice@example.com",
        "created_days_ago": 10,
        "resolved_days_ago": 2,
    },
    {
        "title": "BRZ_ACCOUNTS missing industry codes",
        "description": "47 account records have no INDUSTRY value populated. Required for segmentation and reporting.",
        "issue_type": "completeness",
        "severity": "high",
        "status": "in_progress",
        "table": "BRZ_ACCOUNTS",
        "assigned_to": "david@example.com",
        "created_days_ago": 7,
    },
    {
        "title": "BRZ_OPPORTUNITIES stage value not in allowed list",
        "description": "9 opportunities have STAGE values ('TEST', 'UNKNOWN') not in the approved opportunity stage taxonomy.",
        "issue_type": "rule_violation",
        "severity": "high",
        "status": "confirmed",
        "table": "BRZ_OPPORTUNITIES",
        "assigned_to": "bob@example.com",
        "created_days_ago": 2,
    },
    {
        "title": "Unknown product IDs in ORDER_ITEMS",
        "description": "ORDER_ITEMS references 6 PRODUCT_ID values that do not exist in the PRODUCTS table. Broken referential integrity.",
        "issue_type": "ref_integrity",
        "severity": "medium",
        "status": "new",
        "table": "ORDER_ITEMS",
        "assigned_to": None,
        "created_days_ago": 1,
    },
    {
        "title": "REVENUE_DAILY totals exceed expected range",
        "description": "3 daily revenue rows report GROSS_REVENUE > $10M which exceeds any single-day historical record.",
        "issue_type": "rule_violation",
        "severity": "medium",
        "status": "closed",
        "table": "REVENUE_DAILY",
        "assigned_to": "carol@example.com",
        "created_days_ago": 20,
        "closed_days_ago": 5,
    },
    {
        "title": "BRZ_CONTACTS missing phone numbers",
        "description": "18% of contact records have NULL PHONE values, blocking outbound call routing.",
        "issue_type": "completeness",
        "severity": "medium",
        "status": "new",
        "table": "BRZ_CONTACTS",
        "assigned_to": None,
        "created_days_ago": 3,
    },
    {
        "title": "CUSTOMER_SUMMARY row count anomaly",
        "description": "CUSTOMER_SUMMARY row count dropped 40% compared to yesterday. Likely a partial load or upstream truncation.",
        "issue_type": "volume",
        "severity": "high",
        "status": "new",
        "table": "CUSTOMER_SUMMARY",
        "assigned_to": None,
        "created_days_ago": 0,
    },
    {
        "title": "BRZ_PRODUCTS SKU format violations",
        "description": "11 product records have SKU values that fail the expected alphanumeric format (e.g., 'SKU-12345').",
        "issue_type": "format",
        "severity": "low",
        "status": "resolved",
        "table": "BRZ_PRODUCTS",
        "assigned_to": "alice@example.com",
        "created_days_ago": 15,
        "resolved_days_ago": 8,
    },
    {
        "title": "SLV_SALES_ORDERS total amount mismatch with line items",
        "description": "PO line item totals do not reconcile with SLV_SALES_ORDERS.TOTAL_AMOUNT for 9 orders.",
        "issue_type": "consistency",
        "severity": "high",
        "status": "in_progress",
        "table": "SLV_SALES_ORDERS",
        "assigned_to": "david@example.com",
        "created_days_ago": 4,
    },
    {
        "title": "CUSTOMERS duplicate email addresses",
        "description": "32 distinct email addresses appear more than once in the CUSTOMERS table, violating the unique constraint.",
        "issue_type": "uniqueness",
        "severity": "medium",
        "status": "confirmed",
        "table": "CUSTOMERS",
        "assigned_to": "bob@example.com",
        "created_days_ago": 8,
    },
    {
        "title": "FUNNEL_EVENTS negative session duration",
        "description": "14 funnel event records show SESSION_DURATION < 0 seconds, indicating a timestamp bug in the tracker.",
        "issue_type": "rule_violation",
        "severity": "high",
        "status": "reopened",
        "table": "FUNNEL_EVENTS",
        "assigned_to": "carol@example.com",
        "created_days_ago": 12,
        "reopen_count": 1,
    },
    {
        "title": "FACT_BACKLOG amounts not matching source BRZ_BACKLOG",
        "description": "Silver-layer FACT_BACKLOG total backlog amount diverges from BRZ_BACKLOG by more than $50K.",
        "issue_type": "consistency",
        "severity": "critical",
        "status": "new",
        "table": "FACT_BACKLOG",
        "assigned_to": None,
        "created_days_ago": 1,
    },
    {
        "title": "BRZ_DEFERRED_REVENUE recognition dates in past",
        "description": "23 deferred revenue records have RECOGNITION_DATE earlier than CONTRACT_START_DATE.",
        "issue_type": "rule_violation",
        "severity": "high",
        "status": "in_progress",
        "table": "BRZ_DEFERRED_REVENUE",
        "assigned_to": "alice@example.com",
        "created_days_ago": 6,
    },
    {
        "title": "PRODUCT_METRICS zero denominator in rate calculations",
        "description": "7 rows in PRODUCT_METRICS have IMPRESSIONS = 0 causing division-by-zero in downstream CTR calculations.",
        "issue_type": "rule_violation",
        "severity": "low",
        "status": "new",
        "table": "PRODUCT_METRICS",
        "assigned_to": None,
        "created_days_ago": 2,
    },
]


async def seed_issues(db: AsyncSession) -> int:
    existing = (await db.execute(select(Issue))).scalars().all()
    if existing:
        print(f"  Issues already exist ({len(existing)}) — skipping.")
        return 0

    # Build asset map: sf_table_name → asset (via AssetSourceMeta join)
    rows = (await db.execute(
        select(Asset, AssetSourceMeta)
        .outerjoin(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
    )).all()
    asset_map: dict[str, Asset] = {}
    for asset, meta in rows:
        table_name = meta.sf_table_name if meta else None
        if table_name and table_name not in asset_map:
            asset_map[table_name] = asset

    if not asset_map:
        print("  No assets with source metadata found — run seed_demo_data.py first.")
        return 0

    print(f"  Found {len(asset_map)} tables in asset registry.")

    # Load first rule per asset
    rules = (await db.execute(select(DQRule))).scalars().all()
    rule_map: dict[str, Optional[DQRule]] = {}
    for r in rules:
        if r.asset_id and r.asset_id not in rule_map:
            rule_map[r.asset_id] = r

    # Load first team for bulk assignment
    team_result = (await db.execute(select(Team).limit(1))).scalar_one_or_none()
    team_id = team_result.team_id if team_result else None

    inserted = 0
    skipped = 0
    for tmpl in ISSUE_TEMPLATES:
        table = tmpl["table"]
        asset = asset_map.get(table)
        if not asset:
            skipped += 1
            continue

        rule = rule_map.get(asset.asset_id)
        created_at = days_ago(tmpl.get("created_days_ago", 3))
        resolved_at = None
        closed_at = None

        if "resolved_days_ago" in tmpl:
            resolved_at = days_ago(tmpl["resolved_days_ago"])
        if "closed_days_ago" in tmpl:
            closed_at = days_ago(tmpl["closed_days_ago"])

        issue = Issue(
            issue_id=str(uuid.uuid4()),
            title=tmpl["title"],
            description=tmpl["description"],
            issue_type=tmpl["issue_type"],
            status=tmpl["status"],
            severity=tmpl["severity"],
            domain_id=asset.domain_id,
            subdomain_id=asset.subdomain_id,
            asset_id=asset.asset_id,
            source_id=asset.connection_id,
            rule_id=rule.rule_id if rule else None,
            assigned_team_id=team_id,
            assigned_to=tmpl.get("assigned_to"),
            created_by="admin@example.com",
            created_at=created_at,
            updated_at=created_at,
            resolved_at=resolved_at,
            closed_at=closed_at,
            reopen_count=tmpl.get("reopen_count", 0),
        )
        db.add(issue)
        inserted += 1

    await db.flush()
    if skipped:
        print(f"  Skipped {skipped} issues (table not found in asset registry).")
    print(f"  Seeded {inserted} issues.")
    return inserted


async def main():
    await asyncio.to_thread(create_tables)

    async with AsyncSessionLocal() as db:
        print("\n── Seeding Issues ──")
        await seed_issues(db)
        await db.commit()
        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
