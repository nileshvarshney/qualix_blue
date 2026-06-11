from __future__ import annotations

import inspect
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import Team, TeamMembership, TeamRole, User, AuditLog
from app.core.security import get_current_user, require_admin, ROLES

router = APIRouter(prefix="/teams", tags=["Teams"])
logger = logging.getLogger("dq_platform.teams")


async def _scalar(result) -> object:
    """Return scalar_one_or_none(), awaiting the result if it is a coroutine (test mocks)."""
    raw = result.scalar_one_or_none()
    return await raw if inspect.isawaitable(raw) else raw


class TeamCreate(BaseModel):
    team_name: str
    description: Optional[str] = None


class TeamUpdate(BaseModel):
    team_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class MemberAdd(BaseModel):
    user_id: str
    role_in_team: Optional[str] = "member"


class TeamRoleAssign(BaseModel):
    role: str


def _team_dict(t: Team) -> dict:
    return {
        "team_id": t.team_id,
        "team_name": t.team_name,
        "description": t.description,
        "is_active": t.is_active,
        "created_by": t.created_by,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _membership_dict(m: TeamMembership) -> dict:
    return {
        "membership_id": m.membership_id,
        "team_id": m.team_id,
        "user_id": m.user_id,
        "role_in_team": m.role_in_team,
        "created_by": m.created_by,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.post("", status_code=201)
async def create_team(
    payload: TeamCreate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    existing = await db.execute(select(Team).where(Team.team_name == payload.team_name))
    if await _scalar(existing):
        raise HTTPException(409, f"Team '{payload.team_name}' already exists")
    team = Team(
        team_id=str(uuid.uuid4()),
        team_name=payload.team_name,
        description=payload.description,
        created_by=admin.get("email"),
    )
    db.add(team)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="CREATE",
        entity_type="team",
        entity_id=team.team_id,
        new_value={"team_name": team.team_name},
    ))
    await db.commit()
    logger.info(f"Team created: {team.team_name} by {admin.get('email')}")
    return {"team_id": team.team_id, "team_name": team.team_name}


@router.get("")
async def list_teams(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    total = (await db.execute(select(func.count()).select_from(Team))).scalar() or 0
    result = await db.execute(
        select(Team).where(Team.is_active == True)
        .order_by(Team.team_name).limit(limit).offset(offset)
    )
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [_team_dict(t) for t in result.scalars().all()],
    }


@router.get("/{team_id}")
async def get_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Team).where(Team.team_id == team_id))
    team = await _scalar(result)
    if not team:
        raise HTTPException(404, "Team not found")
    return _team_dict(team)


@router.put("/{team_id}")
async def update_team(
    team_id: str,
    payload: TeamUpdate,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(Team).where(Team.team_id == team_id))
    team = await _scalar(result)
    if not team:
        raise HTTPException(404, "Team not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(team, field, value)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="UPDATE",
        entity_type="team",
        entity_id=team_id,
        new_value=payload.model_dump(exclude_none=True),
    ))
    await db.commit()
    return _team_dict(team)


@router.delete("/{team_id}")
async def deactivate_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(select(Team).where(Team.team_id == team_id))
    team = await _scalar(result)
    if not team:
        raise HTTPException(404, "Team not found")
    team.is_active = False
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="DEACTIVATE",
        entity_type="team",
        entity_id=team_id,
    ))
    await db.commit()
    return {"message": "Team deactivated"}


@router.post("/{team_id}/members", status_code=201)
async def add_member(
    team_id: str,
    payload: MemberAdd,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    team_result = await db.execute(select(Team).where(Team.team_id == team_id))
    if not await _scalar(team_result):
        raise HTTPException(404, "Team not found")
    user_result = await db.execute(select(User).where(User.user_id == payload.user_id))
    if not await _scalar(user_result):
        raise HTTPException(404, "User not found")
    existing = await db.execute(
        select(TeamMembership).where(
            TeamMembership.team_id == team_id,
            TeamMembership.user_id == payload.user_id,
        )
    )
    if await _scalar(existing):
        raise HTTPException(409, "User is already a member of this team")
    membership = TeamMembership(
        membership_id=str(uuid.uuid4()),
        team_id=team_id,
        user_id=payload.user_id,
        role_in_team=payload.role_in_team,
        created_by=admin.get("email"),
    )
    db.add(membership)
    await db.commit()
    return {"membership_id": membership.membership_id, "team_id": team_id, "user_id": payload.user_id}


@router.get("/{team_id}/members")
async def list_members(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Team).where(Team.team_id == team_id))
    if not await _scalar(result):
        raise HTTPException(404, "Team not found")
    members = await db.execute(
        select(TeamMembership).where(TeamMembership.team_id == team_id)
    )
    return {"team_id": team_id, "members": [_membership_dict(m) for m in members.scalars().all()]}


@router.delete("/{team_id}/members/{user_id}")
async def remove_member(
    team_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    result = await db.execute(
        select(TeamMembership).where(
            TeamMembership.team_id == team_id,
            TeamMembership.user_id == user_id,
        )
    )
    membership = await _scalar(result)
    if not membership:
        raise HTTPException(404, "Membership not found")
    await db.delete(membership)
    await db.commit()
    return {"message": "Member removed"}


@router.post("/{team_id}/roles", status_code=201)
async def assign_role_to_team(
    team_id: str,
    payload: TeamRoleAssign,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    if payload.role not in ROLES:
        raise HTTPException(400, f"Invalid role. Valid: {ROLES}")
    team_result = await db.execute(select(Team).where(Team.team_id == team_id))
    if not await _scalar(team_result):
        raise HTTPException(404, "Team not found")
    existing = await db.execute(
        select(TeamRole).where(TeamRole.team_id == team_id, TeamRole.role == payload.role)
    )
    if await _scalar(existing):
        raise HTTPException(409, f"Team already has role '{payload.role}'")
    team_role = TeamRole(
        team_role_id=str(uuid.uuid4()),
        team_id=team_id,
        role=payload.role,
        granted_by=admin.get("email"),
    )
    db.add(team_role)
    await db.commit()
    return {"team_role_id": team_role.team_role_id, "team_id": team_id, "role": payload.role}


@router.get("/{team_id}/roles")
async def list_team_roles(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(TeamRole).where(TeamRole.team_id == team_id))
    roles = result.scalars().all()
    return {
        "team_id": team_id,
        "roles": [{"team_role_id": r.team_role_id, "role": r.role, "granted_by": r.granted_by} for r in roles],
    }
