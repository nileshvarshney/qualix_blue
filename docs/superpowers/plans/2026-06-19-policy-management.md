# Policy Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a shared approval engine, real enforcement engine, policy versioning, and in-app + email notifications for DataGuard's policy management system.

**Architecture:** A generic `ApprovalRequest` table handles all entity-type approval flows (policies, contracts, domain ownership, data products). `enforcement_service.py` checks active policies before asset/rule writes. `notification_service.py` uses daemon threads for email (works in both request handlers and APScheduler jobs). Policy version history is captured as a numbered snapshot on each approval.

**Tech Stack:** Python/FastAPI, SQLAlchemy async (AsyncSession), APScheduler (already running), smtplib for email, Next.js 15 proxy routes, React useState hooks.

## Global Constraints

- All new Python files must start with `from __future__ import annotations`
- All new SQLAlchemy models use `Mapped`/`mapped_column` pattern matching `app/db/models.py`
- `JSONVariant` (already defined in models.py) is used for all VARIANT/JSON columns
- `gen_uuid` (imported from `app.db.models`) generates all primary keys
- `_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)` for timestamps (no tzinfo)
- Tests use `MagicMock`/`AsyncMock` (never `pytest-anyio` or real DB connections)
- Run tests: `cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/<file> -v`
- SMTP settings come from `settings` object: `settings.smtp_host`, `settings.smtp_port`, `settings.smtp_user`, `settings.smtp_password`, `settings.smtp_from_email`, `settings.smtp_use_tls`
- Frontend proxy files use `export const dynamic = 'force-dynamic'` and `const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'`

---

## File Structure

```
app/
├── db/
│   └── models.py                    MODIFY — add ApprovalRequest, GovernancePolicyVersion, Notification;
│                                              add status field to GovernancePolicy and DataContract
├── api/
│   ├── governance.py                MODIFY — add /approvals endpoints; modify create_policy + update_policy
│   │                                        to create ApprovalRequest; add /policies/{id}/versions endpoint
│   └── notifications.py             CREATE — GET /notifications, POST /notifications/{id}/read,
│                                             POST /notifications/read-all
├── services/
│   ├── enforcement_service.py       CREATE — check_asset_enforcement(), check_rule_count_enforcement()
│   ├── notification_service.py      CREATE — create_notification(), send_email()
│   └── scheduler_service.py         MODIFY — add policy sweep job in start_scheduler()
│   └── governance_service.py        MODIFY — call notification_service after new violations detected
└── main.py                          MODIFY — include notifications router

frontend/src/app/
├── api/
│   ├── governance/
│   │   ├── approvals/route.ts       CREATE — proxy for GET/POST /governance/approvals,
│   │   │                                     POST approve/reject
│   │   └── policies/[id]/
│   │       └── versions/route.ts   CREATE — proxy for GET /governance/policies/{id}/versions
│   └── notifications/route.ts       CREATE — proxy for GET/POST notifications endpoints
└── governance/
    └── page.tsx                     MODIFY — rename Pending→Approvals tab (unified queue);
                                              add History tab in policy side panel;
                                              update enforcement badges

frontend/src/components/
└── Sidebar.tsx                      MODIFY — add notification bell with unread badge + dropdown
```

---

## Task 1: Data Models

**Files:**
- Modify: `app/db/models.py`
- Create: `tests/test_policy_models.py`

