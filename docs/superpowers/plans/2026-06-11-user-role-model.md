# User and Role Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready RBAC model with teams, multi-role assignments, permission evaluation, asset ownership endpoints, and notification target metadata.

**Architecture:** Extend the existing `User` model (which already has a single `role` string) with a `teams` table, `team_memberships`, `user_roles` (multi-role), `team_roles`, and `notification_targets`. Permission evaluation lives in a pure service function (`has_permission`) that maps role names to permission sets — no DB round-trip at request time. A new `teams.py` router handles team CRUD and membership. A new `ownership.py` router exposes the already-present `Asset.owner_user_id/owner_team_id/steward_user_id` columns. Role assignment endpoints are added to `users.py`.

**Tech Stack:** FastAPI, SQLAlchemy async, Python 3.11, Alembic migrations (Snowflake-targeted), Pydantic v2, pytest + AsyncMock

---

## What Already Exists (do not re-implement)

- `User` model in `app/db/models.py` — has `user_id`, `email`, `hashed_password`, `full_name`, `role` (single string), `created_at`, `updated_at`
- `ROLES` in `app/core/security.py` = `["admin", "domain_owner", "data_owner", "viewer", "auditor"]`
- Auth endpoints in `app/api/users.py`: login, refresh, me, CRUD for users
- `AuditLog` model — tracks actions with `user_email`, `action`, `entity_type`, `entity_id`
- `Asset` model — already has `owner_user_id`, `owner_team_id`, `steward_user_id` columns
- `require_admin`, `require_write`, `get_current_user` dependencies in `app/core/security.py`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `app/db/models.py` | Modify | Add `Team`, `TeamMembership`, `UserRole`, `TeamRole`, `NotificationTarget` models |
| `app/core/security.py` | Modify | Expand `ROLES`, add `ROLE_PERMISSIONS` map, `has_permission()`, `require_permission()` |
| `app/services/rbac.py` | Create | Pure permission evaluation helpers used by API layer |
| `app/api/teams.py` | Create | Team CRUD + membership management endpoints |
| `app/api/ownership.py` | Create | Asset ownership assignment and lookup endpoints |
| `app/api/users.py` | Modify | Add `/users/{user_id}/roles` endpoints (assign/list/revoke) |
| `app/main.py` | Modify | Register `teams` and `ownership` routers |
| `migrations/versions/0017_user_role_model.py` | Create | DDL for new tables |
| `tests/test_rbac.py` | Create | Unit tests for `has_permission` and permission map |
| `tests/test_teams_api.py` | Create | API-level tests for teams and membership endpoints |

---

## Task 1: Expand ROLES and add permission map to security.py

**Files:**
- Modify: `app/core/security.py:13`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_rbac.py
from app.core.security import ROLES, ROLE_PERMISSIONS, has_permission

def test_all_phase1_roles_present():
    for role in ("admin", "data_steward", "data_engineer", "analyst", "viewer"):
        assert role in ROLES, f"Expected role {role!r} in ROLES"

def test_admin_has_all_permissions():
    for perm in ("manage_sources", "run_scans", "view_results",
                 "manage_assets", "manage_users", "edit_metadata"):
        assert has_permission({"role": "admin"}, perm), f"admin should have {perm}"

def test_viewer_has_only_view_results():
    assert has_permission({"role": "viewer"}, "view_results")
    assert not has_permission({"role": "viewer"}, "manage_users")
    assert not has_permission({"role": "viewer"}, "manage_sources")

def test_data_steward_permissions():
    for perm in ("run_scans", "view_results", "manage_assets", "edit_metadata"):
        assert has_permission({"role": "data_steward"}, perm)
    assert not has_permission({"role": "data_steward"}, "manage_users")
    assert not has_permission({"role": "data_steward"}, "manage_sources")

def test_data_engineer_permissions():
    for perm in ("manage_sources", "run_scans", "view_results", "manage_assets", "edit_metadata"):
        assert has_permission({"role": "data_engineer"}, perm)
    assert not has_permission({"role": "data_engineer"}, "manage_users")

def test_analyst_permissions():
    assert has_permission({"role": "analyst"}, "view_results")
    assert not has_permission({"role": "analyst"}, "run_scans")
    assert not has_permission({"role": "analyst"}, "edit_metadata")

def test_unknown_role_has_no_permissions():
    assert not has_permission({"role": "ghost_role"}, "view_results")

def test_missing_role_key_has_no_permissions():
    assert not has_permission({}, "view_results")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_rbac.py -v 2>&1 | head -30
