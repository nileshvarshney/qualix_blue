# Issue Intake & Issue Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `Issue` entity with a 7-state lifecycle (new → confirmed → in_progress → blocked → resolved → closed, plus reopened), backend CRUD + transition APIs with audit trail, and frontend UI (Issues page rewrite, slide-in detail panel, Create Issue modal reused from Alerts and Asset Detail panel).

**Architecture:** New `dq_issues` table + `Issue` SQLAlchemy model + `ISSUE_TRANSITIONS` state machine in `app/db/models.py`. New `app/api/issues.py` router following the `alerts.py`/`incidents.py` conventions (`_fmt_issue()` helper, `Query()` filters, domain-scoping via `app/core/security.py`). Frontend: rewrite `frontend/src/app/issues/page.tsx` and `frontend/src/app/api/issues/route.ts` to use real data, add new proxy routes for transition/reopen/audit, and two new reusable components (`CreateIssueModal`, `IssueDetailPanel`) consumed from the Issues page, the Alerts page popup, and a new Asset Detail "Issues" tab.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 async + Alembic (backend), Next.js 16 / React 19 with inline styles, no UI library (frontend). Pytest with `asyncio_mode = auto` and mocked `AsyncSession`.

**Spec reference:** `docs/superpowers/specs/2026-06-12-issue-intake-lifecycle-design.md`

---

## Task 1: `Issue` model + `ISSUE_TRANSITIONS` constant

**Files:**
- Modify: `app/db/models.py` (insert between line 885, end of `QualityIncident`, and line 887, start of `ComplianceFramework`)
- Test: `tests/test_issue_model.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_issue_model.py`:

```python
from app.db.models import Issue, ISSUE_TRANSITIONS


def test_issue_table_name():
    assert Issue.__tablename__ == "dq_issues"


def test_issue_columns():
    cols = {c.name for c in Issue.__table__.columns}
    expected = {
        "issue_id", "title", "description", "issue_type", "status", "severity",
        "domain_id", "subdomain_id", "asset_id", "source_id", "rule_id", "run_id",
        "alert_id", "assigned_team_id", "assigned_to", "created_by", "created_at",
        "updated_at", "resolved_at", "closed_at", "reopen_count", "resolution_note",
    }
    assert expected.issubset(cols)


def test_issue_transitions_table():
    assert ISSUE_TRANSITIONS["new"] == {"confirmed", "closed"}
    assert ISSUE_TRANSITIONS["confirmed"] == {"in_progress", "closed"}
    assert ISSUE_TRANSITIONS["in_progress"] == {"blocked", "resolved", "confirmed"}
    assert ISSUE_TRANSITIONS["blocked"] == {"in_progress"}
    assert ISSUE_TRANSITIONS["resolved"] == {"closed", "reopened"}
    assert ISSUE_TRANSITIONS["closed"] == {"reopened"}
    assert ISSUE_TRANSITIONS["reopened"] == {"confirmed", "in_progress"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_issue_model.py -v`
Expected: FAIL with `ImportError: cannot import name 'Issue' from 'app.db.models'`

- [ ] **Step 3: Insert the `Issue` model and `ISSUE_TRANSITIONS` constant**

In `app/db/models.py`, immediately after the end of `QualityIncident` (the line `resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)` that closes that class, currently line 885) and before `class ComplianceFramework(Base):` (currently line 887), insert:

```python


class Issue(Base):
    __tablename__ = "dq_issues"

    issue_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    issue_type: Mapped[str] = mapped_column(String(20), default="manual")
    status: Mapped[str] = mapped_column(String(20), default="new", index=True)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    subdomain_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True, index=True)
    source_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    rule_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    run_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    alert_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    assigned_team_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("teams.team_id"), nullable=True)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reopen_count: Mapped[int] = mapped_column(Integer, default=0)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


ISSUE_TRANSITIONS: dict[str, set[str]] = {
    "new":         {"confirmed", "closed"},
    "confirmed":   {"in_progress", "closed"},
    "in_progress": {"blocked", "resolved", "confirmed"},
    "blocked":     {"in_progress"},
    "resolved":    {"closed", "reopened"},
    "closed":      {"reopened"},
    "reopened":    {"confirmed", "in_progress"},
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_issue_model.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py tests/test_issue_model.py
git commit -m "feat(issues): add Issue model and ISSUE_TRANSITIONS state machine"
```

---

## Task 2: Migration `0020_issues.py`

**Files:**
- Create: `migrations/versions/0020_issues.py`

- [ ] **Step 1: Write the migration file**

Create `migrations/versions/0020_issues.py`:

```python
"""issue intake & lifecycle: add dq_issues table"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dq_issues",
        sa.Column("issue_id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("issue_type", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("severity", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("domain_id", sa.String(36), nullable=True),
        sa.Column("subdomain_id", sa.String(36), nullable=True),
        sa.Column("asset_id", sa.String(36), nullable=True),
        sa.Column("source_id", sa.String(36), nullable=True),
        sa.Column("rule_id", sa.String(36), nullable=True),
        sa.Column("run_id", sa.String(36), nullable=True),
        sa.Column("alert_id", sa.String(36), nullable=True),
        sa.Column("assigned_team_id", sa.String(36), nullable=True),
        sa.Column("assigned_to", sa.String(200), nullable=True),
        sa.Column("created_by", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("reopen_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("resolution_note", sa.Text(), nullable=True),
    )
    op.create_index("ix_dq_issues_status", "dq_issues", ["status"])
    op.create_index("ix_dq_issues_asset_id", "dq_issues", ["asset_id"])
    op.create_index("ix_dq_issues_domain_id", "dq_issues", ["domain_id"])


def downgrade() -> None:
    op.drop_index("ix_dq_issues_domain_id", table_name="dq_issues")
    op.drop_index("ix_dq_issues_asset_id", table_name="dq_issues")
    op.drop_index("ix_dq_issues_status", table_name="dq_issues")
    op.drop_table("dq_issues")
```

- [ ] **Step 2: Verify the migration is syntactically valid and chains correctly**

`alembic.ini` points at a Snowflake placeholder URL that `env.py` overrides at runtime, so `alembic upgrade head` cannot run in this environment. Instead verify the module compiles and its revision metadata chains onto `0019`:

Run:
```bash
python -m py_compile migrations/versions/0020_issues.py
python - <<'EOF'
import importlib.util
spec = importlib.util.spec_from_file_location("m0020", "migrations/versions/0020_issues.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
assert m.revision == "0020"
assert m.down_revision == "0019"
print("OK", m.revision, "->", m.down_revision)
EOF
```
Expected: `OK 0020 -> 0019` with no errors.

- [ ] **Step 3: Commit**

```bash
git add migrations/versions/0020_issues.py
git commit -m "feat(issues): add dq_issues table migration"
```

---

## Task 3: `app/api/issues.py` — core endpoints + tests