**Interfaces:**
- Produces:
  - `ApprovalRequest` model with fields: `approval_id`, `entity_type`, `entity_id`, `entity_snapshot` (JSONVariant), `status`, `requested_by`, `reviewed_by`, `feedback`, `created_at`, `reviewed_at`
  - `GovernancePolicyVersion` model with fields: `version_id`, `policy_id`, `version_number`, `changed_by`, `changed_at`, `change_summary`, `field_diffs` (JSONVariant), `snapshot` (JSONVariant)
  - `Notification` model with fields: `notification_id`, `user_email`, `type`, `title`, `body`, `entity_type`, `entity_id`, `is_read`, `email_sent`, `created_at`
  - `GovernancePolicy.status` field (VARCHAR 20, default `"active"`)
  - `DataContract.status` already has `"draft"` — it just needs `"pending_review"` to be a valid value (no schema change required; it's already VARCHAR)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_policy_models.py
from __future__ import annotations
from unittest.mock import MagicMock


def _make_approval(status="pending"):
    a = MagicMock()
    a.approval_id = "apr-001"
    a.entity_type = "policy"
    a.entity_id = "pol-001"
    a.entity_snapshot = {"policy_name": "Test"}
    a.status = status
    a.requested_by = "user@example.com"
    a.reviewed_by = None
    a.feedback = None
    return a


def test_approval_request_model_importable():
    from app.db.models import ApprovalRequest
    assert hasattr(ApprovalRequest, "approval_id")
    assert hasattr(ApprovalRequest, "entity_type")
    assert hasattr(ApprovalRequest, "entity_id")
    assert hasattr(ApprovalRequest, "entity_snapshot")
    assert hasattr(ApprovalRequest, "status")
    assert hasattr(ApprovalRequest, "requested_by")
    assert hasattr(ApprovalRequest, "reviewed_by")
    assert hasattr(ApprovalRequest, "feedback")


def test_governance_policy_version_model_importable():
    from app.db.models import GovernancePolicyVersion
    assert hasattr(GovernancePolicyVersion, "version_id")
    assert hasattr(GovernancePolicyVersion, "policy_id")
    assert hasattr(GovernancePolicyVersion, "version_number")
    assert hasattr(GovernancePolicyVersion, "field_diffs")
    assert hasattr(GovernancePolicyVersion, "snapshot")


def test_notification_model_importable():
    from app.db.models import Notification
    assert hasattr(Notification, "notification_id")
    assert hasattr(Notification, "user_email")
    assert hasattr(Notification, "type")
    assert hasattr(Notification, "is_read")
    assert hasattr(Notification, "email_sent")


def test_governance_policy_has_status_field():
    from app.db.models import GovernancePolicy
    assert hasattr(GovernancePolicy, "status")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_policy_models.py -v
```

Expected: FAIL — `ImportError: cannot import name 'ApprovalRequest'`

- [ ] **Step 3: Add three new models and the status field to GovernancePolicy**

In `app/db/models.py`, after the `DataContract` class (around line 1033), add:

```python
class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    approval_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    entity_snapshot: Mapped[Optional[dict]] = mapped_column(JSONVariant)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    requested_by: Mapped[str] = mapped_column(String(200), nullable=False)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(200))
    feedback: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class GovernancePolicyVersion(Base):
    __tablename__ = "governance_policy_versions"

    version_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    policy_id: Mapped[str] = mapped_column(String(36), ForeignKey("governance_policies.policy_id"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_by: Mapped[str] = mapped_column(String(200), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    change_summary: Mapped[Optional[str]] = mapped_column(String(500))
    field_diffs: Mapped[Optional[list]] = mapped_column(JSONVariant)
    snapshot: Mapped[Optional[dict]] = mapped_column(JSONVariant)


class Notification(Base):
    __tablename__ = "notifications"

    notification_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    user_email: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[Optional[str]] = mapped_column(Text)
    entity_type: Mapped[Optional[str]] = mapped_column(String(50))
    entity_id: Mapped[Optional[str]] = mapped_column(String(36))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
```

Also add `status` field to `GovernancePolicy` (after `is_active`):

```python
# In GovernancePolicy class, after is_active line:
status: Mapped[str] = mapped_column(String(20), default="active")
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_policy_models.py -v
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py tests/test_policy_models.py
git commit -m "feat(policy): add ApprovalRequest, GovernancePolicyVersion, Notification models"
```

---

## Task 2: Notification Service

**Files:**
- Create: `app/services/notification_service.py`
- Create: `tests/test_notification_service.py`

**Interfaces:**
- Produces:
  - `create_notification(user_email: str, type: str, title: str, body: str, entity_type: str, entity_id: str, db: AsyncSession) -> None`
  - `send_email(to: str, subject: str, body: str) -> None`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_notification_service.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_create_notification_writes_to_db():
    from app.services.notification_service import create_notification
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    with patch("app.services.notification_service.threading.Thread") as mock_thread:
        mock_thread.return_value.start = MagicMock()
        await create_notification(
            user_email="owner@example.com",
            type="violation_detected",
            title="Policy Violated",
            body="Table has no owner",
            entity_type="asset",
            entity_id="asset-001",
            db=db,
        )

    db.add.assert_called_once()
    db.commit.assert_awaited_once()


def test_send_email_skips_when_smtp_not_configured():
    from app.services.notification_service import send_email
    # No SMTP env vars set → should not raise
    send_email("test@example.com", "Subject", "Body")


@pytest.mark.asyncio
async def test_create_notification_sets_fields_correctly():
    from app.services.notification_service import create_notification
    from app.db.models import Notification
    db = AsyncMock()
    captured = {}

    def capture_add(obj):
        captured["obj"] = obj
    db.add = capture_add
    db.commit = AsyncMock()

    with patch("app.services.notification_service.threading.Thread") as mock_thread:
        mock_thread.return_value.start = MagicMock()
        await create_notification(
            user_email="owner@example.com",
            type="approval_decided",
            title="Policy Approved",
            body="Your policy was approved",
            entity_type="policy",
            entity_id="pol-001",
            db=db,
        )

    n = captured["obj"]
    assert n.user_email == "owner@example.com"
    assert n.type == "approval_decided"
    assert n.is_read is False
    assert n.email_sent is False
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_notification_service.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.notification_service'`

- [ ] **Step 3: Implement notification_service.py**

```python
# app/services/notification_service.py
from __future__ import annotations

import logging
import smtplib
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings

logger = logging.getLogger("dq_platform.notifications")
_utcnow = lambda: datetime.now(timezone.utc).replace(tzinfo=None)


async def create_notification(
    user_email: str,
    type: str,
    title: str,
    body: str,
    entity_type: str,
    entity_id: str,
    db: AsyncSession,
) -> None:
    """Write a Notification row and fire email in a daemon thread."""
    from app.db.models import Notification, gen_uuid

    n = Notification(
        notification_id=gen_uuid(),
        user_email=user_email,
        type=type,
        title=title,
        body=body,
        entity_type=entity_type,
        entity_id=entity_id,
        is_read=False,
        email_sent=False,
        created_at=_utcnow(),
    )
    db.add(n)
    await db.commit()

    t = threading.Thread(
        target=_send_email_and_mark,
        args=(n.notification_id, user_email, title, body),
        daemon=True,
    )
    t.start()


def _send_email_and_mark(notification_id: str, to: str, subject: str, body: str) -> None:
    """Send email and update email_sent flag. Runs in daemon thread."""
    sent = send_email(to, subject, body)
    if sent:
        try:
            import asyncio
            from app.db.database import AsyncSessionLocal
            from app.db.models import Notification
            from sqlalchemy import select

            async def _mark():
                async with AsyncSessionLocal() as db:
                    res = await db.execute(
                        select(Notification).where(Notification.notification_id == notification_id)
                    )
                    n = res.scalar_one_or_none()
                    if n:
                        n.email_sent = True
                        await db.commit()

            asyncio.run(_mark())
        except Exception as e:
            logger.warning("Could not mark email_sent: %s", e)


def send_email(to: str, subject: str, body: str) -> bool:
    """
    Send via SMTP using settings. Returns True on success, False if skipped or failed.
    Silently skips if SMTP is not configured.
    """
    if not settings.smtp_host or not settings.smtp_user:
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = settings.smtp_from_email
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port)

        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_from_email, to, msg.as_string())
        server.quit()
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as e:
        logger.warning("Email send failed to %s: %s", to, e)
        return False
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_notification_service.py -v
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/services/notification_service.py tests/test_notification_service.py
git commit -m "feat(policy): add notification service with daemon-thread email"
```

---

## Task 3: Enforcement Service + Write-Path Integration

**Files:**
- Create: `app/services/enforcement_service.py`
- Modify: `app/api/assets.py` (line 672 — `update_asset` function)
- Modify: `app/api/rules.py` (line 351 — `delete_rule` function)
- Create: `tests/test_enforcement_service.py`

**Interfaces:**
- Consumes: `GovernancePolicy` (status, severity, policy_type), `DQRule` (asset_id, is_active)
- Produces:
  - `check_asset_enforcement(asset, db: AsyncSession) -> dict`
    - Returns `{"blocked": bool, "blocking_violations": list[str], "warnings": list[str]}`
  - `check_rule_count_enforcement(asset_id: str, db: AsyncSession, delta: int = 0) -> dict`
    - `delta=-1` when deleting a rule; checks if `current_count + delta == 0`
    - Returns same shape as above

- [ ] **Step 1: Write the failing test**

```python
# tests/test_enforcement_service.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_policy(policy_type, severity, status="active"):
    p = MagicMock()
    p.policy_type = policy_type
    p.severity = severity
    p.status = status
    p.is_active = True
    p.policy_name = f"Test {policy_type}"
    return p


def _make_asset(**kwargs):
    a = MagicMock()
    a.asset_id = "asset-001"
    a.owner_email = kwargs.get("owner_email", "owner@x.com")
    a.table_description = kwargs.get("table_description", "A table")
    a.certification_status = kwargs.get("certification_status", "certified")
    return a


def _make_db_with_policies(policies):
    db = AsyncMock()
    policy_res = MagicMock()
    policy_res.scalars.return_value.all.return_value = policies
    rule_count_res = MagicMock()
    rule_count_res.scalar_one.return_value = 3
    db.execute.side_effect = [policy_res, rule_count_res]
    return db


@pytest.mark.asyncio
async def test_check_asset_enforcement_blocks_on_high_severity():
    from app.services.enforcement_service import check_asset_enforcement
    policies = [_make_policy("owner_required", "high")]
    asset = _make_asset(owner_email=None)
    db = _make_db_with_policies(policies)

    result = await check_asset_enforcement(asset, db)

    assert result["blocked"] is True
    assert len(result["blocking_violations"]) == 1
    assert result["warnings"] == []


@pytest.mark.asyncio
async def test_check_asset_enforcement_warns_on_medium_severity():
    from app.services.enforcement_service import check_asset_enforcement
    policies = [_make_policy("stale_description", "medium")]
    asset = _make_asset(table_description=None)
    db = _make_db_with_policies(policies)

    result = await check_asset_enforcement(asset, db)

    assert result["blocked"] is False
    assert result["warnings"] == ["Test stale_description (severity: medium)"]


@pytest.mark.asyncio
async def test_check_asset_enforcement_passes_when_no_violations():
    from app.services.enforcement_service import check_asset_enforcement
    policies = [_make_policy("owner_required", "high")]
    asset = _make_asset(owner_email="owner@x.com")
    db = _make_db_with_policies(policies)

    result = await check_asset_enforcement(asset, db)

    assert result["blocked"] is False
    assert result["blocking_violations"] == []


@pytest.mark.asyncio
async def test_check_asset_enforcement_ignores_non_active_policies():
    from app.services.enforcement_service import check_asset_enforcement
    policies = [_make_policy("owner_required", "high", status="pending_review")]
    asset = _make_asset(owner_email=None)
    db = _make_db_with_policies(policies)

    result = await check_asset_enforcement(asset, db)

    assert result["blocked"] is False


@pytest.mark.asyncio
async def test_check_rule_count_enforcement_blocks_on_zero_rules():
    from app.services.enforcement_service import check_rule_count_enforcement
    policies = [_make_policy("no_rules_defined", "high")]
    db = AsyncMock()
    policy_res = MagicMock()
    policy_res.scalars.return_value.all.return_value = policies
    count_res = MagicMock()
    count_res.scalar_one.return_value = 1  # currently 1 rule; delta=-1 makes it 0
    db.execute.side_effect = [policy_res, count_res]

    result = await check_rule_count_enforcement("asset-001", db, delta=-1)

    assert result["blocked"] is True
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_enforcement_service.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.enforcement_service'`

- [ ] **Step 3: Implement enforcement_service.py**

```python
# app/services/enforcement_service.py
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

    rule_count_res = await db.execute(
        select(func.count()).where(
            DQRule.asset_id == asset.asset_id,
            DQRule.is_active == True,
        )
    )
    rule_count = rule_count_res.scalar_one()

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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_enforcement_service.py -v
```

Expected: PASS (5 tests)

- [ ] **Step 5: Integrate check_asset_enforcement into update_asset**

In `app/api/assets.py`, find `update_asset` at line 672. Add enforcement check after setting fields but before `db.commit()`:

```python
@router.put("/{asset_id}", response_model=AssetResponse)
async def update_asset(asset_id: str, payload: AssetUpdate, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(asset, field, value)
    asset.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    # Enforcement check — must come after field mutation, before commit
    from app.services.enforcement_service import check_asset_enforcement
    enforcement = await check_asset_enforcement(asset, db)
    if enforcement["blocked"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Update blocked by enforced policy violations",
                "violations": enforcement["blocking_violations"],
                "warnings": enforcement["warnings"],
            },
        )

    await db.commit()
    await db.refresh(asset)
    return asset
```

- [ ] **Step 6: Integrate check_rule_count_enforcement into delete_rule**

In `app/api/rules.py`, find `delete_rule` at line 351. Add enforcement check before deactivating:

```python
@router.delete("/{rule_id}")
async def delete_rule(rule_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(DQRule).where(DQRule.rule_id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")

    # Check if deleting this rule would trigger no_rules_defined violation
    from app.services.enforcement_service import check_rule_count_enforcement
    enforcement = await check_rule_count_enforcement(rule.asset_id, db, delta=-1)
    if enforcement["blocked"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Deletion blocked by enforced policy violations",
                "violations": enforcement["blocking_violations"],
                "warnings": enforcement["warnings"],
            },
        )

    # existing delete logic follows — keep the rest of the function as-is
```

Note: Read `app/api/rules.py` lines 351–368 to see the existing delete body and append the enforcement block before the existing deactivation code.

- [ ] **Step 7: Run all enforcement tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_enforcement_service.py -v
```

Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add app/services/enforcement_service.py app/api/assets.py app/api/rules.py tests/test_enforcement_service.py
git commit -m "feat(policy): add enforcement service with write-path blocking for assets and rules"
```

---

## Task 4: Policy Sweep Scheduler

**Files:**
- Modify: `app/services/scheduler_service.py` (add job in `start_scheduler`)
- Modify: `app/services/governance_service.py` (call notification_service after new violations)
- Create: `tests/test_policy_sweep.py`

**Interfaces:**
- Consumes: `evaluate_policies(db)` (already exists in governance_service.py), `create_notification(...)` from notification_service
- Produces: `_run_policy_sweep()` async function registered with APScheduler job id `"policy_evaluation_sweep"`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_policy_sweep.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_policy_sweep_calls_evaluate_policies():
    with patch("app.services.scheduler_service.AsyncSessionLocal") as mock_sl, \
         patch("app.services.scheduler_service.evaluate_policies") as mock_eval:

        mock_db = AsyncMock()
        mock_sl.return_value.__aenter__.return_value = mock_db
        mock_eval.return_value = 3

        from app.services.scheduler_service import _run_policy_sweep
        await _run_policy_sweep()

        mock_eval.assert_awaited_once_with(mock_db)


def test_policy_sweep_job_registered_in_start_scheduler():
    from app.services.scheduler_service import scheduler
    # The job is registered when start_scheduler() runs; check it exists if scheduler is running
    # (In unit test, we just verify the function is importable and callable)
    from app.services.scheduler_service import _run_policy_sweep
    import inspect
    assert inspect.iscoroutinefunction(_run_policy_sweep)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_policy_sweep.py -v
```

Expected: FAIL — `ImportError: cannot import name '_run_policy_sweep'`

- [ ] **Step 3: Add the sweep runner and register it in start_scheduler**

In `app/services/scheduler_service.py`, add the sweep runner function before `start_scheduler`:

```python
async def _run_policy_sweep() -> None:
    """APScheduler job — evaluate all policies and notify on new violations."""
    from app.db.database import AsyncSessionLocal
    from app.services.governance_service import evaluate_policies
    logger.info("Policy sweep starting")
    async with AsyncSessionLocal() as db:
        count = await evaluate_policies(db)
    logger.info("Policy sweep complete: %d violations", count)
```

In `start_scheduler()`, after the existing `scheduler.add_job` calls, add:

```python
        from app.core.config import settings as _s
        sweep_hours = getattr(_s, "policy_eval_interval_hours", 6)
        scheduler.add_job(
            _run_policy_sweep,
            trigger=CronTrigger(hour=f"*/{sweep_hours}", timezone="UTC"),
            id="policy_evaluation_sweep",
            replace_existing=True,
        )
```

Also add `policy_eval_interval_hours: int = 6` to the `Settings` class in `app/core/config.py`.

- [ ] **Step 4: Update governance_service.evaluate_policies to notify on new violations**

In `app/services/governance_service.py`, in the `evaluate_policies` function, after a new `PolicyViolation` is created (where a violation is detected but no existing record exists), add notification:

Find the section that creates a new violation (look for the pattern where a new PolicyViolation is added to db). After `db.add(new_violation)`, insert:

```python
                    # Notify asset owner of new violation
                    if asset.owner_email:
                        try:
                            from app.services.notification_service import create_notification
                            await create_notification(
                                user_email=asset.owner_email,
                                type="violation_detected",
                                title=f"Policy Violation: {policy.policy_name}",
                                body=detail,
                                entity_type="asset",
                                entity_id=asset.asset_id,
                                db=db,
                            )
                        except Exception as _ne:
                            logger.warning("Notification failed: %s", _ne)
```

Read `app/services/governance_service.py` lines 59–108 to find the exact location where `db.add` is called for a new violation.

- [ ] **Step 5: Run tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_policy_sweep.py -v
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add app/services/scheduler_service.py app/services/governance_service.py app/core/config.py tests/test_policy_sweep.py
git commit -m "feat(policy): register APScheduler policy sweep job with violation notifications"
```

---

## Task 5: Approval Queue Backend

**Files:**
- Modify: `app/api/governance.py`
- Create: `frontend/src/app/api/governance/approvals/route.ts`
- Create: `tests/test_approval_queue.py`

**Interfaces:**
- Consumes: `ApprovalRequest` model (Task 1), `GovernancePolicyVersion` (Task 1 — written on policy approve in Task 6), `create_notification` (Task 2), `require_roles` from `app.core.security`
- Produces:
  - `GET /governance/approvals` → list of approval dicts
  - `POST /governance/approvals` → creates ApprovalRequest, sets entity to `pending_review`
  - `POST /governance/approvals/{approval_id}/approve` → sets `status="approved"`, activates entity
  - `POST /governance/approvals/{approval_id}/reject` → sets `status="rejected"`, sets entity to `"draft"`, records feedback

- [ ] **Step 1: Write the failing test**

```python
# tests/test_approval_queue.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_approval(status="pending", entity_type="policy", entity_id="pol-001"):
    a = MagicMock()
    a.approval_id = "apr-001"
    a.entity_type = entity_type
    a.entity_id = entity_id
    a.entity_snapshot = {"policy_name": "Test Policy", "severity": "high"}
    a.status = status
    a.requested_by = "user@example.com"
    a.reviewed_by = None
    a.feedback = None
    a.created_at = MagicMock()
    a.created_at.isoformat.return_value = "2026-06-19T10:00:00"
    a.reviewed_at = None
    return a


def test_approvals_router_has_expected_routes():
    from app.api.governance import router
    paths = {r.path for r in router.routes}
    assert "/governance/approvals" in paths
    assert "/governance/approvals/{approval_id}/approve" in paths
    assert "/governance/approvals/{approval_id}/reject" in paths


@pytest.mark.asyncio
async def test_list_approvals_returns_list():
    from app.api.governance import list_approvals
    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = [_make_approval()]
    db.execute.return_value = res

    result = await list_approvals(db=db, entity_type=None, status=None)

    assert isinstance(result, list)
    assert result[0]["approval_id"] == "apr-001"


@pytest.mark.asyncio
async def test_create_approval_request_sets_entity_to_pending_review():
    from app.api.governance import create_approval_request
    db = AsyncMock()

    # Simulate policy lookup returning a policy
    policy = MagicMock()
    policy.policy_id = "pol-001"
    policy.status = "active"
    res = MagicMock()
    res.scalar_one_or_none.return_value = policy
    db.execute.return_value = res
    db.add = MagicMock()
    db.commit = AsyncMock()

    user = {"email": "user@example.com", "role": "data_steward"}
    body = {"entity_type": "policy", "entity_id": "pol-001", "entity_snapshot": {"policy_name": "P"}}

    result = await create_approval_request(body=body, db=db, user=user)

    assert result["status"] == "pending"
    assert policy.status == "pending_review"


@pytest.mark.asyncio
async def test_approve_request_activates_policy():
    from app.api.governance import approve_request
    db = AsyncMock()

    approval = _make_approval(status="pending", entity_type="policy")
    policy = MagicMock()
    policy.policy_id = "pol-001"
    policy.status = "pending_review"
    policy.is_active = False

    res1 = MagicMock()
    res1.scalar_one_or_none.return_value = approval
    res2 = MagicMock()
    res2.scalar_one_or_none.return_value = policy
    # version count query
    res3 = MagicMock()
    res3.scalar_one.return_value = 0
    db.execute.side_effect = [res1, res2, res3]
    db.add = MagicMock()
    db.commit = AsyncMock()

    user = {"email": "admin@example.com", "role": "admin"}
    result = await approve_request(approval_id="apr-001", body={}, db=db, user=user)

    assert approval.status == "approved"
    assert policy.status == "active"
    assert policy.is_active is True


@pytest.mark.asyncio
async def test_reject_request_sets_entity_to_draft():
    from app.api.governance import reject_request
    db = AsyncMock()

    approval = _make_approval(status="pending", entity_type="policy")
    policy = MagicMock()
    policy.policy_id = "pol-001"
    policy.status = "pending_review"

    res1 = MagicMock()
    res1.scalar_one_or_none.return_value = approval
    res2 = MagicMock()
    res2.scalar_one_or_none.return_value = policy
    db.execute.side_effect = [res1, res2]
    db.commit = AsyncMock()

    user = {"email": "admin@example.com", "role": "admin"}
    body = {"feedback": "Needs more detail"}
    result = await reject_request(approval_id="apr-001", body=body, db=db, user=user)

    assert approval.status == "rejected"
    assert approval.feedback == "Needs more detail"
    assert policy.status == "draft"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_approval_queue.py::test_approvals_router_has_expected_routes -v
```

Expected: FAIL — routes not found

- [ ] **Step 3: Add approval endpoints to governance.py**

Add these imports at the top of `app/api/governance.py`:

```python
from app.core.security import get_current_user, require_admin, require_roles
require_approver = require_roles("admin", "domain_owner")
```

Add a formatter and the four new endpoints. Append to the end of `app/api/governance.py`:

```python
# ── Approval helpers ──────────────────────────────────────────────────────────

def _fmt_approval(a) -> dict:
    return {
        "approval_id": a.approval_id,
        "entity_type": a.entity_type,
        "entity_id": a.entity_id,
        "entity_snapshot": a.entity_snapshot,
        "status": a.status,
        "requested_by": a.requested_by,
        "reviewed_by": a.reviewed_by,
        "feedback": a.feedback,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
    }


# ── Approval endpoints ────────────────────────────────────────────────────────

@router.get("/approvals")
async def list_approvals(
    entity_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import ApprovalRequest
    q = select(ApprovalRequest).order_by(ApprovalRequest.created_at.desc())
    if entity_type:
        q = q.where(ApprovalRequest.entity_type == entity_type)
    if status:
        q = q.where(ApprovalRequest.status == status)
    res = await db.execute(q)
    return [_fmt_approval(a) for a in res.scalars().all()]


@router.post("/approvals")
async def create_approval_request(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import ApprovalRequest, GovernancePolicy, DataContract, gen_uuid
    from datetime import datetime, timezone
    _now = datetime.now(timezone.utc).replace(tzinfo=None)

    entity_type = body["entity_type"]
    entity_id = body["entity_id"]

    # Set entity to pending_review
    if entity_type == "policy":
        res = await db.execute(select(GovernancePolicy).where(GovernancePolicy.policy_id == entity_id))
        entity = res.scalar_one_or_none()
        if entity:
            entity.status = "pending_review"
            entity.is_active = False
    elif entity_type == "contract":
        res = await db.execute(select(DataContract).where(DataContract.contract_id == entity_id))
        entity = res.scalar_one_or_none()
        if entity:
            entity.status = "pending_review"

    approval = ApprovalRequest(
        approval_id=gen_uuid(),
        entity_type=entity_type,
        entity_id=entity_id,
        entity_snapshot=body.get("entity_snapshot"),
        status="pending",
        requested_by=user.get("email"),
        created_at=_now,
    )
    db.add(approval)
    await db.commit()
    return _fmt_approval(approval)


@router.post("/approvals/{approval_id}/approve")
async def approve_request(
    approval_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_approver),
):
    from app.db.models import ApprovalRequest, GovernancePolicy, DataContract, GovernancePolicyVersion, gen_uuid
    from datetime import datetime, timezone
    from sqlalchemy import func as _func
    _now = datetime.now(timezone.utc).replace(tzinfo=None)

    res = await db.execute(select(ApprovalRequest).where(ApprovalRequest.approval_id == approval_id))
    approval = res.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "Approval request not found")
    if approval.status != "pending":
        raise HTTPException(400, f"Request is already {approval.status}")

    approval.status = "approved"
    approval.reviewed_by = user.get("email")
    approval.reviewed_at = _now

    # Activate entity
    if approval.entity_type == "policy":
        p_res = await db.execute(select(GovernancePolicy).where(GovernancePolicy.policy_id == approval.entity_id))
        policy = p_res.scalar_one_or_none()
        if policy:
            # Apply snapshot fields if provided
            snapshot = approval.entity_snapshot or {}
            for field in ("policy_name", "policy_type", "description", "severity", "config"):
                if field in snapshot:
                    setattr(policy, field, snapshot[field])
            policy.status = "active"
            policy.is_active = True

            # Write version record
            ver_res = await db.execute(
                select(_func.max(GovernancePolicyVersion.version_number)).where(
                    GovernancePolicyVersion.policy_id == policy.policy_id
                )
            )
            max_ver = ver_res.scalar_one() or 0
            version = GovernancePolicyVersion(
                version_id=gen_uuid(),
                policy_id=policy.policy_id,
                version_number=max_ver + 1,
                changed_by=user.get("email"),
                changed_at=_now,
                change_summary="Approved",
                field_diffs=[],
                snapshot=snapshot or {},
            )
            db.add(version)

    elif approval.entity_type == "contract":
        c_res = await db.execute(select(DataContract).where(DataContract.contract_id == approval.entity_id))
        contract = c_res.scalar_one_or_none()
        if contract:
            contract.status = "active"

    await db.commit()
    return _fmt_approval(approval)


@router.post("/approvals/{approval_id}/reject")
async def reject_request(
    approval_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_approver),
):
    from app.db.models import ApprovalRequest, GovernancePolicy, DataContract
    from datetime import datetime, timezone
    _now = datetime.now(timezone.utc).replace(tzinfo=None)

    res = await db.execute(select(ApprovalRequest).where(ApprovalRequest.approval_id == approval_id))
    approval = res.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "Approval request not found")
    if approval.status != "pending":
        raise HTTPException(400, f"Request is already {approval.status}")

    approval.status = "rejected"
    approval.reviewed_by = user.get("email")
    approval.reviewed_at = _now
    approval.feedback = body.get("feedback")

    # Set entity back to draft
    if approval.entity_type == "policy":
        p_res = await db.execute(select(GovernancePolicy).where(GovernancePolicy.policy_id == approval.entity_id))
        policy = p_res.scalar_one_or_none()
        if policy:
            policy.status = "draft"
    elif approval.entity_type == "contract":
        c_res = await db.execute(select(DataContract).where(DataContract.contract_id == approval.entity_id))
        contract = c_res.scalar_one_or_none()
        if contract:
            contract.status = "draft"

    await db.commit()
    return _fmt_approval(approval)
```

Also modify `create_policy` (line 146) to route through approval instead of creating active directly:

```python
@router.post("/policies")
async def create_policy(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import gen_uuid, ApprovalRequest
    from datetime import datetime, timezone
    _now = datetime.now(timezone.utc).replace(tzinfo=None)

    policy = GovernancePolicy(
        policy_id=gen_uuid(),
        policy_name=body["policy_name"],
        policy_type=body.get("policy_type", "custom"),
        description=body.get("description"),
        severity=body.get("severity", "medium"),
        is_active=False,
        status="pending_review",
        config=body.get("config"),
        created_by=user.get("email"),
    )
    db.add(policy)

    snapshot = {k: body.get(k) for k in ("policy_name", "policy_type", "description", "severity", "config") if body.get(k) is not None}
    approval = ApprovalRequest(
        approval_id=gen_uuid(),
        entity_type="policy",
        entity_id=policy.policy_id,
        entity_snapshot=snapshot,
        status="pending",
        requested_by=user.get("email"),
        created_at=_now,
    )
    db.add(approval)
    await db.commit()
    await db.refresh(policy)
    return _fmt_policy(policy)
```

- [ ] **Step 4: Create the frontend proxy**

```typescript
// frontend/src/app/api/governance/approvals/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const params = new URLSearchParams()
    if (searchParams.get('entity_type')) params.set('entity_type', searchParams.get('entity_type')!)
    if (searchParams.get('status')) params.set('status', searchParams.get('status')!)
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/governance/approvals?${params}`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch { return NextResponse.json([]) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/governance/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

Create a separate route for approve/reject actions:

```typescript
// frontend/src/app/api/governance/approvals/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') // "approve" or "reject"
    const body = await req.json().catch(() => ({}))
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/governance/approvals/${params.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 5: Run the approval queue tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_approval_queue.py -v
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add app/api/governance.py frontend/src/app/api/governance/approvals/ tests/test_approval_queue.py
git commit -m "feat(policy): add shared approval queue backend and frontend proxy"
```

---

## Task 6: Policy Versioning Backend

**Files:**
- Modify: `app/api/governance.py` (add version list endpoint)
- Create: `frontend/src/app/api/governance/policies/[id]/versions/route.ts`
- Create: `tests/test_policy_versions.py`

**Interfaces:**
- Consumes: `GovernancePolicyVersion` model (Task 1); version rows are already written by `approve_request` in Task 5
- Produces:
  - `GET /governance/policies/{policy_id}/versions` → list of version dicts
  - Frontend proxy at `/api/governance/policies/[id]/versions`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_policy_versions.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_version(version_number=1):
    v = MagicMock()
    v.version_id = f"ver-{version_number:03d}"
    v.policy_id = "pol-001"
    v.version_number = version_number
    v.changed_by = "admin@example.com"
    v.changed_at = MagicMock()
    v.changed_at.isoformat.return_value = f"2026-06-19T10:0{version_number}:00"
    v.change_summary = "Approved"
    v.field_diffs = [{"field": "severity", "old_value": "medium", "new_value": "high"}]
    v.snapshot = {"policy_name": "Test Policy", "severity": "high"}
    return v


def test_policy_versions_route_registered():
    from app.api.governance import router
    paths = {r.path for r in router.routes}
    assert "/governance/policies/{policy_id}/versions" in paths


@pytest.mark.asyncio
async def test_list_policy_versions_returns_newest_first():
    from app.api.governance import list_policy_versions
    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = [_make_version(2), _make_version(1)]
    db.execute.return_value = res

    result = await list_policy_versions(policy_id="pol-001", db=db)

    assert len(result) == 2
    assert result[0]["version_number"] == 2
    assert result[1]["version_number"] == 1
    assert result[0]["field_diffs"] == [{"field": "severity", "old_value": "medium", "new_value": "high"}]
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_policy_versions.py -v
```

Expected: FAIL — `ImportError: cannot import name 'list_policy_versions'`

- [ ] **Step 3: Add the versions endpoint to governance.py**

Append to `app/api/governance.py`:

```python
# ── Policy versioning ─────────────────────────────────────────────────────────

def _fmt_version(v) -> dict:
    return {
        "version_id": v.version_id,
        "policy_id": v.policy_id,
        "version_number": v.version_number,
        "changed_by": v.changed_by,
        "changed_at": v.changed_at.isoformat() if v.changed_at else None,
        "change_summary": v.change_summary,
        "field_diffs": v.field_diffs or [],
        "snapshot": v.snapshot or {},
    }


@router.get("/policies/{policy_id}/versions")
async def list_policy_versions(
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import GovernancePolicyVersion
    res = await db.execute(
        select(GovernancePolicyVersion)
        .where(GovernancePolicyVersion.policy_id == policy_id)
        .order_by(GovernancePolicyVersion.version_number.desc())
    )
    return [_fmt_version(v) for v in res.scalars().all()]
```

- [ ] **Step 4: Create the frontend proxy**

```typescript
// frontend/src/app/api/governance/policies/[id]/versions/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await fetch(`${BACKEND}/governance/policies/${params.id}/versions`, {
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch { return NextResponse.json([]) }
}
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_policy_versions.py -v
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add app/api/governance.py frontend/src/app/api/governance/policies/ tests/test_policy_versions.py
git commit -m "feat(policy): add policy version history endpoint and frontend proxy"
```

---

## Task 7: Notifications API

**Files:**
- Create: `app/api/notifications.py`
- Modify: `app/main.py` (include router)
- Create: `frontend/src/app/api/notifications/route.ts`
- Create: `tests/test_notifications_api.py`

**Interfaces:**
- Consumes: `Notification` model (Task 1)
- Produces:
  - `GET /notifications` — filtered by caller's email from JWT
  - `POST /notifications/{id}/read` — marks one read
  - `POST /notifications/read-all` — marks all read for caller

- [ ] **Step 1: Write the failing test**

```python
# tests/test_notifications_api.py
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock


def _make_notification(is_read=False, type="violation_detected"):
    n = MagicMock()
    n.notification_id = "notif-001"
    n.user_email = "owner@example.com"
    n.type = type
    n.title = "Policy Violated"
    n.body = "Table has no owner"
    n.entity_type = "asset"
    n.entity_id = "asset-001"
    n.is_read = is_read
    n.email_sent = False
    n.created_at = MagicMock()
    n.created_at.isoformat.return_value = "2026-06-19T10:00:00"
    return n


def test_notifications_router_has_expected_routes():
    from app.api.notifications import router
    paths = {r.path for r in router.routes}
    assert "/notifications" in paths
    assert "/notifications/{notification_id}/read" in paths
    assert "/notifications/read-all" in paths


@pytest.mark.asyncio
async def test_list_notifications_filters_by_user_email():
    from app.api.notifications import list_notifications
    db = AsyncMock()
    res = MagicMock()
    res.scalars.return_value.all.return_value = [_make_notification()]
    db.execute.return_value = res

    user = {"email": "owner@example.com", "role": "viewer"}
    result = await list_notifications(db=db, user=user)

    assert len(result) == 1
    assert result[0]["notification_id"] == "notif-001"
    assert result[0]["is_read"] is False


@pytest.mark.asyncio
async def test_mark_notification_read():
    from app.api.notifications import mark_read
    db = AsyncMock()
    notif = _make_notification(is_read=False)
    res = MagicMock()
    res.scalar_one_or_none.return_value = notif
    db.execute.return_value = res
    db.commit = AsyncMock()

    user = {"email": "owner@example.com", "role": "viewer"}
    result = await mark_read(notification_id="notif-001", db=db, user=user)

    assert notif.is_read is True
    assert result["is_read"] is True
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_notifications_api.py::test_notifications_router_has_expected_routes -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'app.api.notifications'`

- [ ] **Step 3: Create app/api/notifications.py**

```python
# app/api/notifications.py
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db.database import get_db
from app.core.security import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _fmt_notification(n) -> dict:
    return {
        "notification_id": n.notification_id,
        "user_email": n.user_email,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "entity_type": n.entity_type,
        "entity_id": n.entity_id,
        "is_read": n.is_read,
        "email_sent": n.email_sent,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import Notification
    res = await db.execute(
        select(Notification)
        .where(Notification.user_email == user.get("email"))
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    return [_fmt_notification(n) for n in res.scalars().all()]


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import Notification
    from fastapi import HTTPException
    res = await db.execute(
        select(Notification).where(
            Notification.notification_id == notification_id,
            Notification.user_email == user.get("email"),
        )
    )
    n = res.scalar_one_or_none()
    if not n:
        raise HTTPException(404, "Notification not found")
    n.is_read = True
    await db.commit()
    return _fmt_notification(n)


@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    from app.db.models import Notification
    await db.execute(
        update(Notification)
        .where(Notification.user_email == user.get("email"), Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}
```

- [ ] **Step 4: Register the router in main.py**

In `app/main.py`, add to the imports section (after the other `from app.api import` block):

```python
from app.api import notifications as notifications_module
```

And in the routers section (before the `# Health & Info` comment):

```python
app.include_router(notifications_module.router)
```

- [ ] **Step 5: Create the frontend proxy**

```typescript
// frontend/src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const res = await fetch(`${BACKEND}/notifications`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch { return NextResponse.json([]) }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') // "read-all" or left empty for single read
    const id = searchParams.get('id')
    const auth = req.headers.get('authorization') || ''
    const endpoint = action === 'read-all'
      ? `${BACKEND}/notifications/read-all`
      : `${BACKEND}/notifications/${id}/read`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 6: Run tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/test_notifications_api.py -v
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add app/api/notifications.py app/main.py frontend/src/app/api/notifications/ tests/test_notifications_api.py
git commit -m "feat(policy): add notifications API endpoint and frontend proxy"
```

---

## Task 8: Frontend — Unified Approvals Tab

**Files:**
- Modify: `frontend/src/app/governance/page.tsx`

**What to change:**
1. Rename `GovernanceTab` union type: add `'approvals'`, remove `'pending'`
2. Add `ApprovalItem` interface and `approvals` state
3. Replace the "pending" tab button with "approvals"
4. Replace the pending tab's body with a unified approval queue showing all entity types
5. Fetch from `/api/governance/approvals` when approvals tab is active

- [ ] **Step 1: Add ApprovalItem interface and state**

In `frontend/src/app/governance/page.tsx`, after the `PendingTerm` interface, add:

```typescript
interface ApprovalItem {
  approval_id: string
  entity_type: string
  entity_id: string
  entity_snapshot: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  requested_by: string
  reviewed_by: string | null
  feedback: string | null
  created_at: string
  reviewed_at: string | null
}
```

Change `GovernanceTab` from:
```typescript
type GovernanceTab = 'scorecards' | 'policies' | 'violations' | 'pending'
```
to:
```typescript
type GovernanceTab = 'scorecards' | 'policies' | 'violations' | 'approvals'
```

In the component state block, replace:
```typescript
const [pendingTerms, setPendingTerms] = useState<PendingTerm[]>([])
```
with:
```typescript
const [approvals, setApprovals] = useState<ApprovalItem[]>([])
const [approvalsLoaded, setApprovalsLoaded] = useState(false)
const [approvalActionLoading, setApprovalActionLoading] = useState<string | null>(null)
const [approvalActionError, setApprovalActionError] = useState<string | null>(null)
const [rejectTarget, setRejectTarget] = useState<ApprovalItem | null>(null)
const [rejectNote, setRejectNote] = useState('')
const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'policy' | 'contract' | 'data_product' | 'domain_ownership' | 'glossary_term'>('pending')
```

- [ ] **Step 2: Add loadApprovals function and wire to tab change**

After `loadData`, add:

```typescript
const loadApprovals = useCallback(async () => {
  const params = new URLSearchParams()
  if (approvalFilter !== 'all' && ['pending', 'approved', 'rejected'].includes(approvalFilter)) {
    params.set('status', approvalFilter)
  } else if (!['all', 'pending'].includes(approvalFilter)) {
    params.set('entity_type', approvalFilter)
  } else if (approvalFilter === 'pending') {
    params.set('status', 'pending')
  }
  const data = await fetch(`/api/governance/approvals?${params}`).then(r => r.json()).catch(() => [])
  setApprovals(Array.isArray(data) ? data : [])
  setApprovalsLoaded(true)
}, [approvalFilter])
```

In the `useEffect` that switches tabs (or add a new one):

```typescript
useEffect(() => {
  if (tab === 'approvals' && !approvalsLoaded) loadApprovals()
}, [tab, approvalsLoaded, loadApprovals])

useEffect(() => {
  if (tab === 'approvals') { setApprovalsLoaded(false); loadApprovals() }
}, [approvalFilter])
```

- [ ] **Step 3: Replace Pending tab button with Approvals**

Find the tab button rendering. Change the tab button for `'pending'` to:

```tsx
<button
  onClick={() => setTab('approvals')}
  style={{
    padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    borderRadius: 6,
    background: tab === 'approvals' ? 'var(--brand-primary)' : 'transparent',
    color: tab === 'approvals' ? '#fff' : 'var(--text-muted)',
  }}
>
  Approvals
</button>
```

- [ ] **Step 4: Replace pending tab body with unified approvals queue**

Find the `tab === 'pending'` JSX block and replace it with `tab === 'approvals'`:

```tsx
{tab === 'approvals' && (
  <div style={{ padding: '0 24px 24px' }}>
    {/* Filter bar */}
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {(['all', 'pending', 'policy', 'contract', 'data_product', 'domain_ownership', 'glossary_term'] as const).map(f => (
        <button key={f} onClick={() => setApprovalFilter(f)}
          style={{
            padding: '4px 12px', border: '1px solid var(--border)', borderRadius: 12,
            fontSize: 12, cursor: 'pointer',
            background: approvalFilter === f ? 'var(--brand-primary)' : 'transparent',
            color: approvalFilter === f ? '#fff' : 'var(--text-muted)',
          }}>
          {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : f === 'data_product' ? 'Data Products' : f === 'domain_ownership' ? 'Domain Ownership' : f === 'glossary_term' ? 'Glossary Terms' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
        </button>
      ))}
    </div>

    {approvalActionError && (
      <div style={{ marginBottom: 12, color: 'var(--status-error-text)', fontSize: 13 }}>{approvalActionError}</div>
    )}

    {approvals.length === 0 ? (
      <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0' }}>No approval requests found.</div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {approvals.map(item => (
          <div key={item.approval_id} style={{
            display: 'grid', gridTemplateColumns: '100px 1fr 120px 100px 80px auto',
            alignItems: 'center', gap: 12, padding: '12px 16px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          }}>
            {/* Entity type badge */}
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: 'var(--surface-muted)', color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {item.entity_type.replace('_', ' ')}
            </span>

            {/* Name from snapshot */}
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>
                {String(item.entity_snapshot?.policy_name ?? item.entity_snapshot?.contract_name ?? item.entity_snapshot?.name ?? item.entity_id)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>by {item.requested_by}</div>
            </div>

            {/* Status badge */}
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: item.status === 'pending' ? 'var(--status-warn-bg)' : item.status === 'approved' ? 'var(--status-ok-bg)' : 'var(--status-error-bg)',
              color: item.status === 'pending' ? 'var(--status-warn-text)' : item.status === 'approved' ? 'var(--status-ok-text)' : 'var(--status-error-text)',
            }}>
              {item.status}
            </span>

            {/* Date */}
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(item.created_at)}</span>

            {/* Reviewed by */}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.reviewed_by ?? '—'}</span>

            {/* Actions */}
            {item.status === 'pending' && currentUser?.role && ['admin', 'domain_owner'].includes(currentUser.role) && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  disabled={approvalActionLoading === item.approval_id}
                  onClick={async () => {
                    setApprovalActionLoading(item.approval_id)
                    setApprovalActionError(null)
                    try {
                      const res = await fetch(`/api/governance/approvals/${item.approval_id}?action=approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
                      if (!res.ok) throw new Error('Approve failed')
                      setApprovalsLoaded(false); loadApprovals()
                    } catch { setApprovalActionError('Approve failed') }
                    finally { setApprovalActionLoading(null) }
                  }}
                  style={{ padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontWeight: 600 }}
                >
                  Approve
                </button>
                <button
                  disabled={approvalActionLoading === item.approval_id}
                  onClick={() => { setRejectTarget(item); setRejectNote('') }}
                  style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, background: 'transparent', color: 'var(--text-muted)' }}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    )}

    {/* Reject modal */}
    {rejectTarget && (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} onClick={() => setRejectTarget(null)}>
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw' }}
          onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Reject: {String(rejectTarget.entity_snapshot?.policy_name ?? rejectTarget.entity_id)}</h3>
          <textarea
            placeholder="Reason for rejection (optional)"
            value={rejectNote}
            onChange={e => setRejectNote(e.target.value)}
            style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setRejectTarget(null)} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent' }}>Cancel</button>
            <button onClick={async () => {
              if (!rejectTarget) return
              setApprovalActionLoading(rejectTarget.approval_id)
              setApprovalActionError(null)
              try {
                const res = await fetch(`/api/governance/approvals/${rejectTarget.approval_id}?action=reject`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ feedback: rejectNote }),
                })
                if (!res.ok) throw new Error('Reject failed')
                setRejectTarget(null); setApprovalsLoaded(false); loadApprovals()
              } catch { setApprovalActionError('Reject failed') }
              finally { setApprovalActionLoading(null) }
            }}
              style={{ padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontWeight: 600 }}>
              Confirm Reject
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Remove stale pendingTerms state and related fetch calls**