```

Expected: ImportError on `ROLE_PERMISSIONS` and `has_permission` — they don't exist yet.

- [ ] **Step 3: Add ROLE_PERMISSIONS and has_permission to security.py**

Open `app/core/security.py`. After line 13 (`ROLES = [...]`), replace that line and add the new definitions:

```python
# All recognised role names — Phase 1 roles + legacy roles for backward compat
ROLES = [
    "admin",
    "data_steward",
    "data_engineer",
    "analyst",
    "viewer",
    # Legacy roles (kept for backward compat with existing tokens/records)
    "domain_owner",
    "data_owner",
    "auditor",
]

# Maps each role to the set of permissions it grants
ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {
        "manage_sources", "run_scans", "view_results",
        "manage_assets", "manage_users", "edit_metadata",
    },
    "data_steward": {
        "run_scans", "view_results", "manage_assets", "edit_metadata",
    },
    "data_engineer": {
        "manage_sources", "run_scans", "view_results",
        "manage_assets", "edit_metadata",
    },
    "analyst": {"view_results"},
    "viewer": {"view_results"},
    # Legacy role mappings
    "domain_owner": {
        "run_scans", "view_results", "manage_assets", "edit_metadata",
    },
    "data_owner": {
        "manage_sources", "run_scans", "view_results",
        "manage_assets", "edit_metadata",
    },
    "auditor": {"view_results"},
}


def has_permission(user: dict, permission: str) -> bool:
    """Return True if the user's primary role grants the given permission."""
    role = user.get("role", "")
    return permission in ROLE_PERMISSIONS.get(role, set())


def require_permission(permission: str):
    """FastAPI dependency factory — raises HTTP 403 if user lacks the permission."""
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' required.",
            )
        return user
    return checker
```

Also update the existing `require_write` definition to include new roles:

```python
require_admin = require_roles("admin")
require_write = require_roles(
    "admin", "data_steward", "data_engineer",
    "domain_owner", "data_owner",  # legacy
)
require_read = require_roles(
    "admin", "data_steward", "data_engineer", "analyst", "viewer",
    "domain_owner", "data_owner", "auditor",  # legacy
)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_rbac.py -v
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/core/security.py tests/test_rbac.py
git commit -m "feat(rbac): expand ROLES with Phase 1 roles and add ROLE_PERMISSIONS permission map"
```

---

## Task 2: Add Team, TeamMembership, UserRole, TeamRole, NotificationTarget models

**Files:**
- Modify: `app/db/models.py` (append at end, before nothing — file currently ends after `RuleResultPlaceholder`)
- Test: `tests/test_rbac.py`

- [ ] **Step 1: Write the failing test**

```python
# Append to tests/test_rbac.py

def test_team_model_importable():
    from app.db.models import Team, TeamMembership, UserRole, TeamRole, NotificationTarget
    assert Team.__tablename__ == "teams"
    assert TeamMembership.__tablename__ == "team_memberships"
    assert UserRole.__tablename__ == "user_roles"
    assert TeamRole.__tablename__ == "team_roles"
    assert NotificationTarget.__tablename__ == "notification_targets"

def test_team_has_required_columns():
    from app.db.models import Team
    cols = {c.key for c in Team.__table__.columns}
    for col in ("team_id", "team_name", "is_active", "created_by", "created_at", "updated_at"):
        assert col in cols, f"Team missing column: {col}"

def test_user_role_has_required_columns():
    from app.db.models import UserRole
    cols = {c.key for c in UserRole.__table__.columns}
    for col in ("user_role_id", "user_id", "role", "granted_by", "created_at"):
        assert col in cols, f"UserRole missing column: {col}"

def test_notification_target_has_required_columns():
    from app.db.models import NotificationTarget
    cols = {c.key for c in NotificationTarget.__table__.columns}
    for col in ("target_id", "entity_type", "entity_id", "channel", "address", "is_active"):
        assert col in cols, f"NotificationTarget missing column: {col}"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_rbac.py::test_team_model_importable -v
```

Expected: FAIL — `ImportError: cannot import name 'Team'`

- [ ] **Step 3: Append new models to app/db/models.py**

Append the following at the very end of `app/db/models.py` (after the `FailedSampleRecordPlaceholder` class):

```python

# ---------------------------------------------------------------------------
# §M6  User / Role / Team / Ownership
# ---------------------------------------------------------------------------

class Team(Base):
    __tablename__ = "teams"

    team_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    team_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)