**Files:**
- Create: `app/api/issues.py`
- Test: `tests/test_issues_api.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_issues_api.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from app.db.models import Issue, ISSUE_TRANSITIONS


ADMIN = {"email": "admin@example.com", "role": "admin", "user_id": "u1", "domain_id": None}


def _make_issue(**overrides):
    issue = MagicMock(spec=Issue)
    issue.issue_id = overrides.get("issue_id", "iss-1")
    issue.title = overrides.get("title", "Null values in customer_id")
    issue.description = overrides.get("description", "desc")
    issue.issue_type = overrides.get("issue_type", "manual")
    issue.status = overrides.get("status", "new")
    issue.severity = overrides.get("severity", "medium")
    issue.domain_id = overrides.get("domain_id")
    issue.subdomain_id = overrides.get("subdomain_id")
    issue.asset_id = overrides.get("asset_id")
    issue.source_id = overrides.get("source_id")
    issue.rule_id = overrides.get("rule_id")
    issue.run_id = overrides.get("run_id")
    issue.alert_id = overrides.get("alert_id")
    issue.assigned_team_id = overrides.get("assigned_team_id")
    issue.assigned_to = overrides.get("assigned_to")
    issue.created_by = overrides.get("created_by", "admin@example.com")
    issue.reopen_count = overrides.get("reopen_count", 0)
    issue.resolution_note = overrides.get("resolution_note")
    issue.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))
    issue.updated_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))
    issue.resolved_at = overrides.get("resolved_at")
    issue.closed_at = overrides.get("closed_at")
    return issue


@pytest.mark.asyncio
async def test_list_issues_empty():
    from app.api.issues import list_issues

    db = AsyncMock()
    count_result = MagicMock()
    count_result.scalar_one.return_value = 0
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = []
    db.execute.side_effect = [count_result, list_result]

    out = await list_issues(
        status=None, severity=None, issue_type=None, asset_id=None, domain_id=None,
        rule_id=None, alert_id=None, run_id=None, assigned_team_id=None, assigned_to=None,
        limit=100, offset=0, db=db, user=ADMIN,
    )
    assert out == {"total": 0, "limit": 100, "offset": 0, "items": []}


@pytest.mark.asyncio
async def test_list_issues_returns_items():
    from app.api.issues import list_issues

    issue = _make_issue()
    db = AsyncMock()
    count_result = MagicMock()
    count_result.scalar_one.return_value = 1
    list_result = MagicMock()
    list_result.scalars.return_value.all.return_value = [issue]
    db.execute.side_effect = [count_result, list_result]

    out = await list_issues(
        status=None, severity=None, issue_type=None, asset_id=None, domain_id=None,
        rule_id=None, alert_id=None, run_id=None, assigned_team_id=None, assigned_to=None,
        limit=100, offset=0, db=db, user=ADMIN,
    )
    assert out["total"] == 1
    assert out["items"][0]["issue_id"] == "iss-1"
    assert out["items"][0]["status"] == "new"


@pytest.mark.asyncio
async def test_issue_stats():
    from app.api.issues import issue_stats

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.all.return_value = [
        MagicMock(status="new", count=2),
        MagicMock(status="resolved", count=3),
    ]
    db.execute.return_value = result_mock

    out = await issue_stats(db=db, user=ADMIN)
    assert out["by_status"]["new"] == 2
    assert out["by_status"]["resolved"] == 3
    assert out["open_count"] == 2


@pytest.mark.asyncio
async def test_create_issue_requires_title():
    from app.api.issues import create_issue

    db = AsyncMock()
    with pytest.raises(HTTPException) as exc_info:
        await create_issue(body={}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_create_issue_manual_minimal():
    from app.api.issues import create_issue

    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    async def fake_refresh(obj):
        obj.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))
        obj.updated_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))

    db.refresh = AsyncMock(side_effect=fake_refresh)

    body = {"title": "Suspicious spike in null rate", "severity": "high"}
    result = await create_issue(body=body, db=db, user=ADMIN)

    assert result["title"] == "Suspicious spike in null rate"
    assert result["status"] == "new"
    assert result["severity"] == "high"
    assert result["issue_type"] == "manual"
    assert result["created_by"] == "admin@example.com"
    assert db.add.call_count == 2  # Issue row + AuditLog row
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_issue_with_asset_derives_domain():
    from app.api.issues import create_issue

    asset = MagicMock(domain_id="dom-1", subdomain_id="sub-1", connection_id="conn-1")
    db = AsyncMock()
    asset_result = MagicMock()
    asset_result.scalar_one_or_none.return_value = asset
    db.execute.return_value = asset_result
    db.add = MagicMock()
    db.commit = AsyncMock()

    async def fake_refresh(obj):
        obj.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))
        obj.updated_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))

    db.refresh = AsyncMock(side_effect=fake_refresh)

    body = {"title": "Row count drop", "asset_id": "asset-1", "issue_type": "alert", "severity": "critical"}
    result = await create_issue(body=body, db=db, user=ADMIN)

    assert result["domain_id"] == "dom-1"
    assert result["subdomain_id"] == "sub-1"
    assert result["source_id"] == "conn-1"
    assert result["issue_type"] == "alert"


@pytest.mark.asyncio
async def test_create_issue_asset_not_found():
    from app.api.issues import create_issue

    db = AsyncMock()
    asset_result = MagicMock()
    asset_result.scalar_one_or_none.return_value = None
    db.execute.return_value = asset_result

    with pytest.raises(HTTPException) as exc_info:
        await create_issue(body={"title": "x", "asset_id": "missing"}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_issue_not_found():
    from app.api.issues import get_issue

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.first.return_value = None
    db.execute.return_value = result_mock

    with pytest.raises(HTTPException) as exc_info:
        await get_issue(issue_id="missing", db=db, user=ADMIN)
    assert exc_info.value.status_code == 404


def test_router_registered():
    from app.api.issues import router
    paths = {r.path for r in router.routes}
    assert "/issues" in paths
    assert "/issues/enriched" in paths
    assert "/issues/stats" in paths
    assert "/issues/{issue_id}" in paths
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_issues_api.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.api.issues'`

- [ ] **Step 3: Create `app/api/issues.py` with core endpoints**

Create `app/api/issues.py`:

