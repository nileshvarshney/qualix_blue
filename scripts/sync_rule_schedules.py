"""
Ensure every active DQRule is included in its asset's table-level schedule.

Run from the project root:
    python scripts/sync_rule_schedules.py

Safe to re-run — only adds rules that are missing from their table schedule.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.db.database import AsyncSessionLocal
from app.db.models import DQRule
from app.services.scheduler_service import ensure_table_schedule


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(DQRule).where(DQRule.is_active == True))
        rules = result.scalars().all()
        print(f"Found {len(rules)} active rule(s)")
        for rule in rules:
            await ensure_table_schedule(rule, db)
        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