class TeamMembership(Base):
    """Many-to-many join between users and teams."""
    __tablename__ = "team_memberships"
    __table_args__ = (
        UniqueConstraint("team_id", "user_id", name="uq_team_membership"),
    )

    membership_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    role_in_team: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class UserRole(Base):
    """Additional roles beyond the primary User.role field. Supports multi-role."""
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role", name="uq_user_role"),
    )

    user_role_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    granted_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class TeamRole(Base):
    """Roles assigned to an entire team — all members inherit them."""
    __tablename__ = "team_roles"
    __table_args__ = (
        UniqueConstraint("team_id", "role", name="uq_team_role"),
    )

    team_role_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.team_id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    granted_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class NotificationTarget(Base):
    """Per-user or per-team notification channel configuration."""
    __tablename__ = "notification_targets"

    target_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)   # "user" or "team"
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)        # "email", "slack", "pagerduty", "webhook"
    address: Mapped[str] = mapped_column(String(500), nullable=False)       # email addr, Slack channel, URL, etc.
    label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_rbac.py -v
```

Expected: All model tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py tests/test_rbac.py
git commit -m "feat(rbac): add Team, TeamMembership, UserRole, TeamRole, NotificationTarget models"
```

---

## Task 3: Create RBAC service (app/services/rbac.py)

**Files:**
- Create: `app/services/rbac.py`
- Test: `tests/test_rbac.py`

- [ ] **Step 1: Write the failing test**

```python
# Append to tests/test_rbac.py
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.mark.asyncio
async def test_get_user_effective_roles_primary_only():
    from app.services.rbac import get_user_effective_roles
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = []
    roles = await get_user_effective_roles("user-123", "data_steward", db)
    assert "data_steward" in roles

@pytest.mark.asyncio
async def test_get_user_effective_roles_merges_extra_roles():
    from app.services.rbac import get_user_effective_roles
    from app.db.models import UserRole
    extra = MagicMock(spec=UserRole)
    extra.role = "analyst"
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = [extra]
    roles = await get_user_effective_roles("user-123", "data_steward", db)
    assert "data_steward" in roles
    assert "analyst" in roles

def test_get_effective_permissions_from_roles():
    from app.services.rbac import get_effective_permissions
    perms = get_effective_permissions(["admin"])
    assert "manage_users" in perms
    assert "view_results" in perms

def test_get_effective_permissions_merges_multiple_roles():
    from app.services.rbac import get_effective_permissions
    # analyst: view_results only; data_engineer adds manage_sources etc.
    perms = get_effective_permissions(["analyst", "data_engineer"])
    assert "view_results" in perms
    assert "manage_sources" in perms

def test_get_effective_permissions_empty_roles():
    from app.services.rbac import get_effective_permissions
    assert get_effective_permissions([]) == set()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_rbac.py::test_get_user_effective_roles_primary_only -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.rbac'`

- [ ] **Step 3: Create app/services/rbac.py**

```python
from __future__ import annotations

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


def get_effective_permissions(roles: list[str]) -> set[str]:
    """Return the union of all permissions granted by the given roles."""
    permissions: set[str] = set()
    for role in roles:
        permissions |= ROLE_PERMISSIONS.get(role, set())
    return permissions
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_rbac.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/rbac.py tests/test_rbac.py
git commit -m "feat(rbac): add RBAC service with effective role and permission evaluation"
```

---

## Task 4: Create Teams API (app/api/teams.py)