```python
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from app.db.database import get_db
from app.db.models import Issue, ISSUE_TRANSITIONS, Asset, AssetSourceMeta, DQRule, Team, AuditLog, gen_uuid, now as model_now
from app.core.security import get_current_user, require_write, check_domain_access, apply_domain_filter

router = APIRouter(prefix="/issues", tags=["Issues"])


def _fmt_issue(issue: Issue, extra: dict = {}) -> dict:
    return {
        "issue_id":          issue.issue_id,
        "title":             issue.title,
        "description":       issue.description,
        "issue_type":        issue.issue_type,
        "status":            issue.status,
        "severity":          issue.severity,
        "domain_id":         issue.domain_id,
        "subdomain_id":      issue.subdomain_id,
        "asset_id":          issue.asset_id,
        "source_id":         issue.source_id,
        "rule_id":           issue.rule_id,
        "run_id":            issue.run_id,
        "alert_id":          issue.alert_id,
        "assigned_team_id":  issue.assigned_team_id,
        "assigned_to":       issue.assigned_to,
        "created_by":        issue.created_by,
        "created_at":        issue.created_at.isoformat() if issue.created_at else None,
        "updated_at":        issue.updated_at.isoformat() if issue.updated_at else None,
        "resolved_at":       issue.resolved_at.isoformat() if issue.resolved_at else None,
        "closed_at":         issue.closed_at.isoformat() if issue.closed_at else None,
        "reopen_count":      issue.reopen_count,
        "resolution_note":   issue.resolution_note,
        **extra,
    }


def _enrich_query():
    return (
        select(Issue, Asset, AssetSourceMeta, DQRule, Team)
        .outerjoin(Asset, Issue.asset_id == Asset.asset_id)
        .outerjoin(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
        .outerjoin(DQRule, Issue.rule_id == DQRule.rule_id)
        .outerjoin(Team, Issue.assigned_team_id == Team.team_id)
    )


def _enrich_extra(asset, source_meta, rule, team) -> dict:
    return {
        "asset_name":       (asset.display_name or asset.physical_name) if asset else None,
        "sf_database_name": source_meta.sf_database_name if source_meta else None,
        "sf_schema_name":   source_meta.sf_schema_name if source_meta else None,
        "sf_table_name":    source_meta.sf_table_name if source_meta else None,
        "rule_name":        rule.rule_name if rule else None,
        "assigned_team_name": team.team_name if team else None,
    }


def _apply_filters(q, *, status, severity, issue_type, asset_id, domain_id, rule_id, alert_id, run_id, assigned_team_id, assigned_to):
    if status:
        q = q.where(Issue.status == status)
    if severity:
        q = q.where(Issue.severity == severity)
    if issue_type:
        q = q.where(Issue.issue_type == issue_type)
    if asset_id:
        q = q.where(Issue.asset_id == asset_id)
    if domain_id:
        q = q.where(Issue.domain_id == domain_id)
    if rule_id:
        q = q.where(Issue.rule_id == rule_id)
    if alert_id:
        q = q.where(Issue.alert_id == alert_id)
    if run_id:
        q = q.where(Issue.run_id == run_id)
    if assigned_team_id:
        q = q.where(Issue.assigned_team_id == assigned_team_id)
    if assigned_to:
        q = q.where(Issue.assigned_to == assigned_to)
    return q


@router.get("")
async def list_issues(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    issue_type: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    rule_id: Optional[str] = Query(None),
    alert_id: Optional[str] = Query(None),
    run_id: Optional[str] = Query(None),
    assigned_team_id: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    base = _apply_filters(
        select(Issue), status=status, severity=severity, issue_type=issue_type, asset_id=asset_id,
        domain_id=domain_id, rule_id=rule_id, alert_id=alert_id, run_id=run_id,
        assigned_team_id=assigned_team_id, assigned_to=assigned_to,
    )
    base = apply_domain_filter(base, Issue.domain_id, user)

    total_res = await db.execute(select(func.count()).select_from(base.subquery()))
    total = total_res.scalar_one()

    result = await db.execute(base.order_by(desc(Issue.created_at)).limit(limit).offset(offset))
    items = [_fmt_issue(i) for i in result.scalars().all()]
    return {"total": total, "limit": limit, "offset": offset, "items": items}


@router.get("/enriched")
async def list_issues_enriched(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    issue_type: Optional[str] = Query(None),
    asset_id: Optional[str] = Query(None),
    domain_id: Optional[str] = Query(None),
    rule_id: Optional[str] = Query(None),
    alert_id: Optional[str] = Query(None),
    run_id: Optional[str] = Query(None),
    assigned_team_id: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = _apply_filters(
        _enrich_query(), status=status, severity=severity, issue_type=issue_type, asset_id=asset_id,
        domain_id=domain_id, rule_id=rule_id, alert_id=alert_id, run_id=run_id,
        assigned_team_id=assigned_team_id, assigned_to=assigned_to,
    )
    q = apply_domain_filter(q, Issue.domain_id, user)
    q = q.order_by(desc(Issue.created_at)).limit(limit).offset(offset)

    result = await db.execute(q)
    return [
        _fmt_issue(issue, _enrich_extra(asset, source_meta, rule, team))
        for issue, asset, source_meta, rule, team in result.all()
    ]


@router.get("/stats")
async def issue_stats(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    q = select(Issue.status, func.count().label("count")).group_by(Issue.status)
    q = apply_domain_filter(q, Issue.domain_id, user)
    result = await db.execute(q)
    by_status = {row.status: row.count for row in result.all()}
    open_count = sum(c for s, c in by_status.items() if s not in ("resolved", "closed"))
    return {"by_status": by_status, "open_count": open_count}


@router.post("")
async def create_issue(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    title = body.get("title")
    if not title:
        raise HTTPException(400, "title is required")

    domain_id = body.get("domain_id")
    subdomain_id = body.get("subdomain_id")
    source_id = None
    asset_id = body.get("asset_id")
    if asset_id:
        result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
        asset = result.scalar_one_or_none()
        if not asset:
            raise HTTPException(404, "Asset not found")
        domain_id = asset.domain_id
        subdomain_id = asset.subdomain_id
        source_id = asset.connection_id

    check_domain_access(user, domain_id)

    now_dt = model_now()
    issue = Issue(
        issue_id=gen_uuid(),
        title=title,
        description=body.get("description"),
        issue_type=body.get("issue_type", "manual"),
        status="new",
        severity=body.get("severity", "medium"),
        domain_id=domain_id,
        subdomain_id=subdomain_id,
        asset_id=asset_id,
        source_id=source_id,
        rule_id=body.get("rule_id"),
        run_id=body.get("run_id"),
        alert_id=body.get("alert_id"),
        assigned_team_id=body.get("assigned_team_id"),
        assigned_to=body.get("assigned_to"),
        created_by=user.get("email"),
        created_at=now_dt,
        updated_at=now_dt,
    )
    db.add(issue)

    db.add(AuditLog(
        audit_id=gen_uuid(),
        user_email=user.get("email"),
        action="create",
        entity_type="issue",
        entity_id=issue.issue_id,
        old_value=None,
        new_value={"status": "new", "title": title},
        created_at=now_dt,
    ))

    await db.commit()
    await db.refresh(issue)
    return _fmt_issue(issue)


@router.get("/{issue_id}")
async def get_issue(issue_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(_enrich_query().where(Issue.issue_id == issue_id))
    row = result.first()
    if not row:
        raise HTTPException(404, "Issue not found")
    issue, asset, source_meta, rule, team = row
    check_domain_access(user, issue.domain_id)
    return _fmt_issue(issue, _enrich_extra(asset, source_meta, rule, team))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_issues_api.py -v`
