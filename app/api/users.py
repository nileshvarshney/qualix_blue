from __future__ import annotations
from typing import Optional
import uuid
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, EmailStr
from app.db.database import get_db
from app.db.models import User, AuditLog
from app.core.security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    decode_token, get_current_user, require_admin, require_write, ROLES,
)
from app.core.limiter import limiter

_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)

router = APIRouter(tags=["Users & Auth"])
logger = logging.getLogger("dq_platform.users")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "viewer"
    domain_id: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    domain_id: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ── Auth endpoints ────────────────────────────────────────────────────────────

@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    user.last_login = _utcnow()
    await db.commit()

    token_data = {
        "sub": user.user_id,
        "email": user.email,
        "role": user.role,
        "full_name": user.full_name,
        "user_id": user.user_id,
        "domain_id": user.domain_id,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token({"sub": user.user_id, "email": user.email})
    logger.info(f"User {user.email} logged in")
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={"user_id": user.user_id, "email": user.email, "full_name": user.full_name, "role": user.role},
    )


@router.post("/auth/refresh")
async def refresh_token(body: dict, db: AsyncSession = Depends(get_db)):
    token = body.get("refresh_token", "")
    try:
        from jose import JWTError
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(400, "Not a refresh token")
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")

    result = await db.execute(select(User).where(User.user_id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")

    token_data = {"sub": user.user_id, "email": user.email, "role": user.role,
                  "full_name": user.full_name, "user_id": user.user_id, "domain_id": user.domain_id}
    return {"access_token": create_access_token(token_data), "token_type": "bearer"}


@router.get("/auth/me")
async def get_me(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("user_id") or current_user.get("sub")
    if user_id and user_id != "system":
        result = await db.execute(select(User).where(User.user_id == user_id))
        user = result.scalar_one_or_none()
        if user:
            return {
                "user_id": user.user_id, "email": user.email, "full_name": user.full_name,
                "role": user.role, "domain_id": user.domain_id, "last_login": user.last_login.isoformat() if user.last_login else None,
            }
    return current_user


# ── User management (admin only) ──────────────────────────────────────────────

@router.post("/users", status_code=201)
async def create_user(
    payload: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    if payload.role not in ROLES:
        raise HTTPException(400, f"Invalid role. Valid roles: {ROLES}")
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email already registered")
    user = User(
        user_id=str(uuid.uuid4()),
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        domain_id=payload.domain_id,
    )
    db.add(user)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=admin.get("email"),
        action="CREATE", entity_type="user", entity_id=user.user_id,
        new_value={"email": user.email, "role": user.role},
    ))
    await db.commit()
    return {"user_id": user.user_id, "email": user.email, "role": user.role, "full_name": user.full_name}


@router.get("/users")
async def list_users(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    from sqlalchemy import func as sqlfunc
    total = (await db.execute(select(sqlfunc.count()).select_from(User))).scalar() or 0
    result = await db.execute(select(User).order_by(User.created_at.desc()).limit(limit).offset(offset))
    users = result.scalars().all()
    return {
        "total": total, "limit": limit, "offset": offset,
        "items": [
            {
                "user_id": u.user_id, "email": u.email, "full_name": u.full_name,
                "role": u.role, "is_active": u.is_active, "domain_id": u.domain_id,
                "last_login": u.last_login.isoformat() if u.last_login else None,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
    }


@router.get("/users/{user_id}")
async def get_user(user_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    return {"user_id": user.user_id, "email": user.email, "full_name": user.full_name,
            "role": user.role, "is_active": user.is_active, "domain_id": user.domain_id,
            "created_at": user.created_at.isoformat()}


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    payload: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if payload.role and payload.role not in ROLES:
        raise HTTPException(400, f"Invalid role. Valid roles: {ROLES}")
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "password":
            user.hashed_password = hash_password(value)
        else:
            setattr(user, field, value)
    user.updated_at = _utcnow()
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=admin.get("email"),
        action="UPDATE", entity_type="user", entity_id=user_id,
        new_value=payload.model_dump(exclude_none=True),
    ))
    await db.commit()
    return {"user_id": user.user_id, "email": user.email, "role": user.role, "is_active": user.is_active}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.user_id == admin.get("user_id"):
        raise HTTPException(400, "Cannot deactivate your own account")
    user.is_active = False
    user.updated_at = _utcnow()
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()), user_email=admin.get("email"),
        action="DEACTIVATE", entity_type="user", entity_id=user_id,
    ))
    await db.commit()
    return {"message": "User deactivated"}


@router.post("/users/{user_id}/change-password")
async def change_password(
    user_id: str,
    payload: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("user_id") != user_id and current_user.get("role") != "admin":
        raise HTTPException(403, "Can only change your own password")
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if current_user.get("role") != "admin" and not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    user.updated_at = _utcnow()
    await db.commit()
    return {"message": "Password updated successfully"}


# ── SLA Config endpoints ──────────────────────────────────────────────────────

@router.get("/sla-configs")
async def list_sla_configs(db: AsyncSession = Depends(get_db), _=Depends(get_current_user)):
    from app.db.models import SLAConfig
    result = await db.execute(select(SLAConfig).where(SLAConfig.is_active == True))
    configs = result.scalars().all()
    return [
        {
            "sla_id": s.sla_id, "entity_type": s.entity_type, "entity_id": s.entity_id,
            "min_quality_score": s.min_quality_score, "max_failure_pct": s.max_failure_pct,
            "alert_on_breach": s.alert_on_breach, "notification_emails": s.notification_emails,
            "notification_slack_channel": s.notification_slack_channel,
        }
        for s in configs
    ]


@router.post("/sla-configs", status_code=201)
async def create_sla_config(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    from app.db.models import SLAConfig
    config = SLAConfig(
        sla_id=str(uuid.uuid4()),
        entity_type=payload.get("entity_type", "table"),
        entity_id=payload.get("entity_id", ""),
        min_quality_score=float(payload.get("min_quality_score", 95.0)),
        max_failure_pct=float(payload.get("max_failure_pct", 5.0)),
        alert_on_breach=payload.get("alert_on_breach", True),
        notification_emails=payload.get("notification_emails"),
        notification_slack_channel=payload.get("notification_slack_channel"),
    )
    db.add(config)
    await db.commit()
    return {"sla_id": config.sla_id, "message": "SLA config created"}


@router.put("/sla-configs/{sla_id}")
async def update_sla_config(
    sla_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    from app.db.models import SLAConfig
    result = await db.execute(select(SLAConfig).where(SLAConfig.sla_id == sla_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "SLA config not found")
    for field in ("min_quality_score", "max_failure_pct", "alert_on_breach",
                  "notification_emails", "notification_slack_channel"):
        if field in payload:
            v = payload[field]
            if field in ("min_quality_score", "max_failure_pct"):
                v = float(v)
            setattr(config, field, v)
    await db.commit()
    return {"sla_id": config.sla_id, "message": "SLA config updated"}


@router.delete("/sla-configs/{sla_id}")
async def delete_sla_config(
    sla_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    from app.db.models import SLAConfig
    result = await db.execute(select(SLAConfig).where(SLAConfig.sla_id == sla_id))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(404, "SLA config not found")
    config.is_active = False
    await db.commit()
    return {"message": "SLA config deleted"}