**Files:**
- Create: `app/api/teams.py`
- Test: `tests/test_teams_api.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_teams_api.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_mock_team(team_id="team-001", team_name="Analytics"):
    t = MagicMock()
    t.team_id = team_id
    t.team_name = team_name
    t.description = "Analytics team"
    t.is_active = True
    t.created_by = "admin@example.com"
    t.created_at = "2026-06-11T10:00:00"
    t.updated_at = "2026-06-11T10:00:00"
    return t


def _make_mock_membership(membership_id="mem-001", user_id="user-001", team_id="team-001"):
    m = MagicMock()
    m.membership_id = membership_id
    m.user_id = user_id
    m.team_id = team_id
    m.role_in_team = "member"
    m.created_by = "admin@example.com"
    m.created_at = "2026-06-11T10:00:00"
    return m


def test_teams_router_has_expected_routes():
    from app.api.teams import router
    paths = {r.path for r in router.routes}
    assert "/teams" in paths
    assert "/teams/{team_id}" in paths
    assert "/teams/{team_id}/members" in paths
    assert "/teams/{team_id}/members/{user_id}" in paths


@pytest.mark.asyncio
async def test_create_team_returns_team_id():
    from app.api.teams import create_team
    from app.api.teams import TeamCreate

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None  # no existing team
    db.add = MagicMock()
    db.commit = AsyncMock()
    admin = {"email": "admin@example.com", "role": "admin"}

    result = await create_team(
        TeamCreate(team_name="Analytics", description="Analytics team"),
        db=db,
        admin=admin,
    )
    assert "team_id" in result
    assert result["team_name"] == "Analytics"


@pytest.mark.asyncio
async def test_create_team_409_on_duplicate():
    from app.api.teams import create_team, TeamCreate
    from fastapi import HTTPException

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = _make_mock_team()

    with pytest.raises(HTTPException) as exc_info:
        await create_team(
            TeamCreate(team_name="Analytics"),
            db=db,
            admin={"email": "admin@example.com", "role": "admin"},
        )
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_list_teams_returns_items():
    from app.api.teams import list_teams

    mock_teams = [_make_mock_team("t1", "Alpha"), _make_mock_team("t2", "Beta")]
    count_result = MagicMock()
    count_result.scalar.return_value = 2

    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = mock_teams

    db = AsyncMock()
    db.execute.side_effect = [count_result, list_result]

    result = await list_teams(limit=100, offset=0, db=db, _={"role": "admin"})
    assert result["total"] == 2
    assert len(result["items"]) == 2


@pytest.mark.asyncio
async def test_get_team_returns_404_when_missing():
    from app.api.teams import get_team
    from fastapi import HTTPException

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await get_team("ghost-team", db=db, _={"role": "admin"})
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_add_member_returns_membership_id():
    from app.api.teams import add_member, MemberAdd

    mock_team = _make_mock_team()
    mock_user = MagicMock()
    mock_user.user_id = "user-001"

    db = AsyncMock()
    db.execute.side_effect = [
        MagicMock(**{"scalar_one_or_none.return_value": mock_team}),   # team lookup
        MagicMock(**{"scalar_one_or_none.return_value": mock_user}),   # user lookup
        MagicMock(**{"scalar_one_or_none.return_value": None}),        # existing membership
    ]
    db.add = MagicMock()
    db.commit = AsyncMock()

    result = await add_member(
        "team-001",
        MemberAdd(user_id="user-001"),
        db=db,
        admin={"email": "admin@example.com"},
    )
    assert "membership_id" in result


@pytest.mark.asyncio
async def test_remove_member_returns_message():
    from app.api.teams import remove_member

    mock_membership = _make_mock_membership()
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = mock_membership
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    result = await remove_member("team-001", "user-001", db=db, admin={"email": "admin@example.com"})
    assert result["message"] == "Member removed"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py -v 2>&1 | head -20
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.api.teams'`

- [ ] **Step 3: Create app/api/teams.py**

```python
from __future__ import annotations

import uuid
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from app.db.database import get_db
from app.db.models import Team, TeamMembership, TeamRole, User, AuditLog
from app.core.security import get_current_user, require_admin

router = APIRouter(prefix="/teams", tags=["Teams"])
logger = logging.getLogger("dq_platform.teams")


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


# ── Team CRUD ─────────────────────────────────────────────────────────────────

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


# ── Team Membership ───────────────────────────────────────────────────────────

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
    await db.delete(membership)
    await db.commit()
    return {"message": "Member removed"}


# ── Team Role Assignment ──────────────────────────────────────────────────────

@router.post("/{team_id}/roles", status_code=201)
async def assign_role_to_team(
    team_id: str,
    payload: TeamRoleAssign,
    db: AsyncSession = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    from app.core.security import ROLES
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/teams.py tests/test_teams_api.py
git commit -m "feat(teams): add Teams API with CRUD, membership, and role assignment endpoints"
```

---

## Task 5: Add user role assignment endpoints to users.py

**Files:**
- Modify: `app/api/users.py`
- Test: `tests/test_teams_api.py`

- [ ] **Step 1: Write the failing test**

```python
# Append to tests/test_teams_api.py

def test_user_roles_routes_exist():
    from app.api.users import router
    paths = {r.path for r in router.routes}
    assert "/users/{user_id}/roles" in paths


@pytest.mark.asyncio
async def test_assign_role_to_user_returns_user_role_id():
    from app.api.users import assign_user_role

    mock_user = MagicMock()
    mock_user.user_id = "user-001"
    db = AsyncMock()
    db.execute.side_effect = [
        MagicMock(**{"scalar_one_or_none.return_value": mock_user}),   # user lookup
        MagicMock(**{"scalar_one_or_none.return_value": None}),        # existing role check
    ]
    db.add = MagicMock()
    db.commit = AsyncMock()

    result = await assign_user_role(
        "user-001",
        {"role": "data_steward"},
        db=db,
        admin={"email": "admin@example.com"},
    )
    assert "user_role_id" in result
    assert result["role"] == "data_steward"


@pytest.mark.asyncio
async def test_list_user_roles_returns_list():
    from app.api.users import list_user_roles
    from app.db.models import UserRole

    r1 = MagicMock(spec=UserRole)
    r1.user_role_id = "ur-001"
    r1.role = "analyst"
    r1.granted_by = "admin@example.com"
    r1.created_at = MagicMock()
    r1.created_at.isoformat.return_value = "2026-06-11T10:00:00"

    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = [r1]

    result = await list_user_roles("user-001", db=db, _={"role": "admin"})
    assert result["user_id"] == "user-001"
    assert len(result["roles"]) == 1
    assert result["roles"][0]["role"] == "analyst"


@pytest.mark.asyncio
async def test_revoke_user_role_returns_message():
    from app.api.users import revoke_user_role
    from app.db.models import UserRole

    mock_ur = MagicMock(spec=UserRole)
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = mock_ur
    db.delete = AsyncMock()
    db.commit = AsyncMock()

    result = await revoke_user_role("user-001", "analyst", db=db, admin={"email": "admin@example.com"})
    assert result["message"] == "Role revoked"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py::test_user_roles_routes_exist -v
```