Expected: all tests except those exercising `update_issue`/`transition_issue`/`reopen_issue`/`get_issue_audit` PASS. The router-path test for `/issues/{issue_id}` should pass since the route is already declared. (Tests for the remaining endpoints are added in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add app/api/issues.py tests/test_issues_api.py
git commit -m "feat(issues): add core Issue list/enriched/stats/create/get endpoints"
```

---

## Task 4: `app/api/issues.py` — update, transition, reopen, audit endpoints + tests

**Files:**
- Modify: `app/api/issues.py`
- Modify: `tests/test_issues_api.py`

- [ ] **Step 1: Append the failing tests**

Append to `tests/test_issues_api.py`:

```python
@pytest.mark.asyncio
async def test_update_issue_changed_fields_audited():
    from app.api.issues import update_issue

    issue = _make_issue(title="Old title", severity="low")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await update_issue(issue_id="iss-1", body={"title": "New title", "severity": "low"}, db=db, user=ADMIN)
    assert out["title"] == "New title"
    assert issue.title == "New title"
    db.add.assert_called_once()  # only AuditLog — severity unchanged so not counted


@pytest.mark.asyncio
async def test_update_issue_not_found():
    from app.api.issues import update_issue

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute.return_value = result_mock

    with pytest.raises(HTTPException) as exc_info:
        await update_issue(issue_id="missing", body={"title": "x"}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_transition_issue_valid():
    from app.api.issues import transition_issue

    issue = _make_issue(status="new")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await transition_issue(issue_id="iss-1", body={"status": "confirmed"}, db=db, user=ADMIN)
    assert out["status"] == "confirmed"
    assert issue.status == "confirmed"


@pytest.mark.asyncio
async def test_transition_issue_invalid():
    from app.api.issues import transition_issue

    issue = _make_issue(status="new")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock

    with pytest.raises(HTTPException) as exc_info:
        await transition_issue(issue_id="iss-1", body={"status": "resolved"}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_transition_to_resolved_sets_resolved_at_and_note():
    from app.api.issues import transition_issue

    issue = _make_issue(status="in_progress")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await transition_issue(
        issue_id="iss-1", body={"status": "resolved", "resolution_note": "Fixed upstream job"}, db=db, user=ADMIN,
    )
    assert out["status"] == "resolved"
    assert issue.resolution_note == "Fixed upstream job"
    assert issue.resolved_at is not None


@pytest.mark.asyncio
async def test_transition_to_reopened_clears_resolved_and_increments_count():
    from app.api.issues import transition_issue

    issue = _make_issue(status="resolved", reopen_count=0, resolved_at=MagicMock(isoformat=MagicMock(return_value="2026-06-01T00:00:00")))
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await transition_issue(issue_id="iss-1", body={"status": "reopened"}, db=db, user=ADMIN)
    assert out["status"] == "reopened"
    assert issue.reopen_count == 1
    assert issue.resolved_at is None


@pytest.mark.asyncio
async def test_reopen_issue_from_resolved():
    from app.api.issues import reopen_issue

    issue = _make_issue(status="resolved", reopen_count=0)
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    out = await reopen_issue(issue_id="iss-1", body={}, db=db, user=ADMIN)
    assert out["status"] == "reopened"
    assert issue.reopen_count == 1


@pytest.mark.asyncio
async def test_reopen_issue_invalid_status():
    from app.api.issues import reopen_issue

    issue = _make_issue(status="new")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = issue
    db.execute.return_value = result_mock

    with pytest.raises(HTTPException) as exc_info:
        await reopen_issue(issue_id="iss-1", body={}, db=db, user=ADMIN)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_get_issue_audit():
    from app.api.issues import get_issue_audit

    log = MagicMock()
    log.audit_id = "audit-1"
    log.user_email = "admin@example.com"
    log.action = "create"
    log.old_value = None
    log.new_value = {"status": "new"}
    log.created_at = MagicMock(isoformat=MagicMock(return_value="2026-06-12T00:00:00"))

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalars.return_value.all.return_value = [log]
    db.execute.return_value = result_mock

    out = await get_issue_audit(issue_id="iss-1", db=db, user=ADMIN)
    assert out["items"][0]["audit_id"] == "audit-1"
    assert out["items"][0]["action"] == "create"


def test_action_routes_registered():
    from app.api.issues import router
    paths = {r.path for r in router.routes}
    assert "/issues/{issue_id}/transition" in paths
    assert "/issues/{issue_id}/reopen" in paths
    assert "/issues/{issue_id}/audit" in paths
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_issues_api.py -v`
Expected: FAIL with `ImportError: cannot import name 'update_issue' from 'app.api.issues'` (and similar for `transition_issue`, `reopen_issue`, `get_issue_audit`).

- [ ] **Step 3: Append the remaining endpoints**

Append to `app/api/issues.py`:

```python
@router.put("/{issue_id}")
async def update_issue(
    issue_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")
    check_domain_access(user, issue.domain_id)

    editable = ("title", "description", "severity", "assigned_to", "assigned_team_id")
    old_value, new_value = {}, {}
    for field in editable:
        if field in body and body[field] != getattr(issue, field):
            old_value[field] = getattr(issue, field)
            new_value[field] = body[field]
            setattr(issue, field, body[field])

    if new_value:
        issue.updated_at = model_now()
        db.add(AuditLog(
            audit_id=gen_uuid(), user_email=user.get("email"), action="update",
            entity_type="issue", entity_id=issue.issue_id,
            old_value=old_value, new_value=new_value, created_at=model_now(),
        ))
        await db.commit()
        await db.refresh(issue)
    return _fmt_issue(issue)


@router.post("/{issue_id}/transition")
async def transition_issue(
    issue_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    new_status = body.get("status")
    if not new_status:
        raise HTTPException(400, "status is required")

    result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")
    check_domain_access(user, issue.domain_id)

    allowed = ISSUE_TRANSITIONS.get(issue.status, set())
    if new_status not in allowed:
        raise HTTPException(400, f"Cannot transition from '{issue.status}' to '{new_status}'")

    old_status = issue.status
    now_dt = model_now()
    issue.status = new_status
    issue.updated_at = now_dt

    if new_status == "resolved":
        issue.resolved_at = now_dt
    elif new_status == "closed":
        issue.closed_at = now_dt
    elif new_status == "reopened":
        issue.reopen_count = (issue.reopen_count or 0) + 1
        issue.resolved_at = None
        issue.closed_at = None

    if body.get("resolution_note"):
        issue.resolution_note = body["resolution_note"]

    db.add(AuditLog(
        audit_id=gen_uuid(), user_email=user.get("email"), action="status_change",
        entity_type="issue", entity_id=issue.issue_id,
        old_value={"status": old_status}, new_value={"status": new_status}, created_at=now_dt,
    ))
    await db.commit()
    await db.refresh(issue)
    return _fmt_issue(issue)


@router.post("/{issue_id}/reopen")
async def reopen_issue(
    issue_id: str,
    body: dict = Body(default={}),
    db: AsyncSession = Depends(get_db),
    user=Depends(require_write),
):
    result = await db.execute(select(Issue).where(Issue.issue_id == issue_id))
    issue = result.scalar_one_or_none()
    if not issue:
        raise HTTPException(404, "Issue not found")
    check_domain_access(user, issue.domain_id)

    if issue.status not in ("resolved", "closed"):
        raise HTTPException(400, f"Cannot reopen an issue with status '{issue.status}'")

    old_status = issue.status
    now_dt = model_now()
    issue.status = "reopened"
    issue.updated_at = now_dt
    issue.reopen_count = (issue.reopen_count or 0) + 1
    issue.resolved_at = None
    issue.closed_at = None
    if body and body.get("resolution_note"):
        issue.resolution_note = body["resolution_note"]

    db.add(AuditLog(
        audit_id=gen_uuid(), user_email=user.get("email"), action="status_change",
        entity_type="issue", entity_id=issue.issue_id,
        old_value={"status": old_status}, new_value={"status": "reopened"}, created_at=now_dt,
    ))
    await db.commit()
    await db.refresh(issue)
    return _fmt_issue(issue)


@router.get("/{issue_id}/audit")
async def get_issue_audit(issue_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == "issue", AuditLog.entity_id == issue_id)
        .order_by(desc(AuditLog.created_at))
    )
    logs = result.scalars().all()
    return {
        "items": [
            {
                "audit_id": l.audit_id, "user_email": l.user_email, "action": l.action,
                "old_value": l.old_value, "new_value": l.new_value,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ]
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_issues_api.py tests/test_issue_model.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/issues.py tests/test_issues_api.py
git commit -m "feat(issues): add update, transition, reopen, and audit endpoints"
```

---

## Task 5: Register `issues.router` in `app/main.py`

**Files:**
- Modify: `app/main.py:28` (import group), `app/main.py:206` (router registration)
- Test: `tests/test_issues_api.py`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_issues_api.py`:

```python
def test_issues_router_mounted_in_app():
    from app.main import app
    paths = [r.path for r in app.routes]
    assert any(p == "/issues" for p in paths)
    assert any(p == "/issues/enriched" for p in paths)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_issues_api.py::test_issues_router_mounted_in_app -v`
Expected: FAIL with `AssertionError` (router not yet mounted).

- [ ] **Step 3: Register the router**

In `app/main.py`, line 28, change:
```python
    governance, contracts, compliance, cost, incidents,
```
to:
```python
    governance, contracts, compliance, cost, incidents, issues,
```

In `app/main.py`, after line 206 (`app.include_router(incidents.router)`), add:
```python
app.include_router(issues.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_issues_api.py::test_issues_router_mounted_in_app -v`
Expected: PASS

- [ ] **Step 5: Run the full backend test suite**

Run: `pytest -v`
Expected: all PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add app/main.py tests/test_issues_api.py
git commit -m "feat(issues): register issues router in app"
```

---

## Task 6: Frontend types — `frontend/src/lib/types.ts`

**Files:**
- Modify: `frontend/src/lib/types.ts` (append at end of file)

- [ ] **Step 1: Append Issue types**

Append to the end of `frontend/src/lib/types.ts`:

```typescript

export type IssueType = 'rule_failure' | 'alert' | 'failed_run' | 'manual'
export type IssueStatus = 'new' | 'confirmed' | 'in_progress' | 'blocked' | 'resolved' | 'closed' | 'reopened'
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export interface Issue {
  issue_id: string
  title: string
  description: string | null
  issue_type: IssueType
  status: IssueStatus
  severity: IssueSeverity
  domain_id: string | null
  subdomain_id: string | null
  asset_id: string | null
  source_id: string | null
  rule_id: string | null
  run_id: string | null
  alert_id: string | null
  assigned_team_id: string | null
  assigned_to: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
  reopen_count: number
  resolution_note: string | null
  asset_name?: string | null
  sf_database_name?: string | null
  sf_schema_name?: string | null
  sf_table_name?: string | null
  rule_name?: string | null
  assigned_team_name?: string | null
}

export interface IssueAuditEntry {
  audit_id: string
  user_email: string | null
  action: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  created_at: string
}

export const ISSUE_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  new:         ['confirmed', 'closed'],
  confirmed:   ['in_progress', 'closed'],
  in_progress: ['blocked', 'resolved', 'confirmed'],
  blocked:     ['in_progress'],
  resolved:    ['closed', 'reopened'],
  closed:      ['reopened'],
  reopened:    ['confirmed', 'in_progress'],
}
```

- [ ] **Step 2: Verify the file still type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors related to `types.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(issues): add Issue types and ISSUE_TRANSITIONS to frontend"
```

---

## Task 7: Frontend API proxy routes

**Files:**
- Modify: `frontend/src/app/api/issues/route.ts` (rewrite)
- Create: `frontend/src/app/api/issues/[id]/transition/route.ts`
- Create: `frontend/src/app/api/issues/[id]/reopen/route.ts`
- Create: `frontend/src/app/api/issues/[id]/audit/route.ts`

- [ ] **Step 1: Rewrite `frontend/src/app/api/issues/route.ts`**

Replace the entire contents of `frontend/src/app/api/issues/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const params = new URLSearchParams(req.nextUrl.searchParams)
    if (!params.has('limit')) params.set('limit', '200')
    const res = await fetch(`${BACKEND}/issues/enriched?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...rest } = body
    const res = await fetch(`${BACKEND}/issues/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rest),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `frontend/src/app/api/issues/[id]/transition/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND}/issues/${id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create `frontend/src/app/api/issues/[id]/reopen/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const res = await fetch(`${BACKEND}/issues/${id}/reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 4: Create `frontend/src/app/api/issues/[id]/audit/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const res = await fetch(`${BACKEND}/issues/${id}/audit`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({ items: [] }))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 5: Verify the project still builds**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors in the new/changed route files.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/issues
git commit -m "feat(issues): rewrite issues API proxy and add transition/reopen/audit routes"
```

---

## Task 8: `CreateIssueModal` component

**Files:**
- Create: `frontend/src/components/issues/CreateIssueModal.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/issues/CreateIssueModal.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Issue, IssueSeverity, IssueType } from '@/lib/types'

const inputStyle: CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: '13px',
  border: '1px solid var(--border)', borderRadius: '6px',
  background: 'var(--background)', color: 'var(--foreground)',
}
const labelStyle: CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block',
}
const cancelBtnStyle: CSSProperties = {
  padding: '7px 14px', fontSize: '12px', borderRadius: '6px',
  border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer',
}
const primaryBtnStyle: CSSProperties = {
  padding: '7px 14px', fontSize: '12px', borderRadius: '6px',
  border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600,
}

export interface CreateIssuePrefill {
  assetId?: string | null
  ruleId?: string | null
  runId?: string | null
  alertId?: string | null
  issueType?: IssueType
  severity?: IssueSeverity
  title?: string
  domainId?: string | null
}

export default function CreateIssueModal({
  prefill,
  onClose,
  onCreated,
}: {
  prefill?: CreateIssuePrefill
  onClose: () => void
  onCreated: (issue: Issue) => void
}) {
  const [title, setTitle] = useState(prefill?.title ?? '')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<IssueSeverity>(prefill?.severity ?? 'medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          severity,
          issue_type: prefill?.issueType ?? 'manual',
          asset_id: prefill?.assetId ?? undefined,
          rule_id: prefill?.ruleId ?? undefined,
          run_id: prefill?.runId ?? undefined,
          alert_id: prefill?.alertId ?? undefined,
          domain_id: prefill?.domainId ?? undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Failed to create issue (${res.status})`)
      }
      const issue: Issue = await res.json()
      onCreated(issue)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create issue')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--surface)', borderRadius: '10px', padding: '20px', width: '440px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Create Issue</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div>
          <label style={labelStyle}>Title *</label>
          <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Short summary of the issue" />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional details" />
        </div>

        <div>
          <label style={labelStyle}>Severity</label>
          <select style={inputStyle} value={severity} onChange={e => setSeverity(e.target.value as IssueSeverity)}>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {error && <div style={{ fontSize: '12px', color: 'var(--status-error-text)' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
          <button onClick={submit} disabled={submitting} style={{ ...primaryBtnStyle, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'default' : 'pointer' }}>
            {submitting ? 'Creating…' : 'Create Issue'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors in `CreateIssueModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/issues/CreateIssueModal.tsx
git commit -m "feat(issues): add reusable CreateIssueModal component"
```

---

## Task 9: `IssueDetailPanel` component

**Files:**
- Create: `frontend/src/components/issues/IssueDetailPanel.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/issues/IssueDetailPanel.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Issue, IssueAuditEntry, IssueStatus, IssueSeverity, ISSUE_TRANSITIONS } from '@/lib/types'

const SEV_CFG: Record<IssueSeverity, { bg: string; color: string; label: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   label: 'Critical' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'High' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Medium' },
  low:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'Low' },
}

const ST_CFG: Record<IssueStatus, { bg: string; color: string; label: string }> = {
  new:         { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'New' },
  confirmed:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Confirmed' },
  in_progress: { bg: 'var(--accent-bg)',         color: 'var(--accent)',              label: 'In Progress' },
  blocked:     { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   label: 'Blocked' },
  resolved:    { bg: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)',      label: 'Resolved' },
  closed:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'Closed' },
  reopened:    { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Reopened' },
}

const NEEDS_NOTE: IssueStatus[] = ['resolved', 'closed']

const metaLabelStyle: CSSProperties = { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }
const actionBtnStyle: CSSProperties = { padding: '5px 10px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }
const cancelBtnStyle: CSSProperties = { padding: '5px 10px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', cursor: 'pointer' }
const primaryBtnStyle: CSSProperties = { padding: '5px 10px', fontSize: '11px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }
const fieldInputStyle: CSSProperties = { fontSize: '12px', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', width: '100%' }

function fmtDate(s?: string | null) {
  if (!s) return '—'
  try { return new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) } catch { return s }
}

function describeAction(a: IssueAuditEntry): string {
  if (a.action === 'create') return 'created this issue'
  if (a.action === 'status_change') {
    const from = (a.old_value as { status?: string } | null)?.status
    const to = (a.new_value as { status?: string } | null)?.status
    return `changed status from "${from ?? '?'}" to "${to ?? '?'}"`
  }
  if (a.action === 'update') {
    const fields = Object.keys(a.new_value ?? {})
    return `updated ${fields.join(', ') || 'issue'}`
  }
  return a.action
}

function MetaField({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  return (
    <div>
      <div style={metaLabelStyle}>{label}</div>
      {value && href ? (
        <Link href={href} style={{ fontSize: '12.5px', color: 'var(--accent)' }}>{value}</Link>
      ) : (
        <div style={{ fontSize: '12.5px', color: value ? 'var(--foreground)' : 'var(--text-muted)' }}>{value || '—'}</div>
      )}
    </div>
  )
}

export default function IssueDetailPanel({
  issue,
  onClose,
  onUpdated,
}: {
  issue: Issue
  onClose: () => void
  onUpdated: (issue: Issue) => void
}) {
  const [audit, setAudit] = useState<IssueAuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingStatus, setPendingStatus] = useState<IssueStatus | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    title: issue.title,
    description: issue.description ?? '',
    severity: issue.severity,
    assigned_to: issue.assigned_to ?? '',
  })

  useEffect(() => {
    setAuditLoading(true)
    fetch(`/api/issues/${issue.issue_id}/audit`)
      .then(r => r.json())
      .then(d => setAudit(Array.isArray(d.items) ? d.items : []))
      .catch(() => setAudit([]))
      .finally(() => setAuditLoading(false))
  }, [issue.issue_id])

  async function applyTransition(status: IssueStatus, note?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/issues/${issue.issue_id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(note ? { resolution_note: note } : {}) }),
      })
      if (!res.ok) throw new Error(`Failed to update status (${res.status})`)
      const updated = await res.json()
      onUpdated({ ...issue, ...updated })
      setPendingStatus(null)
      setResolutionNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setBusy(false)
    }
  }

  async function reopen(note?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/issues/${issue.issue_id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note ? { resolution_note: note } : {}),
      })
      if (!res.ok) throw new Error(`Failed to reopen (${res.status})`)
      const updated = await res.json()
      onUpdated({ ...issue, ...updated })
      setPendingStatus(null)
      setResolutionNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reopen issue')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/issues', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: issue.issue_id, ...editForm }),
      })
      if (!res.ok) throw new Error(`Failed to save (${res.status})`)
      const updated = await res.json()
      onUpdated({ ...issue, ...updated })
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save changes')
    } finally {
      setBusy(false)
    }
  }

  function handleTransitionClick(status: IssueStatus) {
    if (NEEDS_NOTE.includes(status)) {
      setPendingStatus(status)
    } else {
      applyTransition(status)
    }
  }

  const sev = SEV_CFG[issue.severity]
  const st = ST_CFG[issue.status]
  const nextStatuses = ISSUE_TRANSITIONS[issue.status] ?? []
  const canReopen = issue.status === 'resolved' || issue.status === 'closed'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ background: sev.bg, color: sev.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{sev.label}</span>
            <span style={{ background: st.bg, color: st.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{st.label}</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}>✕</button>
        </div>
        {editing ? (
          <input
            value={editForm.title}
            onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
            style={{ ...fieldInputStyle, fontSize: '14px', fontWeight: 700 }}
          />
        ) : (
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>{issue.title}</div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
          <MetaField label="Asset" value={issue.asset_name} href={issue.asset_id ? `/asset-registry?asset_id=${issue.asset_id}` : undefined} />
          <MetaField label="Rule" value={issue.rule_name} href={issue.rule_id ? `/rules?rule_id=${issue.rule_id}` : undefined} />
          <MetaField label="Run" value={issue.run_id} href={issue.run_id ? `/rule-runs/${issue.run_id}` : undefined} />
          <MetaField label="Alert" value={issue.alert_id ? 'View alert' : undefined} href={issue.alert_id ? `/alerts?alert_id=${issue.alert_id}` : undefined} />
          {editing ? (
            <div>
              <div style={metaLabelStyle}>Assignee</div>
              <input value={editForm.assigned_to} onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value }))} style={fieldInputStyle} />
            </div>
          ) : (
            <MetaField label="Assigned To" value={issue.assigned_to || issue.assigned_team_name} />
          )}
          <MetaField label="Created By" value={issue.created_by} />
          <MetaField label="Created At" value={fmtDate(issue.created_at)} />
          {issue.reopen_count > 0 && <MetaField label="Reopened" value={`${issue.reopen_count} time(s)`} />}
        </div>

        <div>
          <div style={metaLabelStyle}>Description</div>
          {editing ? (
            <textarea
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              style={{ ...fieldInputStyle, minHeight: '60px', resize: 'vertical' }}
            />
          ) : (
            <div style={{ fontSize: '12.5px', color: issue.description ? 'var(--foreground)' : 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
              {issue.description || 'No description provided'}
            </div>
          )}
        </div>

        {editing && (
          <div>
            <div style={metaLabelStyle}>Severity</div>
            <select
              value={editForm.severity}
              onChange={e => setEditForm(f => ({ ...f, severity: e.target.value as IssueSeverity }))}
              style={fieldInputStyle}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        )}

        {error && <div style={{ fontSize: '12px', color: 'var(--status-error-text)' }}>{error}</div>}

        {!editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={metaLabelStyle}>Actions</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {nextStatuses.map(s => (
                <button key={s} disabled={busy} onClick={() => handleTransitionClick(s)} style={actionBtnStyle}>
                  Move to {ST_CFG[s].label}
                </button>
              ))}
              {canReopen && (
                <button disabled={busy} onClick={() => setPendingStatus('reopened')} style={actionBtnStyle}>
                  Reopen
                </button>
              )}
              <button disabled={busy} onClick={() => setEditing(true)} style={actionBtnStyle}>
                Edit
              </button>
            </div>
            {pendingStatus && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px' }}>
                <div style={metaLabelStyle}>Resolution note (optional)</div>
                <textarea
                  value={resolutionNote}
                  onChange={e => setResolutionNote(e.target.value)}
                  style={{ ...fieldInputStyle, minHeight: '50px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  <button disabled={busy} onClick={() => { setPendingStatus(null); setResolutionNote('') }} style={cancelBtnStyle}>Cancel</button>
                  <button
                    disabled={busy}
                    onClick={() => pendingStatus === 'reopened' ? reopen(resolutionNote || undefined) : applyTransition(pendingStatus, resolutionNote || undefined)}
                    style={primaryBtnStyle}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {editing && (
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button disabled={busy} onClick={() => setEditing(false)} style={cancelBtnStyle}>Cancel</button>
            <button disabled={busy} onClick={saveEdit} style={primaryBtnStyle}>Save</button>
          </div>
        )}

        <div>
          <div style={metaLabelStyle}>Activity</div>
          {auditLoading ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading activity…</div>
          ) : audit.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No activity yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {audit.map(a => (
                <div key={a.audit_id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', borderLeft: '2px solid var(--border)', paddingLeft: '8px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--foreground)' }}>
                    <strong>{a.user_email || 'system'}</strong> {describeAction(a)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{fmtDate(a.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors in `IssueDetailPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/issues/IssueDetailPanel.tsx
git commit -m "feat(issues): add IssueDetailPanel slide-in component"
```

---

## Task 10: Rewrite `frontend/src/app/issues/page.tsx`

**Files:**
- Modify: `frontend/src/app/issues/page.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file**

Replace the entire contents of `frontend/src/app/issues/page.tsx` with:

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import IssueDetailPanel from '@/components/issues/IssueDetailPanel'
import CreateIssueModal from '@/components/issues/CreateIssueModal'
import { Issue, IssueStatus, IssueSeverity } from '@/lib/types'

const SEV_CFG: Record<IssueSeverity, { bg: string; color: string; label: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   label: 'Critical' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'High' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Medium' },
  low:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'Low' },
}

const ST_CFG: Record<IssueStatus, { bg: string; color: string; label: string }> = {
  new:         { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'New' },
  confirmed:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Confirmed' },
  in_progress: { bg: 'var(--accent-bg)',         color: 'var(--accent)',              label: 'In Progress' },
  blocked:     { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   label: 'Blocked' },
  resolved:    { bg: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)',      label: 'Resolved' },
  closed:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'Closed' },
  reopened:    { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Reopened' },
}

const STATUS_FILTERS: (IssueStatus | 'all')[] = ['all', 'new', 'confirmed', 'in_progress', 'blocked', 'resolved', 'closed', 'reopened']
const SEV_FILTERS: (IssueSeverity | 'all')[] = ['all', 'critical', 'high', 'medium', 'low']

const IN_PROGRESS_STATUSES: IssueStatus[] = ['confirmed', 'in_progress', 'blocked', 'reopened']

const pillStyle = (active: boolean): React.CSSProperties => ({
  padding: '4px 10px', fontSize: '11px', borderRadius: '12px', cursor: 'pointer',
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent-bg)' : 'transparent',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  textTransform: 'capitalize',
})

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusF, setStatusF] = useState<IssueStatus | 'all'>('all')
  const [sevF, setSevF] = useState<IssueSeverity | 'all'>('all')
  const [selected, setSelected] = useState<Issue | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch('/api/issues')
      .then(r => r.json())
      .then(data => setIssues(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load issues'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = issues.filter(i =>
    (statusF === 'all' || i.status === statusF) &&
    (sevF === 'all' || i.severity === sevF)
  )

  const groups = new Map<string, Issue[]>()
  for (const i of filtered) {
    const key = i.asset_name || (i.sf_table_name ? `${i.sf_schema_name}.${i.sf_table_name}` : 'Unassigned')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(i)
  }

  const counts = {
    new: issues.filter(i => i.status === 'new').length,
    inProgress: issues.filter(i => IN_PROGRESS_STATUSES.includes(i.status)).length,
    resolved: issues.filter(i => i.status === 'resolved').length,
    closed: issues.filter(i => i.status === 'closed').length,
    critical: issues.filter(i => i.severity === 'critical' && i.status !== 'resolved' && i.status !== 'closed').length,
  }

  const CARDS = [
    { label: 'New', value: counts.new, color: ST_CFG.new.color },
    { label: 'In Progress', value: counts.inProgress, color: ST_CFG.in_progress.color },
    { label: 'Resolved', value: counts.resolved, color: ST_CFG.resolved.color },
    { label: 'Closed', value: counts.closed, color: ST_CFG.closed.color },
    { label: 'Critical', value: counts.critical, color: SEV_CFG.critical.color },
  ]

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Issues</h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '7px 14px', fontSize: '12px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}
        >
          + Create Issue
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {CARDS.map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => setStatusF(s)} style={pillStyle(statusF === s)}>
              {s === 'all' ? 'All Statuses' : ST_CFG[s].label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {SEV_FILTERS.map(s => (
            <button key={s} onClick={() => setSevF(s)} style={pillStyle(sevF === s)}>
              {s === 'all' ? 'All Severities' : SEV_CFG[s].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading issues…</div>
      ) : error ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--status-error-text)', fontSize: '13px' }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No issues yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Array.from(groups.entries()).map(([dataset, items]) => (
            <div key={dataset}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                {dataset} ({items.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {items.map(issue => {
                  const sev = SEV_CFG[issue.severity]
                  const st = ST_CFG[issue.status]
                  return (
                    <div
                      key={issue.issue_id}
                      onClick={() => setSelected(issue)}
                      style={{
                        display: 'grid', gridTemplateColumns: '90px 1fr 120px 140px 100px', gap: '8px', alignItems: 'center',
                        padding: '8px 10px', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer',
                      }}
                    >
                      <span style={{ background: sev.bg, color: sev.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textAlign: 'center' }}>{sev.label}</span>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.title}</span>
                      <span style={{ background: st.bg, color: st.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textAlign: 'center' }}>{st.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.assigned_to || issue.assigned_team_name || 'Unassigned'}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{new Date(issue.created_at).toLocaleDateString()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 90vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', zIndex: 900, display: 'flex' }}>
          <IssueDetailPanel
            issue={selected}
            onClose={() => setSelected(null)}
            onUpdated={updated => {
              const merged = { ...selected, ...updated }
              setIssues(prev => prev.map(i => i.issue_id === merged.issue_id ? merged : i))
              setSelected(merged)
            }}
          />
        </div>
      )}

      {showCreate && (
        <CreateIssueModal
          onClose={() => setShowCreate(false)}
          onCreated={issue => { setShowCreate(false); setIssues(prev => [issue, ...prev]) }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check and lint**

Run:
```bash
cd frontend && npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Run `cd frontend && npm run dev` (and the backend separately if not already running), then visit `/issues`:
- Page loads with stat cards (New/In Progress/Resolved/Closed/Critical) and shows "No issues yet" if `dq_issues` is empty.
- Clicking "+ Create Issue" opens the modal; submitting a title creates an issue and it appears in the list.
- Clicking the new row opens the slide-in detail panel with status transition buttons matching `ISSUE_TRANSITIONS["new"]` (Move to Confirmed, Move to Closed).
- Clicking "Move to Confirmed" updates the status badge and adds an audit entry under Activity.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/issues/page.tsx
git commit -m "feat(issues): rewrite Issues page with real data, slide-in detail, and create modal"
```

---

## Task 11: Alerts page — "Create Issue" button

**Files:**
- Modify: `frontend/src/app/alerts/page.tsx`

- [ ] **Step 1: Add `assetId`/`ruleId` to `RecentAlert` and import `CreateIssueModal`**

In `frontend/src/app/alerts/page.tsx`, line 1-3, add the import:

```tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import CreateIssueModal from '@/components/issues/CreateIssueModal'
```

Update the `RecentAlert` interface (currently lines 10-16):

```tsx
interface RecentAlert {
  id: string; rule: string; dataset: string; severity: Severity
  message: string; channel: string; ts: string; ack: boolean
  rootCause: string; impact: string; recommendation: string
  affectedRecords: number; pipeline: string; alertType: string
  runId: string | null; assetId: string | null; ruleId: string | null
}
```

- [ ] **Step 2: Populate the new fields in the mapping**

In the `useEffect` that maps API data (around lines 248-264), add the two new fields to the mapped object, right after `runId`:

```tsx
          runId: a.run_id ? String(a.run_id) : null,
          assetId: a.asset_id ? String(a.asset_id) : null,
          ruleId: a.rule_id ? String(a.rule_id) : null,
```

- [ ] **Step 3: Add component state for the Create Issue modal**

In the `AlertsPage` component, alongside the existing state declarations (around line 241, after `const [showCreate, setShowCreate] = useState(false)`), add:

```tsx
  const [showCreateIssue, setShowCreateIssue] = useState(false)
  const [issueCreatedMsg, setIssueCreatedMsg] = useState<string | null>(null)
```

- [ ] **Step 4: Add the "Create Issue" button to the alert detail popup**

In the popup action-buttons block (around lines 509-518), add a "Create Issue" button after the "View Evidence" link:

```tsx
                  <div style={{ padding: '0 14px 14px', display: 'flex', gap: '6px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!popupAlert.ack && (
                        <button onClick={e => { ack(popupAlert.id, e); closePopup() }} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>✓ Acknowledge</button>
                      )}
                      {popupAlert.runId && (
                        <Link href={`/rule-runs/${popupAlert.runId}`} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--accent-bg)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '11px', textDecoration: 'none', fontWeight: 600 }}>
                          🔍 View Evidence
                        </Link>
                      )}
                      <button onClick={() => setShowCreateIssue(true)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                        🐞 Create Issue
                      </button>
                    </div>
                    {issueCreatedMsg && (
                      <div style={{ fontSize: '11px', color: 'var(--status-ok-text)' }}>{issueCreatedMsg}</div>
                    )}
                  </div>
```

This replaces the existing block that starts with `<div style={{ padding: '0 14px 14px', display: 'flex', gap: '6px' }}>` (the original lines 509-518).

- [ ] **Step 5: Render `CreateIssueModal` when `showCreateIssue` is true**

Near the end of the component's JSX, right after the closing of the detail popup `</>` / `)}` block (after line ~530 where the popup `<div>` closes, but still inside the page's top-level return), add:

```tsx
      {showCreateIssue && popupAlert && (
        <CreateIssueModal
          prefill={{
            issueType: 'alert',
            alertId: popupAlert.id,
            assetId: popupAlert.assetId,
            ruleId: popupAlert.ruleId,
            runId: popupAlert.runId,
            severity: popupAlert.severity === 'info' ? 'low' : popupAlert.severity,
            title: popupAlert.rule,
          }}
          onClose={() => setShowCreateIssue(false)}
          onCreated={issue => {
            setShowCreateIssue(false)
            setIssueCreatedMsg(`Issue ${issue.issue_id.slice(0, 8)} created`)
          }}
        />
      )}
```

Note: `CreateIssuePrefill.severity` is typed as `IssueSeverity` (`'critical' | 'high' | 'medium' | 'low'`), while alert `Severity` includes `'info'` — the ternary above maps `'info'` to `'low'` so the type checks.

- [ ] **Step 6: Clear the confirmation message when the popup closes**

Find the `closePopup` function and ensure it also clears `issueCreatedMsg` and `showCreateIssue`. If `closePopup` looks like:

```tsx
  function closePopup() {
    setPopupAlert(null)
    setPopupRule(null)
  }
```

change it to:

```tsx
  function closePopup() {
    setPopupAlert(null)
    setPopupRule(null)
    setShowCreateIssue(false)
    setIssueCreatedMsg(null)
  }
```

If `closePopup` does not exist under that exact name, locate the function that sets `popupAlert`/`popupRule` back to `null` (used by the overlay `onClick` and the `✕` button) and add the same two lines to it.

- [ ] **Step 7: Verify type-check and lint**

Run:
```bash
cd frontend && npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 8: Manual smoke test**

With both servers running, visit `/alerts`, click an alert to open its detail popup, click "🐞 Create Issue", fill in a title (prefilled from the alert's rule name) and submit. Verify:
- The modal closes and a "Issue <id> created" confirmation appears in the popup.
- The new issue appears on `/issues` with `issue_type: alert` and the linked `alert_id`/`asset_id`/`rule_id`/`run_id`.
- Existing "Acknowledge" / "View Evidence" buttons still work unchanged.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/alerts/page.tsx
git commit -m "feat(issues): add Create Issue button to alert detail popup"
```

---

## Task 12: Asset Detail Panel — "Issues" tab

**Files:**
- Create: `frontend/src/components/asset-registry/AssetIssuesTab.tsx`
- Modify: `frontend/src/components/asset-registry/AssetDetailPanel.tsx`

- [ ] **Step 1: Create `AssetIssuesTab.tsx`**

Create `frontend/src/components/asset-registry/AssetIssuesTab.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import CreateIssueModal from '@/components/issues/CreateIssueModal'
import IssueDetailPanel from '@/components/issues/IssueDetailPanel'
import { Issue, IssueSeverity, IssueStatus } from '@/lib/types'

const SEV_CFG: Record<IssueSeverity, { bg: string; color: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)' },
  low:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
}

const ST_CFG: Record<IssueStatus, { bg: string; color: string; label: string }> = {
  new:         { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'New' },
  confirmed:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Confirmed' },
  in_progress: { bg: 'var(--accent-bg)',         color: 'var(--accent)',              label: 'In Progress' },
  blocked:     { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   label: 'Blocked' },
  resolved:    { bg: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)',      label: 'Resolved' },
  closed:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', label: 'Closed' },
  reopened:    { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    label: 'Reopened' },
}

export default function AssetIssuesTab({ assetId, domainId }: { assetId: string; domainId?: string | null }) {
  const [items, setItems] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Issue | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/issues?asset_id=${assetId}&limit=50`)
      .then(r => r.json())
      .then(data => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [assetId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setShowCreate(true)}
          style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer', fontWeight: 600 }}
        >
          + Create Issue
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading issues…</div>
      ) : items.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
          No issues for this asset
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map(issue => {
            const sev = SEV_CFG[issue.severity]
            const st = ST_CFG[issue.status]
            return (
              <div
                key={issue.issue_id}
                onClick={() => setSelected(issue)}
                style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', gap: '8px', alignItems: 'center', padding: '6px 4px', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
              >
                <span style={{ background: sev.bg, color: sev.color, padding: '1px 4px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{issue.severity}</span>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.title}</span>
                <span style={{ background: st.bg, color: st.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, textAlign: 'center' }}>{st.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px, 90vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', zIndex: 900, display: 'flex' }}>
          <IssueDetailPanel
            issue={selected}
            onClose={() => setSelected(null)}
            onUpdated={updated => {
              const merged = { ...selected, ...updated }
              setItems(prev => prev.map(i => i.issue_id === merged.issue_id ? merged : i))
              setSelected(merged)
            }}
          />
        </div>
      )}

      {showCreate && (
        <CreateIssueModal
          prefill={{ assetId, issueType: 'manual', domainId }}
          onClose={() => setShowCreate(false)}
          onCreated={issue => { setShowCreate(false); setItems(prev => [issue, ...prev]) }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add an open-issue count fetch to `AssetDetailPanel`**

In `frontend/src/components/asset-registry/AssetDetailPanel.tsx`, add the import alongside the other tab imports (after line 8, `import AssetTrendsTab from './AssetTrendsTab'`):

```tsx
import AssetIssuesTab from './AssetIssuesTab'
```

- [ ] **Step 3: Extend the `Tab` type**

Change line 41 from:
```tsx
type Tab = 'overview' | 'profiling' | 'rules' | 'quality' | 'alerts' | 'trends'
```
to:
```tsx
type Tab = 'overview' | 'profiling' | 'rules' | 'quality' | 'alerts' | 'trends' | 'issues'
```

- [ ] **Step 4: Add open-issue count state and fetch**

In the `AssetDetailPanel` component, alongside the existing `qualityScore` state (around line 75), add:

```tsx
  const [openIssueCount, setOpenIssueCount] = useState<number | null>(null)
```

In the existing `useEffect` that fetches `qualityScore` (lines 77-85), add a second effect right after it:

```tsx
  useEffect(() => {
    if (!asset) { setOpenIssueCount(null); return }
    const leaf = asset.asset_type === 'table' || asset.asset_type === 'view'
    if (!leaf) { setOpenIssueCount(null); return }
    fetch(`/api/issues?asset_id=${asset.asset_id}&limit=50`)
      .then(r => r.json())
      .then((items: { status: string }[]) => {
        const open = Array.isArray(items) ? items.filter(i => i.status !== 'resolved' && i.status !== 'closed').length : 0
        setOpenIssueCount(open)
      })
      .catch(() => setOpenIssueCount(null))
  }, [asset])
```

- [ ] **Step 5: Add the `issues` tab to the tab bar with a count badge**

Change line 118 from:
```tsx
          {(['overview', 'profiling', 'rules', 'quality', 'alerts', 'trends'] as Tab[]).map(tab => (
```
to:
```tsx
          {(['overview', 'profiling', 'rules', 'quality', 'alerts', 'trends', 'issues'] as Tab[]).map(tab => (
```

Inside the `<button>` for each tab, the current content is just `{tab}` (line 135). Replace that single expression with a fragment that adds the badge for the `issues` tab:

```tsx
              {tab}
              {tab === 'issues' && openIssueCount !== null && openIssueCount > 0 && (
                <span style={{ marginLeft: '4px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', borderRadius: '8px', padding: '0 5px', fontSize: '9px', fontWeight: 700 }}>
                  {openIssueCount}
                </span>
              )}
```

- [ ] **Step 6: Add the `issues` tab content block**

After the "Trends tab content" block (lines 211-213):
```tsx
      {/* Trends tab content */}
      {isLeaf && activeTab === 'trends' && (
        <AssetTrendsTab assetId={asset.asset_id} />
      )}
```
add:
```tsx

      {/* Issues tab content */}
      {isLeaf && activeTab === 'issues' && (
        <AssetIssuesTab assetId={asset.asset_id} domainId={asset.domain_id} />
      )}
```

`AssetIssuesTab` expects a `domainId?: string | null` prop, but the `Asset` interface in this file (lines 20-39) does not declare `domain_id` — it has `domain?: string` (a display name). Add `domain_id?: string | null` to the `Asset` interface (alongside `domain?: string`, around line 33):

```tsx
  domain?: string
  domain_id?: string | null
```

- [ ] **Step 7: Verify type-check and lint**

Run:
```bash
cd frontend && npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 8: Manual smoke test**

With both servers running, open the Asset Registry, select a table/view asset, and verify:
- A new "Issues" tab appears after "Trends", showing a red count badge only when the asset has open issues.
- Clicking the tab shows "No issues for this asset" (empty state) or a list of issues for that asset.
- "+ Create Issue" opens the modal prefilled with this asset; after creating, the new issue appears in the list and the badge count updates on next load.
- Clicking a row opens the same `IssueDetailPanel` slide-in used on `/issues`.
- All other tabs (overview/profiling/rules/quality/alerts/trends) still render unchanged.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/asset-registry/AssetIssuesTab.tsx frontend/src/components/asset-registry/AssetDetailPanel.tsx
git commit -m "feat(issues): add Issues tab with count badge to Asset Detail Panel"
```

---

## Task 13: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `pytest -v`
Expected: all tests PASS, including `tests/test_issue_model.py`, `tests/test_issues_api.py`, and all pre-existing suites (`tests/test_teams_api.py`, alerts, incidents, etc.) unchanged.

- [ ] **Step 2: Run the full frontend type-check and lint**

Run:
```bash
cd frontend && npx tsc --noEmit && npm run lint
```
Expected: no errors.

- [ ] **Step 3: Manual end-to-end smoke test**

With both servers running:
1. `/incidents` — page and stats load unchanged (separate table/router, untouched).
2. `/alerts` — existing Acknowledge/Resolve/Ignore flows still work; new "Create Issue" button works as in Task 11.
3. `/issues` — loads real data (or "No issues yet" if empty), filters/stat cards work, "+ Create Issue" works, clicking a row opens the detail panel with working status transitions, reopen, edit, and an activity timeline populated via `GET /api/issues/{id}/audit`.
4. Asset Registry — a table/view asset's "Issues" tab works as in Task 12; all other tabs unaffected.
5. Create an issue from each of the three entry points (Issues page, Alerts popup, Asset Issues tab) and confirm all three show up correctly in `/issues` with the right `issue_type`/links.
6. Walk an issue through the full lifecycle (new → confirmed → in_progress → blocked → in_progress → resolved → closed → reopened) using the detail panel buttons, confirming each transition is rejected/accepted per `ISSUE_TRANSITIONS` and recorded in the audit trail.

- [ ] **Step 4: Final commit (if any cleanup was needed)**

```bash
git status
```
If there are no uncommitted changes, this task requires no commit — it is verification-only.

---

## Self-Review

**Spec coverage:**
- Data model (all 22 `dq_issues` fields) — Task 1.
- Migration — Task 2.
- `ISSUE_TRANSITIONS` state machine — Task 1, enforced in Task 4 (`transition_issue`).
- All 8 backend endpoints (`GET /issues`, `/enriched`, `/stats`, `POST /issues`, `GET/PUT /issues/{id}`, `/transition`, `/reopen`, `/audit`) — Tasks 3-4.
- Router registration — Task 5.
- Frontend types incl. TS-mirrored `ISSUE_TRANSITIONS` — Task 6.
- Proxy routes (base + transition/reopen/audit) — Task 7.
- `CreateIssueModal` (prefillable, reused by 3 entry points) — Task 8.
- `IssueDetailPanel` (meta grid, description, status controls, reopen, edit, audit timeline) — Task 9.
- `/issues` page rewrite (7-state badges, relabeled stat cards, working create, filters, loading/empty/error) — Task 10.
- Alerts page "Create Issue" button — Task 11.
- Asset Detail Panel "Issues" tab + count badge — Task 12.
- Full regression checklist from the spec — Task 13.

**Placeholder scan:** No "TBD"/"TODO"/"implement later" strings; every step contains complete code or exact verification commands.

**Type consistency:**
- `Issue`/`IssueStatus`/`IssueSeverity`/`IssueType`/`IssueAuditEntry`/`ISSUE_TRANSITIONS` (Task 6) are imported with identical names and shapes in `IssueDetailPanel` (Task 9), `CreateIssueModal` (Task 8), `issues/page.tsx` (Task 10), and `AssetIssuesTab` (Task 12).
- `IssueDetailPanel` props (`issue`, `onClose`, `onUpdated`) are identical across its three call sites (Tasks 10 and 12).
- `CreateIssueModal` props (`prefill`, `onClose`, `onCreated`) and `CreateIssuePrefill` fields are identical across its three call sites (Tasks 10, 11, 12).
- `_fmt_issue()` field names (Task 3) match the `Issue` TS interface field names (Task 6) exactly (snake_case throughout, matching the rest of the codebase's API contracts).

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-12-issue-intake-lifecycle.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
