from __future__ import annotations

import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, Field

from app.db.database import get_db
from app.db.models import Team, TeamMembership, TeamRole, User, AuditLog
from app.core.security import get_current_user, require_admin, ROLES

router = APIRouter(prefix="/teams", tags=["Teams"])
logger = logging.getLogger("dq_platform.teams")


class TeamCreate(BaseModel):
    team_name: str = Field(..., min_length=1, max_length=200)
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
    if existing.scalar_one_or_none():
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
    total = (await db.execute(
        select(func.count()).select_from(Team).where(Team.is_active == True)
    )).scalar() or 0
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
    team = result.scalar_one_or_none()
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
    team = result.scalar_one_or_none()
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
    team = result.scalar_one_or_none()
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
    if not team_result.scalar_one_or_none():
        raise HTTPException(404, "Team not found")
    user_result = await db.execute(select(User).where(User.user_id == payload.user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(404, "User not found")
    existing = await db.execute(
        select(TeamMembership).where(
            TeamMembership.team_id == team_id,
            TeamMembership.user_id == payload.user_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "User is already a member of this team")
    membership = TeamMembership(
        membership_id=str(uuid.uuid4()),
        team_id=team_id,
        user_id=payload.user_id,
        role_in_team=payload.role_in_team,
        created_by=admin.get("email"),
    )
    db.add(membership)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="ADD_MEMBER",
        entity_type="team",
        entity_id=team_id,
        new_value={"user_id": payload.user_id, "role_in_team": payload.role_in_team},
    ))
    await db.commit()
    return {"membership_id": membership.membership_id, "team_id": team_id, "user_id": payload.user_id}


@router.get("/{team_id}/members")
async def list_members(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Team).where(Team.team_id == team_id))
    if not result.scalar_one_or_none():
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
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(404, "Membership not found")
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="REMOVE_MEMBER",
        entity_type="team",
        entity_id=team_id,
        new_value={"user_id": user_id},
    ))
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
    if not team_result.scalar_one_or_none():
        raise HTTPException(404, "Team not found")
    existing = await db.execute(
        select(TeamRole).where(TeamRole.team_id == team_id, TeamRole.role == payload.role)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"Team already has role '{payload.role}'")
    team_role = TeamRole(
        team_role_id=str(uuid.uuid4()),
        team_id=team_id,
        role=payload.role,
        granted_by=admin.get("email"),
    )
    db.add(team_role)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="ASSIGN_TEAM_ROLE",
        entity_type="team",
        entity_id=team_id,
        new_value={"role": payload.role},
    ))
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


# ── Notification Targets ──────────────────────────────────────────────────────

@router.post("/notification-targets", status_code=201)
async def create_notification_target(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    from app.db.models import NotificationTarget
    VALID_CHANNELS = {"email", "slack", "pagerduty", "webhook", "ms_teams"}
    VALID_ENTITY_TYPES = {"user", "team"}

    entity_type = payload.get("entity_type", "")
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(400, f"entity_type must be one of {sorted(VALID_ENTITY_TYPES)}")
    channel = payload.get("channel", "")
    if channel not in VALID_CHANNELS:
        raise HTTPException(400, f"channel must be one of {sorted(VALID_CHANNELS)}")
    address = (payload.get("address") or "").strip()
    if not address:
        raise HTTPException(400, "address is required")

    target = NotificationTarget(
        target_id=str(uuid.uuid4()),
        entity_type=entity_type,
        entity_id=payload.get("entity_id", ""),
        channel=channel,
        address=address,
        label=payload.get("label"),
    )
    db.add(target)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="CREATE",
        entity_type="notification_target",
        entity_id=target.target_id,
        new_value={"channel": target.channel, "address": target.address},
    ))
    await db.commit()
    return {"target_id": target.target_id, "channel": target.channel, "address": target.address}


@router.get("/notification-targets")
async def list_notification_targets(
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    from app.db.models import NotificationTarget
    q = select(NotificationTarget).where(NotificationTarget.is_active == True)
    if entity_type:
        q = q.where(NotificationTarget.entity_type == entity_type)
    if entity_id:
        q = q.where(NotificationTarget.entity_id == entity_id)
    result = await db.execute(q)
    return [
        {
            "target_id": t.target_id,
            "entity_type": t.entity_type,
            "entity_id": t.entity_id,
            "channel": t.channel,
            "address": t.address,
            "label": t.label,
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in result.scalars().all()
    ]


@router.delete("/notification-targets/{target_id}")
async def delete_notification_target(
    target_id: str,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    from app.db.models import NotificationTarget
    result = await db.execute(
        select(NotificationTarget).where(NotificationTarget.target_id == target_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Notification target not found")
    target.is_active = False
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="DELETE",
        entity_type="notification_target",
        entity_id=target_id,
    ))
    await db.commit()
    return {"message": "Notification target deleted"}
