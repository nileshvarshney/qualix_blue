"""Seed sample DataContracts linked to existing assets."""
from __future__ import annotations
import asyncio
import uuid
from datetime import datetime, timezone, date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal, create_tables
from app.db.models import DataContract, Asset


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


SAMPLE_CONTRACTS = [
    {
        "asset_table": "CUSTOMER_SUMMARY",
        "contract_name": "Customer Summary → Marketing Analytics",
        "producer_team": "Data Engineering",
        "consumer_team": "Marketing Analytics",
        "status": "active",
        "min_quality_score": 95.0,
        "sla_description": "99.9% uptime, refreshed daily by 6 AM UTC",
        "breach_action": "alert_on_call",
        "created_by": "alice@company.com",
    },
    {
        "asset_table": "REVENUE_DAILY",
        "contract_name": "Revenue Daily → Finance Reporting",
        "producer_team": "Revenue Ops",
        "consumer_team": "Finance",
        "status": "violated",
        "min_quality_score": 99.0,
        "sla_description": "99.9% accuracy, no nulls in amount columns",
        "breach_action": "block_downstream",
        "created_by": "bob@company.com",
    },
    {
        "asset_table": "ORDERS",
        "contract_name": "Orders → Supply Chain Planning",
        "producer_team": "Commerce Engineering",
        "consumer_team": "Supply Chain",
        "status": "active",
        "min_quality_score": 97.0,
        "sla_description": "98% completeness, < 1 hr latency",
        "breach_action": "alert_slack",
        "created_by": "carol@company.com",
    },
    {
        "asset_table": "CUSTOMERS",
        "contract_name": "Customers → CRM Sync",
        "producer_team": "Platform Team",
        "consumer_team": "Sales Ops",
        "status": "active",
        "min_quality_score": 95.0,
        "sla_description": "PII masked, refreshed every 4 hours",
        "breach_action": "alert_on_call",
        "created_by": "dave@company.com",
    },
    {
        "asset_table": "PRODUCT_METRICS",
        "contract_name": "Product Metrics → Executive Dashboard",
        "producer_team": "Analytics Engineering",
        "consumer_team": "Product Leadership",
        "status": "active",
        "min_quality_score": 90.0,
        "sla_description": "99% uptime, daily refresh by 8 AM UTC",
        "breach_action": "alert_slack",
        "created_by": "eve@company.com",
    },
    {
        "asset_table": "FUNNEL_EVENTS",
        "contract_name": "Funnel Events → Growth Analytics",
        "producer_team": "Event Tracking",
        "consumer_team": "Growth",
        "status": "violated",
        "min_quality_score": 92.0,
        "sla_description": "< 5% event drop rate, 30-min streaming SLA",
        "breach_action": "alert_on_call",
        "created_by": "frank@company.com",
    },
    {
        "asset_table": "ORDER_ITEMS",
        "contract_name": "Order Items → Revenue Recognition",
        "producer_team": "Commerce Engineering",
        "consumer_team": "Finance",
        "status": "active",
        "min_quality_score": 99.5,
        "sla_description": "100% completeness required for revenue close",
        "breach_action": "block_downstream",
        "created_by": "grace@company.com",
    },
    {
        "asset_table": "PRODUCTS",
        "contract_name": "Products Catalog → Storefront",
        "producer_team": "Catalog Team",
        "consumer_team": "E-Commerce",
        "status": "active",
        "min_quality_score": 98.0,
        "sla_description": "No missing SKUs, refreshed within 15 min of change",
        "breach_action": "alert_slack",
        "created_by": "henry@company.com",
    },
]


async def seed_contracts() -> None:
    create_tables()  # synchronous

    async with AsyncSessionLocal() as db:
        # Load existing assets by table name
        result = await db.execute(select(Asset))
        assets = result.scalars().all()
        asset_by_table: dict[str, Asset] = {}
        for a in assets:
            # Asset has source_meta via association proxy — use direct query
            pass

        # Use assets_compat or direct meta join
        from app.db.models import AssetSourceMeta
        meta_result = await db.execute(select(AssetSourceMeta))
        metas = meta_result.scalars().all()
        meta_by_asset: dict[str, str] = {m.asset_id: m.sf_table_name or "" for m in metas}

        asset_by_table = {}
        for a in assets:
            tname = meta_by_asset.get(a.asset_id, "")
            if tname:
                asset_by_table[tname] = a

        print(f"Found {len(assets)} assets, {len(asset_by_table)} with table metadata")

        created = 0
        for spec in SAMPLE_CONTRACTS:
            target_table = spec["asset_table"]
            asset = asset_by_table.get(target_table)
            if not asset:
                # Try partial match
                for tname, a in asset_by_table.items():
                    if target_table in tname or tname in target_table:
                        asset = a
                        break
            if not asset:
                print(f"  SKIP: no asset found for table '{target_table}'")
                continue

            # Check if contract already exists
            existing = await db.execute(
                select(DataContract).where(
                    DataContract.asset_id == asset.asset_id,
                    DataContract.contract_name == spec["contract_name"],
                )
            )
            if existing.scalar_one_or_none():
                print(f"  EXISTS: {spec['contract_name']}")
                continue

            contract = DataContract(
                contract_id=str(uuid.uuid4()),
                asset_id=asset.asset_id,
                contract_name=spec["contract_name"],
                version="1.0",
                producer_team=spec["producer_team"],
                consumer_team=spec["consumer_team"],
                status=spec["status"],
                min_quality_score=spec["min_quality_score"],
                max_staleness_hours=24,
                sla_description=spec["sla_description"],
                breach_action=spec["breach_action"],
                effective_from=date(2024, 1, 1),
                effective_until=date(2026, 12, 31),
                created_by=spec["created_by"],
                created_at=now(),
                updated_at=now(),
            )
            db.add(contract)
            created += 1
            print(f"  CREATE: {spec['contract_name']} → {target_table} ({asset.asset_id[:8]}...)")

        await db.commit()
        print(f"\nDone — {created} contracts created.")


if __name__ == "__main__":
    asyncio.run(seed_contracts())
