"""
Seed full demo dataset into the platform database:
  1. Domains + subdomains + users + compliance frameworks (via existing seed.py)
  2. A SnowflakeConnection (Supply Chain source)
  3. 12 DataAssets — one per table in the supply chain schema
  4. 80 DQRules from frontend/data/rules.json
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal, create_tables
from app.db.models import (
    DataAsset, Domain, DQRule, SnowflakeConnection, Subdomain,
)
from app.db.seed import seed as base_seed


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Table → (domain, subdomain) mapping ──────────────────────────────────────
TABLE_DOMAIN_MAP: dict[str, tuple[str, str]] = {
    "CUSTOMERS":            ("Revenue",    "Sales"),
    "SALES_ORDERS":         ("Revenue",    "Sales"),
    "RETURNS":              ("Revenue",    "Sales"),
    "FINANCE_TRANSACTIONS": ("Finance",    "General Ledger"),
    "PURCHASE_ORDERS":      ("Operations", "Supply Chain"),
    "PURCHASE_ORDER_ITEMS": ("Operations", "Supply Chain"),
    "CARRIERS":             ("Operations", "Logistics"),
    "SUPPLIERS":            ("Operations", "Supply Chain"),
    "WAREHOUSES":           ("Operations", "Fulfillment"),
    "INVENTORY":            ("Operations", "Inventory"),
    "PRODUCTS":             ("Others",     "Product"),
    "PRODUCT_CATEGORIES":   ("Others",     "Product"),
}

TABLE_CRITICALITY: dict[str, str] = {
    "CUSTOMERS":            "high",
    "SALES_ORDERS":         "high",
    "FINANCE_TRANSACTIONS": "critical",
    "PURCHASE_ORDERS":      "high",
    "INVENTORY":            "high",
    "PRODUCTS":             "medium",
    "PRODUCT_CATEGORIES":   "low",
    "CARRIERS":             "medium",
    "SUPPLIERS":            "medium",
    "WAREHOUSES":           "medium",
    "PURCHASE_ORDER_ITEMS": "medium",
    "RETURNS":              "medium",
}

TABLE_DESCRIPTION: dict[str, str] = {
    "CUSTOMERS":            "Master customer records including contact info, segment, and account status",
    "SALES_ORDERS":         "All sales orders with line items, statuses, and fulfilment details",
    "RETURNS":              "Product return transactions with reason codes and refund amounts",
    "FINANCE_TRANSACTIONS": "General ledger and financial transaction records for SOX compliance",
    "PURCHASE_ORDERS":      "Procurement purchase orders issued to suppliers",
    "PURCHASE_ORDER_ITEMS": "Line-item detail for each purchase order",
    "CARRIERS":             "Shipping carrier master data including rates and service levels",
    "SUPPLIERS":            "Supplier master data including contact, terms, and performance ratings",
    "WAREHOUSES":           "Warehouse locations, capacity, and operational metadata",
    "INVENTORY":            "Current and historical inventory positions per SKU and location",
    "PRODUCTS":             "Product catalogue including SKU, category, pricing, and attributes",
    "PRODUCT_CATEGORIES":   "Product category hierarchy used for merchandising and reporting",
}


async def seed_connection(db: AsyncSession) -> SnowflakeConnection:
    existing = (await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_name == "Supply Chain DB")
    )).scalar_one_or_none()
    if existing:
        print("  Connection already exists — skipping.")
        return existing

    conn = SnowflakeConnection(
        connection_id=str(uuid.uuid4()),
        connection_name="Supply Chain DB",
        database_type="snowflake",
        account="zfuftbi-keb04862",
        sf_user="nilesh",
        warehouse="COMPUTE_WH",
        role="ACCOUNTADMIN",
        default_database="SUPPLYCHAIN_DB",
        default_schema="SUPPLYCHAIN",
        description="Primary supply chain Snowflake database used for DQ monitoring",
        is_active=True,
        connection_type="named",
        is_primary_target=True,
        last_test_status="success",
        created_at=now(),
        updated_at=now(),
    )
    db.add(conn)
    await db.flush()
    print(f"  Created connection: {conn.connection_name} ({conn.connection_id})")
    return conn


async def seed_assets(
    db: AsyncSession,
    connection: SnowflakeConnection,
    domain_map: dict[str, Domain],
    subdomain_map: dict[tuple[str, str], Subdomain],
) -> dict[str, DataAsset]:
    asset_map: dict[str, DataAsset] = {}

    for table_name, (domain_name, sub_name) in TABLE_DOMAIN_MAP.items():
        existing = (await db.execute(
            select(DataAsset).where(DataAsset.sf_table_name == table_name)
        )).scalar_one_or_none()
        if existing:
            asset_map[table_name] = existing
            continue

        domain = domain_map[domain_name]
        subdomain = subdomain_map[(domain_name, sub_name)]

        asset = DataAsset(
            asset_id=str(uuid.uuid4()),
            domain_id=domain.domain_id,
            subdomain_id=subdomain.subdomain_id,
            connection_id=connection.connection_id,
            snowflake_account=connection.account,
            sf_database_name="SUPPLYCHAIN_DB",
            sf_schema_name="SUPPLYCHAIN",
            sf_table_name=table_name,
            table_type="TABLE",
            table_description=TABLE_DESCRIPTION.get(table_name, ""),
            criticality=TABLE_CRITICALITY.get(table_name, "medium"),
            certification_status="certified",
            certified_by="data.owner@example.com",
            owner_name=f"{domain_name} Team",
            owner_email=f"{domain_name.lower()}@example.com",
            is_active=True,
            created_at=now(),
            updated_at=now(),
        )
        db.add(asset)
        asset_map[table_name] = asset

    await db.flush()
    print(f"  Seeded {len(asset_map)} data assets.")
    return asset_map


async def seed_rules(
    db: AsyncSession,
    asset_map: dict[str, DataAsset],
    domain_map: dict[str, Domain],
    subdomain_map: dict[tuple[str, str], Subdomain],
) -> int:
    rules_path = Path(__file__).parent.parent / "frontend" / "data" / "rules.json"
    raw_rules: list[dict] = json.loads(rules_path.read_text())

    # Check how many already exist
    existing_count = (await db.execute(
        select(DQRule)
    )).scalars().all()
    if existing_count:
        print(f"  Rules already exist ({len(existing_count)}) — skipping.")
        return 0

    inserted = 0
    skipped = 0
    for r in raw_rules:
        table = r.get("tableName", "")
        asset = asset_map.get(table)
        if not asset:
            skipped += 1
            continue

        domain_name, sub_name = TABLE_DOMAIN_MAP[table]
        domain = domain_map[domain_name]
        subdomain = subdomain_map[(domain_name, sub_name)]

        rule = DQRule(
            rule_id=str(uuid.uuid4()),
            rule_name=r["name"],
            rule_description=r.get("description", ""),
            domain_id=domain.domain_id,
            subdomain_id=subdomain.subdomain_id,
            asset_id=asset.asset_id,
            rule_type=r.get("type", "custom_sql_check"),
            rule_category=r.get("category"),
            target_column=r.get("columnName"),
            rule_config=r.get("parameters") or {},
            severity=r.get("severity", "medium"),
            status=r.get("status", "active"),
            is_active=r.get("enabled", True),
            created_by="admin@example.com",
            created_at=now(),
            updated_at=now(),
        )
        db.add(rule)
        await db.flush()  # flush one at a time — Snowflake rejects multi-row executemany
        inserted += 1
        if inserted % 10 == 0:
            print(f"    {inserted}/{len(raw_rules)} rules inserted...")

    print(f"  Seeded {inserted} rules ({skipped} skipped — unknown table).")
    return inserted


async def main():
    await asyncio.to_thread(create_tables)

    async with AsyncSessionLocal() as db:
        print("\n── Step 1: Base seed (domains, subdomains, users, compliance) ──")
        await base_seed(db)

        print("\n── Step 2: Load domain/subdomain maps ──")
        domains = (await db.execute(select(Domain))).scalars().all()
        domain_map = {d.domain_name: d for d in domains}

        subdomains = (await db.execute(select(Subdomain))).scalars().all()
        subdomain_map = {(d.domain_name, s.subdomain_name): s
                         for d in domains
                         for s in subdomains
                         if s.domain_id == d.domain_id}

        print(f"  Loaded {len(domain_map)} domains, {len(subdomains)} subdomains.")

        print("\n── Step 3: Snowflake connection ──")
        connection = await seed_connection(db)

        print("\n── Step 4: Data assets (12 supply chain tables) ──")
        asset_map = await seed_assets(db, connection, domain_map, subdomain_map)

        print("\n── Step 5: DQ Rules (80 rules from frontend/data/rules.json) ──")
        await seed_rules(db, asset_map, domain_map, subdomain_map)

        await db.commit()
        print("\nDemo data seeding complete.")


if __name__ == "__main__":
    asyncio.run(main())