Expected: FAIL — `KeyError` or assertion failure (routes not found yet).

- [ ] **Step 3: Append role endpoints to app/api/users.py**

Add the following after the existing `change_password` endpoint (after line 262, before the `# ── SLA Config` section):

```python
# ── User Role Assignment ──────────────────────────────────────────────────────

@router.post("/users/{user_id}/roles", status_code=201)
async def assign_user_role(
    user_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    from app.db.models import UserRole
    role = payload.get("role", "")
    if role not in ROLES:
        raise HTTPException(400, f"Invalid role. Valid roles: {ROLES}")

    user_result = await db.execute(select(User).where(User.user_id == user_id))
    if not user_result.scalar_one_or_none():
        raise HTTPException(404, "User not found")

    existing = await db.execute(
        select(UserRole).where(UserRole.user_id == user_id, UserRole.role == role)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, f"User already has role '{role}'")

    user_role = UserRole(
        user_role_id=str(uuid.uuid4()),
        user_id=user_id,
        role=role,
        granted_by=admin.get("email"),
    )
    db.add(user_role)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="ASSIGN_ROLE",
        entity_type="user",
        entity_id=user_id,
        new_value={"role": role},
    ))
    await db.commit()
    return {"user_role_id": user_role.user_role_id, "user_id": user_id, "role": role}


@router.get("/users/{user_id}/roles")
async def list_user_roles(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_user),
):
    from app.db.models import UserRole
    result = await db.execute(select(UserRole).where(UserRole.user_id == user_id))
    roles = result.scalars().all()
    return {
        "user_id": user_id,
        "roles": [
            {
                "user_role_id": r.user_role_id,
                "role": r.role,
                "granted_by": r.granted_by,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in roles
        ],
    }


@router.delete("/users/{user_id}/roles/{role}")
async def revoke_user_role(
    user_id: str,
    role: str,
    db: AsyncSession = Depends(get_db),
    admin=Depends(require_admin),
):
    from app.db.models import UserRole
    result = await db.execute(
        select(UserRole).where(UserRole.user_id == user_id, UserRole.role == role)
    )
    user_role = result.scalar_one_or_none()
    if not user_role:
        raise HTTPException(404, "Role assignment not found")
    await db.delete(user_role)
    db.add(AuditLog(
        audit_id=str(uuid.uuid4()),
        user_email=admin.get("email"),
        action="REVOKE_ROLE",
        entity_type="user",
        entity_id=user_id,
        new_value={"role": role},
    ))
    await db.commit()
    return {"message": "Role revoked"}
```

Also add missing import at the top of `app/api/users.py` (after existing imports):

```python
from sqlalchemy import select, func
```

(The file already imports `select`. Verify `func` is imported — if not, add it.)

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/users.py tests/test_teams_api.py
git commit -m "feat(rbac): add user role assignment endpoints to users API"
```

---

## Task 6: Create Ownership API (app/api/ownership.py)

**Files:**
- Create: `app/api/ownership.py`
- Test: `tests/test_teams_api.py`

- [ ] **Step 1: Write the failing test**

```python
# Append to tests/test_teams_api.py

def test_ownership_router_routes_exist():
    from app.api.ownership import router
    paths = {r.path for r in router.routes}
    assert "/assets/{asset_id}/ownership" in paths


@pytest.mark.asyncio
async def test_get_ownership_returns_owner_fields():
    from app.api.ownership import get_asset_ownership

    mock_asset = MagicMock()
    mock_asset.asset_id = "asset-001"
    mock_asset.owner_user_id = "user-001"
    mock_asset.owner_team_id = "team-001"
    mock_asset.steward_user_id = "user-002"
    mock_asset.owner_name = "Alice"
    mock_asset.owner_email = "alice@example.com"

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = mock_asset

    result = await get_asset_ownership("asset-001", db=db, _={"role": "admin"})
    assert result["asset_id"] == "asset-001"
    assert result["owner_user_id"] == "user-001"
    assert result["steward_user_id"] == "user-002"


