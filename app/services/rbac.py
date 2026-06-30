from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import ROLE_PERMISSIONS
from app.db.models import UserRole, TeamMembership, TeamRole


async def get_user_effective_roles(
    user_id: str,
    primary_role: str,
    db: AsyncSession,
) -> set[str]:
    """
    Return all roles that apply to a user: primary role + extra rows in user_roles
    + roles inherited via team membership.
    """
    roles: set[str] = {primary_role} if primary_role else set()

    # Direct extra roles
    result = await db.execute(
        select(UserRole).where(UserRole.user_id == user_id)
    )
    for ur in result.scalars().all():
        roles.add(ur.role)

    # Team-inherited roles
    memberships = await db.execute(
        select(TeamMembership).where(TeamMembership.user_id == user_id)
    )
    team_ids = [m.team_id for m in memberships.scalars().all()]
    if team_ids:
        team_role_rows = await db.execute(
            select(TeamRole).where(TeamRole.team_id.in_(team_ids))
        )
        for tr in team_role_rows.scalars().all():
            roles.add(tr.role)

    return roles


def get_effective_permissions(roles: "Iterable[str]") -> set[str]:
    """Return the union of all permissions granted by the given roles."""
    permissions: set[str] = set()
    for role in roles:
        permissions |= ROLE_PERMISSIONS.get(role, set())
    return permissions