Search for `setPendingTerms`, `pendingTerms`, `govRejectTarget`, `govRejectNote`, `govActionLoading`, `govActionError` and remove them. Also remove the glossary-terms fetch from `loadData` or any useEffect that fetched `/api/glossary?status=pending_review`.

- [ ] **Step 6: Verify in browser**

Start the dev server and navigate to `/governance`. Confirm:
- Tab shows "Approvals" not "Pending"
- Filter buttons appear
- Empty state shows when no approvals pending
- If current user is admin/domain_owner, approve/reject buttons appear on pending items

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run dev
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/governance/page.tsx
git commit -m "feat(policy): replace Pending tab with unified Approvals queue"
```

---

## Task 9: Frontend — Policy History Panel

**Files:**
- Modify: `frontend/src/app/governance/page.tsx`

**What to change:** Add a "History" tab to the policy detail side panel (which currently shows violations). When selected, fetch `/api/governance/policies/{id}/versions` and render a timeline with expandable field diffs.

- [ ] **Step 1: Add version state and fetch**

In the component state block in `page.tsx`, add:

```typescript
const [policyVersions, setPolicyVersions] = useState<PolicyVersion[]>([])
const [versionsLoading, setVersionsLoading] = useState(false)
const [policyPanelTab, setPolicyPanelTab] = useState<'violations' | 'history'>('violations')
```

Add the `PolicyVersion` interface near the other interfaces:

```typescript
interface PolicyVersion {
  version_id: string
  policy_id: string
  version_number: number
  changed_by: string
  changed_at: string
  change_summary: string | null
  field_diffs: Array<{ field: string; old_value: unknown; new_value: unknown }>
  snapshot: Record<string, unknown>
}
```

- [ ] **Step 2: Fetch versions when History tab is selected**

Add a useEffect:

```typescript
useEffect(() => {
  if (policyPanelTab === 'history' && selectedPolicy) {
    setVersionsLoading(true)
    fetch(`/api/governance/policies/${selectedPolicy.id}/versions`)
      .then(r => r.json())
      .then(data => setPolicyVersions(Array.isArray(data) ? data : []))
      .catch(() => setPolicyVersions([]))
      .finally(() => setVersionsLoading(false))
  }
}, [policyPanelTab, selectedPolicy])
```

Also reset `policyPanelTab` to `'violations'` when `selectedPolicy` changes:

```typescript
useEffect(() => { setPolicyPanelTab('violations') }, [selectedPolicy])
```

- [ ] **Step 3: Add History tab to the policy side panel**

Find the policy side panel JSX (look for `selectedPolicy &&` rendering the side panel). Add a tab bar above the violations list:

```tsx
{/* Panel tab bar */}
<div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
  {(['violations', 'history'] as const).map(pt => (
    <button key={pt} onClick={() => setPolicyPanelTab(pt)}
      style={{
        padding: '4px 12px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
        background: policyPanelTab === pt ? 'var(--brand-primary)' : 'transparent',
        color: policyPanelTab === pt ? '#fff' : 'var(--text-muted)', fontWeight: 500,
      }}>
      {pt === 'violations' ? 'Violations' : 'History'}
    </button>
  ))}