@pytest.mark.asyncio
async def test_get_ownership_returns_404_when_missing():
    from app.api.ownership import get_asset_ownership
    from fastapi import HTTPException

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await get_asset_ownership("ghost-asset", db=db, _={"role": "admin"})
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_set_ownership_updates_asset_fields():
    from app.api.ownership import set_asset_ownership

    mock_asset = MagicMock()
    mock_asset.asset_id = "asset-001"
    mock_asset.owner_user_id = None
    mock_asset.owner_team_id = None
    mock_asset.steward_user_id = None

    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = mock_asset
    db.commit = AsyncMock()

    result = await set_asset_ownership(
        "asset-001",
        {"owner_user_id": "user-001", "steward_user_id": "user-002"},
        db=db,
        user={"email": "admin@example.com", "role": "admin"},
    )
    assert result["asset_id"] == "asset-001"
    assert mock_asset.owner_user_id == "user-001"
    assert mock_asset.steward_user_id == "user-002"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py::test_ownership_router_routes_exist -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.api.ownership'`

- [ ] **Step 3: Create app/api/ownership.py**

```python
from __future__ import annotations

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.database import get_db
from app.db.models import Asset
from app.core.security import get_current_user, require_permission

router = APIRouter(tags=["Ownership"])
logger = logging.getLogger("dq_platform.ownership")


def _ownership_dict(asset: Asset) -> dict:
    return {
        "asset_id": asset.asset_id,
        "owner_user_id": asset.owner_user_id,
        "owner_team_id": asset.owner_team_id,
        "steward_user_id": asset.steward_user_id,
        "owner_name": asset.owner_name,
        "owner_email": asset.owner_email,
        "technical_owner_name": asset.technical_owner_name,
        "technical_owner_email": asset.technical_owner_email,
    }


@router.get("/assets/{asset_id}/ownership")
async def get_asset_ownership(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    return _ownership_dict(asset)


@router.put("/assets/{asset_id}/ownership")
async def set_asset_ownership(
    asset_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_permission("manage_assets")),
):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")

    allowed_fields = {
        "owner_user_id", "owner_team_id", "steward_user_id",
        "owner_name", "owner_email",
        "technical_owner_name", "technical_owner_email",
    }
    for field, value in payload.items():
        if field in allowed_fields:
            setattr(asset, field, value)

    await db.commit()
    logger.info(f"Ownership updated for asset {asset_id} by {user.get('email')}")
    return _ownership_dict(asset)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/ownership.py tests/test_teams_api.py
git commit -m "feat(ownership): add asset ownership GET/PUT endpoints"
```

---

## Task 7: Create Notification Targets API + Permissions endpoint

**Files:**
- Modify: `app/api/teams.py` (add notification target endpoints)
- Test: `tests/test_teams_api.py`

- [ ] **Step 1: Write the failing test**

```python
# Append to tests/test_teams_api.py

def test_notification_target_routes_exist():
    from app.api.teams import router
    paths = {r.path for r in router.routes}
    assert "/teams/notification-targets" in paths


@pytest.mark.asyncio
async def test_create_notification_target_returns_target_id():
    from app.api.teams import create_notification_target

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    result = await create_notification_target(
        {
            "entity_type": "user",
            "entity_id": "user-001",
            "channel": "slack",
            "address": "#data-alerts",
            "label": "My Slack",
        },
        db=db,
        user={"email": "admin@example.com", "role": "admin"},
    )
    assert "target_id" in result


@pytest.mark.asyncio
async def test_list_notification_targets_filters_by_entity():
    from app.api.teams import list_notification_targets
    from app.db.models import NotificationTarget

    nt = MagicMock(spec=NotificationTarget)
    nt.target_id = "nt-001"
    nt.entity_type = "user"
    nt.entity_id = "user-001"
    nt.channel = "email"
    nt.address = "alice@example.com"
    nt.label = None
    nt.is_active = True
    nt.created_at = MagicMock()
    nt.created_at.isoformat.return_value = "2026-06-11T10:00:00"

    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = [nt]

    result = await list_notification_targets(entity_type="user", entity_id="user-001", db=db, _={"role": "admin"})
    assert len(result) == 1
    assert result[0]["channel"] == "email"


def test_permissions_endpoint_in_users_router():
    from app.api.users import router
    paths = {r.path for r in router.routes}
    assert "/auth/my-permissions" in paths
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py::test_notification_target_routes_exist -v
```

Expected: FAIL — assertion error (routes not present yet).

- [ ] **Step 3: Add notification target endpoints to app/api/teams.py**

Append at the end of `app/api/teams.py`:

