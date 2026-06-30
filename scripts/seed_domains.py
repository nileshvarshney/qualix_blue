"""
Seed domains, subdomains, and bootstrap users into the platform.

Run from the project root:
    python scripts/seed_domains.py

Safe to re-run — skips domains/users that already exist.
"""
import asyncio
import sys
import os
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, func
from app.db.database import AsyncSessionLocal, create_tables
from app.db.models import Domain, Subdomain, User

DOMAINS = [
    {"domain_name": "Revenue",    "description": "Revenue and billing data quality",          "owner_name": "Revenue Team",  "owner_email": "revenue@example.com"},
    {"domain_name": "Finance",    "description": "Finance and accounting data quality",        "owner_name": "Finance Team",  "owner_email": "finance@example.com"},
    {"domain_name": "Operations", "description": "Operations and logistics data quality",      "owner_name": "Ops Team",      "owner_email": "ops@example.com"},
    {"domain_name": "Planning",   "description": "Demand and workforce planning data quality", "owner_name": "Planning Team", "owner_email": "planning@example.com"},
    {"domain_name": "GTM",        "description": "Go-to-market and marketing data quality",    "owner_name": "GTM Team",      "owner_email": "gtm@example.com"},
    {"domain_name": "HR",         "description": "Human resources data quality",               "owner_name": "HR Team",       "owner_email": "hr@example.com"},
    {"domain_name": "Others",     "description": "Miscellaneous and custom domain",            "owner_name": "Platform Team", "owner_email": "platform@example.com"},
]

SUBDOMAINS = {
    "Revenue":    ["Billing", "Sales", "Subscriptions", "Pricing", "Invoice Management"],
    "Finance":    ["General Ledger", "Accounts Payable", "Accounts Receivable", "Expenses", "Forecasting"],
    "Operations": ["Inventory", "Fulfillment", "Logistics", "Supply Chain"],
    "Planning":   ["Demand Planning", "Workforce Planning", "Capacity Planning", "Forecast Planning"],
    "GTM":        ["Leads", "Campaigns", "Marketing", "Sales Pipeline", "Customer Acquisition"],
    "HR":         ["Employees", "Payroll", "Hiring", "Attendance", "Benefits"],
    "Others":     ["Product", "Support", "Analytics", "Custom"],
}

USERS = [
    {"email": "admin@example.com",        "full_name": "Admin User",        "role": "admin",        "password": "admin123"},
    {"email": "domain.owner@example.com", "full_name": "Domain Owner",      "role": "domain_owner", "password": "domain123"},
    {"email": "data.owner@example.com",   "full_name": "Data Owner",        "role": "data_owner",   "password": "data123"},
    {"email": "viewer@example.com",       "full_name": "Viewer User",        "role": "viewer",       "password": "viewer123"},
    {"email": "auditor@example.com",      "full_name": "Auditor User",       "role": "auditor",      "password": "auditor123"},
]


async def seed(db):
    from app.core.security import hash_password
    from datetime import datetime, timezone

    # ── Domains ──────────────────────────────────────────────────────────────
    count = (await db.execute(select(func.count()).select_from(Domain))).scalar() or 0
    domain_map: dict[str, Domain] = {}

    if count == 0:
        for d in DOMAINS:
            domain = Domain(
                domain_id=str(uuid.uuid4()),
                domain_name=d["domain_name"],
                description=d["description"],
                owner_name=d["owner_name"],
                owner_email=d["owner_email"],
                is_active=True,
            )
            db.add(domain)
            domain_map[d["domain_name"]] = domain
        await db.flush()
        print(f"  Seeded {len(DOMAINS)} domains.")
    else:
        result = await db.execute(select(Domain))
        for dom in result.scalars().all():
            domain_map[dom.domain_name] = dom
        print(f"  Domains already exist ({count}) — skipped.")

    # ── Subdomains ────────────────────────────────────────────────────────────
    sub_count = (await db.execute(select(func.count()).select_from(Subdomain))).scalar() or 0
    if sub_count == 0:
        total_subs = 0
        for domain_name, subs in SUBDOMAINS.items():
            domain = domain_map.get(domain_name)
            if not domain:
                continue
            for sub_name in subs:
                db.add(Subdomain(
                    subdomain_id=str(uuid.uuid4()),
                    domain_id=domain.domain_id,
                    subdomain_name=sub_name,
                    description=f"{sub_name} subdomain",
                    is_active=True,
                ))
                total_subs += 1
        await db.flush()
        print(f"  Seeded {total_subs} subdomains.")
    else:
        print(f"  Subdomains already exist ({sub_count}) — skipped.")

    # ── Users ─────────────────────────────────────────────────────────────────
    revenue_domain_id = domain_map.get("Revenue", Domain()).domain_id if "Revenue" in domain_map else None
    users_created = 0
    for u in USERS:
        existing = (await db.execute(select(User).where(User.email == u["email"]))).scalar_one_or_none()
        if existing:
            continue
        domain_id = revenue_domain_id if u["role"] == "domain_owner" else None
        db.add(User(
            user_id=str(uuid.uuid4()),
            email=u["email"],
            full_name=u["full_name"],
            hashed_password=hash_password(u["password"]),
            role=u["role"],
            domain_id=domain_id,
            is_active=True,
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ))
        users_created += 1
    if users_created:
        await db.flush()
        print(f"  Seeded {users_created} users.")
    else:
        print(f"  Users already exist — skipped.")

    await db.commit()


async def main():
    print("Creating tables (errors for unsupported column types are non-fatal)...")
    await asyncio.to_thread(create_tables)
    print("\nSeeding domains, subdomains, and users...")
    async with AsyncSessionLocal() as db:
        await seed(db)
    print("\nDone.\n")
    print("Test credentials:")
    for u in USERS:
        print(f"  {u['role']:15s}  {u['email']:35s}  password: {u['password']}")


if __name__ == "__main__":
    asyncio.run(main())