</div>

{policyPanelTab === 'violations' && (
  /* existing violations JSX — leave unchanged */
  <></>
)}

{policyPanelTab === 'history' && (
  versionsLoading ? (
    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
  ) : policyVersions.length === 0 ? (
    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No version history yet — history is recorded each time a policy is approved.</div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {policyVersions.map(v => (
        <VersionRow key={v.version_id} version={v} />
      ))}
    </div>
  )
)}
```

- [ ] **Step 4: Add VersionRow component**

Above the `GovernancePage` export, add a small component:

```tsx
function VersionRow({ version }: { version: { version_number: number; changed_by: string; changed_at: string; change_summary: string | null; field_diffs: Array<{ field: string; old_value: unknown; new_value: unknown }> } }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer',
          background: 'var(--surface)', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13 }}>v{version.version_number}</span>
          <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>{version.change_summary ?? 'Updated'} · {fmtDate(version.changed_at)} · {version.changed_by}</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && version.field_diffs.length > 0 && (
        <div style={{ padding: '10px 14px', background: 'var(--surface-muted)', borderTop: '1px solid var(--border)' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th style={{ textAlign: 'left', padding: '2px 8px', fontWeight: 600 }}>Field</th>
                <th style={{ textAlign: 'left', padding: '2px 8px', fontWeight: 600 }}>Old</th>
                <th style={{ textAlign: 'left', padding: '2px 8px', fontWeight: 600 }}>New</th>
              </tr>
            </thead>
            <tbody>
              {version.field_diffs.map((d, i) => (
                <tr key={i}>
                  <td style={{ padding: '2px 8px', color: 'var(--text-muted)' }}>{d.field}</td>
                  <td style={{ padding: '2px 8px', color: 'var(--status-error-text)' }}>{String(d.old_value ?? '—')}</td>
                  <td style={{ padding: '2px 8px', color: 'var(--status-ok-text)' }}>{String(d.new_value ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify in browser**

Navigate to `/governance`, click the Policies tab, select a policy to open the side panel. Confirm:
- "Violations" and "History" tabs appear at the top of the side panel
- Clicking "History" fetches and shows versions (empty state if none)
- Each version row is expandable showing the field diff table

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/governance/page.tsx
git commit -m "feat(policy): add History tab to policy side panel with version timeline"
```

---

## Task 10: Frontend — Notification Bell

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

**What to add:** A bell icon button in the top bar (before `<ThemeToggle />`) that shows an unread count badge, expands to a dropdown panel of the last 20 notifications, and polls every 60 seconds.

- [ ] **Step 1: Add NotificationBell component**

In `frontend/src/components/Sidebar.tsx`, add this component above the default export (before the main `export default function Sidebar()`):

```tsx
function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Array<{
    notification_id: string; type: string; title: string; body: string | null;
    entity_type: string | null; entity_id: string | null; is_read: boolean; created_at: string
  }>>([])
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  const load = async () => {
    try {
      const data = await fetch('/api/notifications').then(r => r.json()).catch(() => [])
      setNotifications(Array.isArray(data) ? data.slice(0, 20) : [])
    } catch {}
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const markAllRead = async () => {
    await fetch('/api/notifications?action=read-all', { method: 'POST' }).catch(() => {})
    setNotifications(ns => ns.map(n => ({ ...n, is_read: true })))
  }

  const markOne = async (id: string) => {
    await fetch(`/api/notifications?id=${id}`, { method: 'POST' }).catch(() => {})
    setNotifications(ns => ns.map(n => n.notification_id === id ? { ...n, is_read: true } : n))
  }

  const typeIcon = (type: string) => type === 'violation_detected' ? '⚠️' : type === 'approval_requested' ? '📋' : '✅'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => { setOpen(!open); if (!open) load() }}
        style={{
          position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          padding: 6, borderRadius: 6, color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
        }}
        title="Notifications"
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16,
            background: 'var(--brand-primary)', color: '#fff',
            borderRadius: 8, fontSize: 10, fontWeight: 700, lineHeight: '16px',
            textAlign: 'center', padding: '0 3px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, width: 360, maxHeight: 480,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 200, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ fontSize: 12, color: 'var(--brand-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No notifications</div>
            ) : notifications.map(n => (
              <div
                key={n.notification_id}
                onClick={() => markOne(n.notification_id)}
                style={{
                  padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: n.is_read ? 'transparent' : 'var(--surface-muted)',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{typeIcon(n.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    {n.created_at ? new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add useRef import and mount the bell**

At the top of `Sidebar.tsx`, ensure `useRef` is in the React import:

```typescript
import { useState, useEffect, useRef } from 'react'
```

(It's already imported — verify it's there.)

In the `<header>` JSX, inside the "Right side controls" div, add `<NotificationBell />` before `<ThemeToggle />`:

```tsx
{/* Right side controls */}
<TopBarConnectionSelector />
<NotificationBell />
<ThemeToggle />
```

- [ ] **Step 3: Verify in browser**

Navigate to any page. Confirm:
- Bell icon appears in top bar before the theme toggle
- No unread badge when there are no unread notifications
- Clicking the bell opens the dropdown
- Unread notifications have a distinct background
- "Mark all read" button clears the badge
- Clicking a notification row marks it read

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat(policy): add notification bell with unread badge and dropdown panel"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| No real enforcement engine | Task 3 (enforcement_service) + write-path integration |
| Scheduled auto-evaluation | Task 4 (APScheduler job) |
| No policy approval queue | Task 5 (approval backend) + Task 8 (approvals tab) |
| Approval for data products / domain ownership / contracts | Task 5 (create_approval_request handles entity_type generically) |
| Admin OR domain_owner can approve | Task 5 (require_approver = require_roles("admin", "domain_owner")) |
| Policy versioning — full audit log | Task 6 (GovernancePolicyVersion written on approve) |
| In-app notifications | Task 7 (Notification model + API) + Task 10 (bell UI) |
| Email notifications | Task 2 (notification_service.send_email) |
| Notifications: violations → owner, approvals → domain approvers | Task 4 (violation notify in governance_service) + Task 5 (approval notify in approve/reject handlers — **gap**: Task 5 approve/reject handlers do not yet call create_notification) |

**Gap found:** `approve_request` and `reject_request` in Task 5 notify the submitter but the notification call is not included in the code blocks above. Add these calls inside both handlers:

In `approve_request`, after `await db.commit()`:
```python
    try:
        from app.services.notification_service import create_notification
        await create_notification(
            user_email=approval.requested_by,
            type="approval_decided",
            title=f"Your {approval.entity_type} was approved",
            body=f"Approved by {user.get('email')}",
            entity_type=approval.entity_type,
            entity_id=approval.entity_id,
            db=db,
        )
    except Exception as _ne:
        logger.warning("Notification failed: %s", _ne)
```

In `reject_request`, after `await db.commit()`:
```python
    try:
        from app.services.notification_service import create_notification
        await create_notification(
            user_email=approval.requested_by,
            type="approval_decided",
            title=f"Your {approval.entity_type} was rejected",
            body=approval.feedback or "No feedback provided",
            entity_type=approval.entity_type,
            entity_id=approval.entity_id,
            db=db,
        )
    except Exception as _ne:
        logger.warning("Notification failed: %s", _ne)
```

Add a logger at the top of the approval section in governance.py:
```python
import logging
_gov_logger = logging.getLogger("dq_platform.governance")
```

Replace `logger` with `_gov_logger` in the notification try/except blocks.

**Type consistency check:** All tasks use `notification_id`, `approval_id`, `version_id` as field names consistently. `create_notification` signature matches between Task 2 definition and all call sites in Tasks 4 and 5.

**Placeholder check:** No TBD or TODO found in plan code blocks.