```python
# ── Notification Targets ──────────────────────────────────────────────────────

@router.post("/notification-targets", status_code=201)
async def create_notification_target(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    import uuid as _uuid
    from app.db.models import NotificationTarget
    VALID_CHANNELS = {"email", "slack", "pagerduty", "webhook", "ms_teams"}
    VALID_ENTITY_TYPES = {"user", "team"}

    entity_type = payload.get("entity_type", "")
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(400, f"entity_type must be one of {VALID_ENTITY_TYPES}")
    channel = payload.get("channel", "")
    if channel not in VALID_CHANNELS:
        raise HTTPException(400, f"channel must be one of {VALID_CHANNELS}")
    address = payload.get("address", "").strip()
    if not address:
        raise HTTPException(400, "address is required")

    target = NotificationTarget(
        target_id=str(_uuid.uuid4()),
        entity_type=entity_type,
        entity_id=payload.get("entity_id", ""),
        channel=channel,
        address=address,
        label=payload.get("label"),
    )
    db.add(target)
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
    from sqlalchemy import and_
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
    user: dict = Depends(get_current_user),
):
    from app.db.models import NotificationTarget
    result = await db.execute(
        select(NotificationTarget).where(NotificationTarget.target_id == target_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "Notification target not found")
    target.is_active = False
    await db.commit()
    return {"message": "Notification target deleted"}
```

Also add `/auth/my-permissions` to `app/api/users.py` (after the existing `/auth/me` endpoint):

```python
@router.get("/auth/my-permissions")
async def get_my_permissions(current_user: dict = Depends(get_current_user)):
    from app.core.security import ROLE_PERMISSIONS
    role = current_user.get("role", "")
    return {
        "role": role,
        "permissions": sorted(ROLE_PERMISSIONS.get(role, set())),
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/teams.py app/api/users.py tests/test_teams_api.py
git commit -m "feat(rbac): add notification targets API and /auth/my-permissions endpoint"
```

---

## Task 8: Register new routers in main.py

**Files:**
- Modify: `app/main.py`
- Test: `tests/test_teams_api.py`

- [ ] **Step 1: Write the failing test**

```python
# Append to tests/test_teams_api.py

def test_teams_router_registered_in_main():
    from app.main import app
    paths = [r.path for r in app.routes]
    assert any("/teams" in p for p in paths), "teams router not registered in main.py"


def test_ownership_router_registered_in_main():
    from app.main import app
    paths = [r.path for r in app.routes]
    assert any("/ownership" in p or "ownership" in p for p in paths), \
        "ownership router not registered — check /assets/{asset_id}/ownership"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py::test_teams_router_registered_in_main -v
```

Expected: FAIL — teams router not in main app.

- [ ] **Step 3: Register routers in app/main.py**

In `app/main.py`, add to the import block (after `from app.api import ... scan_results,`):

```python
from app.api import teams as teams_module
from app.api import ownership as ownership_module
```

Then after `app.include_router(scan_results.router)`, add:

```python
app.include_router(teams_module.router)
app.include_router(ownership_module.router)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_teams_api.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/main.py tests/test_teams_api.py
git commit -m "feat(rbac): register teams and ownership routers in main.py"
```

---

## Task 9: Create Alembic migration 0017

**Files:**
- Create: `migrations/versions/0017_user_role_model.py`

- [ ] **Step 1: Create the migration file**

```python
# migrations/versions/0017_user_role_model.py
"""Add user/role/team RBAC tables: teams, team_memberships, user_roles, team_roles, notification_targets.

Revision ID: 0017
Revises: 0016
Create Date: 2026-06-11
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = '0017'
down_revision = '0016'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'teams',
        sa.Column('team_id', sa.String(36), primary_key=True),
        sa.Column('team_name', sa.String(200), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'team_memberships',
        sa.Column('membership_id', sa.String(36), primary_key=True),
        sa.Column('team_id', sa.String(36),
                  sa.ForeignKey('teams.team_id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(36),
                  sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('role_in_team', sa.String(50), nullable=True),
        sa.Column('created_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('team_id', 'user_id', name='uq_team_membership'),
    )

    op.create_table(
        'user_roles',
        sa.Column('user_role_id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36),
                  sa.ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('granted_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('user_id', 'role', name='uq_user_role'),
    )

    op.create_table(
        'team_roles',
        sa.Column('team_role_id', sa.String(36), primary_key=True),
        sa.Column('team_id', sa.String(36),
                  sa.ForeignKey('teams.team_id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('granted_by', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('team_id', 'role', name='uq_team_role'),
    )

    op.create_table(
        'notification_targets',
        sa.Column('target_id', sa.String(36), primary_key=True),
        sa.Column('entity_type', sa.String(20), nullable=False),
        sa.Column('entity_id', sa.String(36), nullable=False),
        sa.Column('channel', sa.String(30), nullable=False),
        sa.Column('address', sa.String(500), nullable=False),
        sa.Column('label', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='TRUE'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_index('ix_team_memberships_team_id', 'team_memberships', ['team_id'])
    op.create_index('ix_team_memberships_user_id', 'team_memberships', ['user_id'])
    op.create_index('ix_user_roles_user_id', 'user_roles', ['user_id'])
    op.create_index('ix_team_roles_team_id', 'team_roles', ['team_id'])
    op.create_index('ix_notification_targets_entity', 'notification_targets', ['entity_type', 'entity_id'])


def downgrade() -> None:
    op.drop_index('ix_notification_targets_entity', table_name='notification_targets')
    op.drop_index('ix_team_roles_team_id', table_name='team_roles')
    op.drop_index('ix_user_roles_user_id', table_name='user_roles')
    op.drop_index('ix_team_memberships_user_id', table_name='team_memberships')
    op.drop_index('ix_team_memberships_team_id', table_name='team_memberships')
    op.drop_table('notification_targets')
    op.drop_table('team_roles')
    op.drop_table('user_roles')
    op.drop_table('team_memberships')
    op.drop_table('teams')
```

