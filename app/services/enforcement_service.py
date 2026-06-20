from __future__ import annotations

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

logger = logging.getLogger("dq_platform.enforcement")


async def check_asset_enforcement(asset, db: AsyncSession) -> dict:
    """
    Check active high/critical policies against in-memory asset state.
    Call BEFORE db.commit() so the write can be rejected without side effects.
    """
    from app.db.models import GovernancePolicy, DQRule

    policy_res = await db.execute(
        select(GovernancePolicy).where(
            GovernancePolicy.is_active == True,
            GovernancePolicy.status == "active",
        )
    )
    policies = policy_res.scalars().all()

    if not policies:
        return {"blocked": False, "blocking_violations": [], "warnings": []}

    needs_rule_count = any(p.policy_type == "no_rules_defined" for p in policies)
    if needs_rule_count:
        rule_count_res = await db.execute(
            select(func.count()).where(
                DQRule.asset_id == asset.asset_id,
                DQRule.is_active == True,
            )
        )
        rule_count = rule_count_res.scalar_one()
    else:
        rule_count = 0

    blocking: list[str] = []
    warnings: list[str] = []

    for p in policies:
        violated = False
        if p.policy_type == "owner_required" and not getattr(asset, "owner_email", None):
            violated = True
        elif p.policy_type == "stale_description" and not getattr(asset, "table_description", None):
            violated = True
        elif p.policy_type == "certification_required" and getattr(asset, "certification_status", "uncertified") == "uncertified":
            violated = True
        elif p.policy_type == "no_rules_defined" and rule_count == 0:
            violated = True

        if violated:
            msg = f"{p.policy_name} (severity: {p.severity})"
            if p.severity in ("high", "critical"):
                blocking.append(msg)
            else:
                warnings.append(msg)

    return {"blocked": bool(blocking), "blocking_violations": blocking, "warnings": warnings}


async def check_rule_count_enforcement(asset_id: str, db: AsyncSession, delta: int = 0) -> dict:
    """
    Check no_rules_defined policy after a rule count change.
    delta=-1 when deleting a rule, +1 when adding one.
    """
    from app.db.models import GovernancePolicy, DQRule

    policy_res = await db.execute(
        select(GovernancePolicy).where(
            GovernancePolicy.is_active == True,
            GovernancePolicy.status == "active",
            GovernancePolicy.policy_type == "no_rules_defined",
        )
    )
    policies = policy_res.scalars().all()
    if not policies:
        return {"blocked": False, "blocking_violations": [], "warnings": []}

    count_res = await db.execute(
        select(func.count()).where(
            DQRule.asset_id == asset_id,
            DQRule.is_active == True,
        )
    )
    current_count = count_res.scalar_one()
    projected_count = current_count + delta

    blocking: list[str] = []
    warnings: list[str] = []

    for p in policies:
        if projected_count == 0:
            msg = f"{p.policy_name} (severity: {p.severity})"
            if p.severity in ("high", "critical"):
                blocking.append(msg)
            else:
                warnings.append(msg)

    return {"blocked": bool(blocking), "blocking_violations": blocking, "warnings": warnings}