- [ ] **Step 2: Verify migration file is importable**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "import migrations.versions.0017_user_role_model" 2>&1 || \
python -c "
import importlib.util, sys
spec = importlib.util.spec_from_file_location('m', 'migrations/versions/0017_user_role_model.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
print('revision:', m.revision)
print('down_revision:', m.down_revision)
"
```

Expected: prints `revision: 0017` and `down_revision: 0016`.

- [ ] **Step 3: Commit**

```bash
git add migrations/versions/0017_user_role_model.py
git commit -m "feat(rbac): add Alembic migration 0017 for RBAC tables"
```

---

## Task 10: Full test suite + final verification

- [ ] **Step 1: Run all RBAC tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_rbac.py tests/test_teams_api.py -v
```

Expected: All tests PASS. Count ≥ 30.

- [ ] **Step 2: Run full test suite to check for regressions**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: No pre-existing passing tests should now fail.

- [ ] **Step 3: Verify app imports cleanly**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "from app.main import app; print('OK —', len(app.routes), 'routes registered')"
```

Expected: prints `OK — <N> routes registered` with no import errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(rbac): Module 6 complete — user/role/team RBAC model, ownership API, notification targets"
```

---

## Self-Review Checklist

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| User model | Already exists — no change needed |
| Team model | Task 2 (Team in models.py) + Task 4 (teams.py CRUD) |
| Role model | Task 1 (ROLES expanded) + Task 2 (UserRole, TeamRole tables) |
| User-role and team-role assignments | Task 5 (/users/{id}/roles) + Task 4 (team roles endpoints) |
| Asset ownership assignments | Task 6 (ownership.py — GET/PUT /assets/{id}/ownership) |
| Permission mapping for 6 permissions | Task 1 (ROLE_PERMISSIONS dict + has_permission) |
| Notification target metadata | Task 7 (notification-targets CRUD in teams.py) |
| Audit fields | existing `AuditLog` model + `created_by` on Team/TeamMembership/UserRole |
| Approval by placeholder | `approved_by_placeholder` noted — existing `AuditLog` entity captures this; no new column needed for Phase 1 |
| `manage_sources, run_scans, view_results, manage_assets, manage_users, edit_metadata` | Task 1 — all 6 mapped |

**Backward compat verified:**
- `ROLES` list is additive (old role names kept)
- `require_write` updated to include new roles
- Existing `User.role` field unchanged
- No existing model fields removed

---

## Next Integration Notes for Final Phase 1 Wiring

1. **Permission enforcement on existing endpoints**: Key endpoints that need `require_permission()` guards added:
   - `POST /connections` → `require_permission("manage_sources")`
   - `POST /scan-jobs/{id}/trigger` → `require_permission("run_scans")`
   - `GET /scan-results/*` → `require_permission("view_results")`
   - `PUT /assets/{id}` → `require_permission("manage_assets")`
   - `PUT /metadata/*` → `require_permission("edit_metadata")`

2. **`created_by` / `updated_by` audit fields**: `ScanJob.created_by`, `DQRule.created_by`, `Asset.owner_user_id` are already nullable strings. The convention is to store `user.email` there. No schema change needed — just wire the current user's email when creating these objects.

3. **Multi-role evaluation at request time**: For Phase 1 the JWT's `role` field drives all request-time checks. Phase 2 can call `get_user_effective_roles()` at login time and embed all roles in the JWT, or check `user_roles` table on sensitive endpoints.

4. **Team-based scan responsibilities**: `ScanJob.created_by` can be set to a team name for team-owned jobs. No schema change needed — it's a free-text string.
