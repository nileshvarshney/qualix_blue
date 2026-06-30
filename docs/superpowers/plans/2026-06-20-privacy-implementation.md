# Data Protection & Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all missing Data Protection & Privacy features: migration 0026, DSR workflow, consent management, data residency, masking UI, compliance KPI fixes, and navigation.

**Architecture:** FastAPI backend extended in `app/api/privacy.py` and `app/api/compliance.py`; three new SQLAlchemy models; Alembic migration 0026; Next.js 15 `/privacy` page with 4 tabs; proxy routes under `/api/privacy/` and `/api/compliance/`.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, SQLite (dev), Next.js 15, TypeScript.

## Global Constraints

- All new SQLAlchemy models follow the pattern in `app/db/models.py`: `Mapped[str]`, `mapped_column`, `default=gen_uuid`, `default=now`
- Migration uses `_table_exists(bind, name)` guard (same pattern as `0025_policy_management.py`)
- No VARIANT columns in new tables — use `sa.Text()` for JSON stored as strings
- Frontend proxy routes: `const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'`, `export const dynamic = 'force-dynamic'`
- Run backend tests with: `cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/ -x -q`
- Backend is already running; restart after Python changes: `pkill -f uvicorn; cd /Users/laxmansrigiri/git_repo/DataGuard && uvicorn app.main:app --reload &`

---

### Task 1: Add three new SQLAlchemy models

**Files:**
- Modify: `app/db/models.py` (append after `MaskingPolicy` class, line ~1157)
- Create: `tests/test_privacy_models.py`

**Interfaces:**
- Produces: `DataSubjectRequest`, `ConsentRecord`, `DataResidencyPolicy` — importable from `app.db.models`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_privacy_models.py
def test_data_subject_request_model():
    from app.db.models import DataSubjectRequest
    assert hasattr(DataSubjectRequest, 'dsr_id')
    assert hasattr(DataSubjectRequest, 'subject_email')
    assert hasattr(DataSubjectRequest, 'request_type')
    assert hasattr(DataSubjectRequest, 'status')
    assert hasattr(DataSubjectRequest, 'affected_tables')
    assert hasattr(DataSubjectRequest, 'completed_at')

def test_consent_record_model():
    from app.db.models import ConsentRecord
    assert hasattr(ConsentRecord, 'consent_id')
    assert hasattr(ConsentRecord, 'purpose')
    assert hasattr(ConsentRecord, 'legal_basis')
    assert hasattr(ConsentRecord, 'opt_in')

def test_data_residency_policy_model():
    from app.db.models import DataResidencyPolicy
    assert hasattr(DataResidencyPolicy, 'residency_id')
    assert hasattr(DataResidencyPolicy, 'allowed_regions')
    assert hasattr(DataResidencyPolicy, 'prohibited_regions')
    assert hasattr(DataResidencyPolicy, 'data_sovereignty_country')
```

- [ ] **Step 2: Run test — verify FAIL**

```
python -m pytest tests/test_privacy_models.py -v
```
Expected: `ImportError: cannot import name 'DataSubjectRequest'`

- [ ] **Step 3: Add models to `app/db/models.py`**

Append after the `MaskingPolicy` class (after line 1156):

```python
class DataSubjectRequest(Base):
    __tablename__ = "data_subject_requests"

    dsr_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    subject_email: Mapped[str] = mapped_column(String(200), nullable=False)
    request_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    description: Mapped[Optional[str]] = mapped_column(Text)
    affected_tables: Mapped[Optional[str]] = mapped_column(Text)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    requested_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ConsentRecord(Base):
    __tablename__ = "consent_records"

    consent_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True)
    purpose: Mapped[str] = mapped_column(String(300), nullable=False)
    legal_basis: Mapped[str] = mapped_column(String(50), nullable=False)
    data_subject_type: Mapped[Optional[str]] = mapped_column(String(100))
    requires_explicit_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    opt_in: Mapped[bool] = mapped_column(Boolean, default=True)
    recorded_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class DataResidencyPolicy(Base):
    __tablename__ = "data_residency_policies"

    residency_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("assets.asset_id"), nullable=True)
    domain_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("domains.domain_id"), nullable=True)
    allowed_regions: Mapped[Optional[str]] = mapped_column(Text)
    prohibited_regions: Mapped[Optional[str]] = mapped_column(Text)
    data_sovereignty_country: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[Optional[str]] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
```

- [ ] **Step 4: Run test — verify PASS**

```
python -m pytest tests/test_privacy_models.py -v
```
Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py tests/test_privacy_models.py
git commit -m "feat(privacy): add DataSubjectRequest, ConsentRecord, DataResidencyPolicy models"
```

---

### Task 2: Alembic migration 0026

**Files:**
- Create: `migrations/versions/0026_privacy_compliance_tables.py`

**Interfaces:**
- Consumes: nothing (standalone migration)
- Produces: 8 tables guaranteed to exist in DB after `alembic upgrade head`

- [ ] **Step 1: Create migration file**

```python
# migrations/versions/0026_privacy_compliance_tables.py
"""privacy & compliance tables: add DSR, consent, residency; ensure compliance tables exist"""

from alembic import op
import sqlalchemy as sa

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def _table_exists(bind, name: str) -> bool:
    try:
        bind.execute(sa.text(f"SELECT 1 FROM {name} LIMIT 1"))
        return True
    except Exception:
        return False


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "compliance_frameworks"):
        op.create_table(
            "compliance_frameworks",
            sa.Column("framework_id", sa.String(36), primary_key=True),
            sa.Column("framework_name", sa.String(100), nullable=False, unique=True),
            sa.Column("version", sa.String(20), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        )

    if not _table_exists(bind, "compliance_requirements"):
        op.create_table(
            "compliance_requirements",
            sa.Column("req_id", sa.String(36), primary_key=True),
            sa.Column("framework_id", sa.String(36), sa.ForeignKey("compliance_frameworks.framework_id"), nullable=False),
            sa.Column("req_code", sa.String(50), nullable=True),
            sa.Column("req_name", sa.String(200), nullable=True),
            sa.Column("req_description", sa.Text(), nullable=True),
            sa.Column("dq_rule_types", sa.Text(), nullable=True),
        )
        op.create_index("ix_compliance_req_framework", "compliance_requirements", ["framework_id"])

    if not _table_exists(bind, "compliance_mappings"):
        op.create_table(
            "compliance_mappings",
            sa.Column("mapping_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("framework_id", sa.String(36), sa.ForeignKey("compliance_frameworks.framework_id"), nullable=False),
            sa.Column("req_id", sa.String(36), sa.ForeignKey("compliance_requirements.req_id"), nullable=True),
            sa.Column("rule_id", sa.String(36), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="mapped"),
            sa.Column("evidence_note", sa.Text(), nullable=True),
            sa.Column("mapped_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_compliance_mapping_framework", "compliance_mappings", ["framework_id", "asset_id"])

    if not _table_exists(bind, "masking_policies"):
        op.create_table(
            "masking_policies",
            sa.Column("policy_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("column_name", sa.String(200), nullable=False),
            sa.Column("masking_type", sa.String(30), nullable=False),
            sa.Column("applies_to_roles", sa.Text(), nullable=True),
            sa.Column("unmasked_roles", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_masking_policies_asset", "masking_policies", ["asset_id"])

    if not _table_exists(bind, "data_classifications"):
        op.create_table(
            "data_classifications",
            sa.Column("classification_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.asset_id"), nullable=False),
            sa.Column("column_name", sa.String(200), nullable=True),
            sa.Column("classification", sa.String(30), nullable=False),
            sa.Column("justification", sa.Text(), nullable=True),
            sa.Column("applied_by", sa.String(200), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_data_classifications_asset", "data_classifications", ["asset_id"])

    if not _table_exists(bind, "data_subject_requests"):
        op.create_table(
            "data_subject_requests",
            sa.Column("dsr_id", sa.String(36), primary_key=True),
            sa.Column("subject_email", sa.String(200), nullable=False),
            sa.Column("request_type", sa.String(30), nullable=False),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("affected_tables", sa.Text(), nullable=True),
            sa.Column("assigned_to", sa.String(200), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("requested_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_dsr_status", "data_subject_requests", ["status"])
        op.create_index("ix_dsr_subject", "data_subject_requests", ["subject_email"])

    if not _table_exists(bind, "consent_records"):
        op.create_table(
            "consent_records",
            sa.Column("consent_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), nullable=True),
            sa.Column("purpose", sa.String(300), nullable=False),
            sa.Column("legal_basis", sa.String(50), nullable=False),
            sa.Column("data_subject_type", sa.String(100), nullable=True),
            sa.Column("requires_explicit_consent", sa.Boolean(), nullable=False, server_default="false"),
            sa.Column("opt_in", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("recorded_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_consent_records_asset", "consent_records", ["asset_id"])

    if not _table_exists(bind, "data_residency_policies"):
        op.create_table(
            "data_residency_policies",
            sa.Column("residency_id", sa.String(36), primary_key=True),
            sa.Column("asset_id", sa.String(36), nullable=True),
            sa.Column("domain_id", sa.String(36), nullable=True),
            sa.Column("allowed_regions", sa.Text(), nullable=True),
            sa.Column("prohibited_regions", sa.Text(), nullable=True),
            sa.Column("data_sovereignty_country", sa.String(100), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(200), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_residency_asset", "data_residency_policies", ["asset_id"])


def downgrade() -> None:
    bind = op.get_bind()
    for tbl, idx in [
        ("data_residency_policies", "ix_residency_asset"),
        ("consent_records", "ix_consent_records_asset"),
        ("data_subject_requests", "ix_dsr_subject"),
        ("data_classifications", "ix_data_classifications_asset"),
        ("masking_policies", "ix_masking_policies_asset"),
        ("compliance_mappings", "ix_compliance_mapping_framework"),
        ("compliance_requirements", "ix_compliance_req_framework"),
        ("compliance_frameworks", None),
    ]:
        if _table_exists(bind, tbl):
            if idx:
                try:
                    op.drop_index(idx, table_name=tbl)
                except Exception:
                    pass
            op.drop_table(tbl)
    try:
        op.drop_index("ix_dsr_status", table_name="data_subject_requests")
    except Exception:
        pass
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && alembic upgrade head
```
Expected: `Running upgrade 0025 -> 0026`

- [ ] **Step 3: Commit**

```bash
git add migrations/versions/0026_privacy_compliance_tables.py
git commit -m "feat(privacy): migration 0026 — DSR, consent, residency, and compliance tables"
```

---

### Task 3: Auto-map DQ rules to compliance controls

**Files:**
- Modify: `app/db/seed.py` (add `auto_map_rules_to_controls` function)
- Modify: `app/main.py` (call it after compliance seed)
- Create: `tests/test_auto_map_rules.py`

**Interfaces:**
- Consumes: `seed_compliance_frameworks(db)` already called before this
- Produces: `auto_map_rules_to_controls(db: AsyncSession) -> int` — returns count of new mappings created

- [ ] **Step 1: Write the failing test**

```python
# tests/test_auto_map_rules.py
def test_auto_map_rules_to_controls_importable():
    from app.db.seed import auto_map_rules_to_controls
    import inspect
    assert inspect.iscoroutinefunction(auto_map_rules_to_controls)
```

- [ ] **Step 2: Run test — verify FAIL**

```
python -m pytest tests/test_auto_map_rules.py -v
```
Expected: `ImportError: cannot import name 'auto_map_rules_to_controls'`

- [ ] **Step 3: Add `auto_map_rules_to_controls` to `app/db/seed.py`**

Add after the `seed_compliance_frameworks` function (after line ~302):

```python
async def auto_map_rules_to_controls(db: AsyncSession) -> int:
    """Map active DQ rules to compliance requirements by rule_type. Idempotent."""
    from sqlalchemy import select
    from app.db.models import DQRule, ComplianceRequirement, ComplianceMapping

    reqs_result = await db.execute(select(ComplianceRequirement))
    requirements = reqs_result.scalars().all()
    if not requirements:
        return 0

    rules_result = await db.execute(select(DQRule).where(DQRule.is_active == True))
    rules = rules_result.scalars().all()
    if not rules:
        return 0

    # Build lookup: rule_type -> list of rules
    by_type: dict[str, list] = {}
    for r in rules:
        by_type.setdefault(r.rule_type, []).append(r)

    # Check existing mappings to avoid duplicates
    existing_result = await db.execute(
        select(ComplianceMapping.framework_id, ComplianceMapping.req_id, ComplianceMapping.rule_id)
    )
    existing_keys = {(r[0], r[1], r[2]) for r in existing_result.all()}

    mapped = 0
    for req in requirements:
        if not req.dq_rule_types:
            continue
        rule_types = [rt.strip() for rt in req.dq_rule_types.split(",") if rt.strip()]
        for rt in rule_types:
            for rule in by_type.get(rt, []):
                key = (req.framework_id, req.req_id, rule.rule_id)
                if key in existing_keys:
                    continue
                db.add(ComplianceMapping(
                    mapping_id=gen_uuid(),
                    asset_id=rule.asset_id,
                    framework_id=req.framework_id,
                    req_id=req.req_id,
                    rule_id=rule.rule_id,
                    status="mapped",
                    mapped_by="system",
                    created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                ))
                existing_keys.add(key)
                mapped += 1

    if mapped:
        await db.flush()
    return mapped
```

- [ ] **Step 4: Wire into `app/main.py`** — replace the compliance seed block (lines ~101–108):

```python
        try:
            from app.db.seed import seed_compliance_frameworks, auto_map_rules_to_controls
            async with AsyncSessionLocal() as db:
                await seed_compliance_frameworks(db)
                await db.commit()
            async with AsyncSessionLocal() as db:
                n = await auto_map_rules_to_controls(db)
                await db.commit()
                if n:
                    logger.info("Auto-mapped %d DQ rules to compliance controls", n)
        except Exception as _ce:
            logger.warning("Compliance framework init skipped: %s", _ce)
```

- [ ] **Step 5: Run test — verify PASS**

```
python -m pytest tests/test_auto_map_rules.py -v
```
Expected: 1 PASSED

- [ ] **Step 6: Commit**

```bash
git add app/db/seed.py app/main.py tests/test_auto_map_rules.py
git commit -m "feat(compliance): auto-map existing DQ rules to compliance controls on startup"
```

---

### Task 4: Backend DSR, consent, residency endpoints + evidence masking

**Files:**
- Modify: `app/api/privacy.py` (add ~130 lines)
- Create: `tests/test_privacy_api.py`

**Interfaces:**
- Consumes: `DataSubjectRequest`, `ConsentRecord`, `DataResidencyPolicy` from Task 1
- Produces:
  - `GET/POST /privacy/dsr`, `PATCH /privacy/dsr/{id}`, `DELETE /privacy/dsr/{id}`
  - `GET/POST /privacy/consent`, `DELETE /privacy/consent/{id}`
  - `GET/POST /privacy/residency`, `DELETE /privacy/residency/{id}`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_privacy_api.py
def test_dsr_route_importable():
    from app.api.privacy import router
    routes = [r.path for r in router.routes]
    assert any("dsr" in p for p in routes)

def test_consent_route_importable():
    from app.api.privacy import router
    routes = [r.path for r in router.routes]
    assert any("consent" in p for p in routes)

def test_residency_route_importable():
    from app.api.privacy import router
    routes = [r.path for r in router.routes]
    assert any("residency" in p for p in routes)
```

- [ ] **Step 2: Run test — verify FAIL**

```
python -m pytest tests/test_privacy_api.py -v
```
Expected: 3 FAILED (no dsr/consent/residency routes)

- [ ] **Step 3: Append to `app/api/privacy.py`**

Add these imports at the top of `app/api/privacy.py` (after the existing imports):

```python
import json as _json
from app.db.models import DataSubjectRequest, ConsentRecord, DataResidencyPolicy
```

Then append the following to the end of `app/api/privacy.py`:

```python
# ── DSR ──────────────────────────────────────────────────────────────────────

DSR_TYPES = {"erasure", "access", "rectification", "portability", "opt_out"}
DSR_STATUSES = {"pending", "in_review", "completed", "rejected"}
DSR_TRANSITIONS = {
    "pending": {"in_review"},
    "in_review": {"completed", "rejected"},
}


def _fmt_dsr(d: DataSubjectRequest) -> dict:
    return {
        "dsr_id": d.dsr_id,
        "subject_email": d.subject_email,
        "request_type": d.request_type,
        "status": d.status,
        "description": d.description,
        "affected_tables": _json.loads(d.affected_tables) if d.affected_tables else [],
        "assigned_to": d.assigned_to,
        "notes": d.notes,
        "requested_by": d.requested_by,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "completed_at": d.completed_at.isoformat() if d.completed_at else None,
    }


@router.get("/dsr")
async def list_dsr(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(DataSubjectRequest).order_by(DataSubjectRequest.created_at.desc())
    if status:
        q = q.where(DataSubjectRequest.status == status)
    result = await db.execute(q)
    return [_fmt_dsr(d) for d in result.scalars().all()]


@router.post("/dsr", status_code=201)
async def create_dsr(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    req_type = payload.get("request_type")
    if req_type not in DSR_TYPES:
        raise HTTPException(400, f"request_type must be one of {sorted(DSR_TYPES)}")
    subject = payload.get("subject_email", "").strip()
    if not subject:
        raise HTTPException(400, "subject_email is required")
    tables = payload.get("affected_tables", [])
    dsr = DataSubjectRequest(
        subject_email=subject,
        request_type=req_type,
        status="pending",
        description=payload.get("description"),
        affected_tables=_json.dumps(tables) if tables else None,
        assigned_to=payload.get("assigned_to"),
        requested_by=user.get("email"),
        created_at=_now(),
    )
    db.add(dsr)
    await db.commit()
    await db.refresh(dsr)
    return _fmt_dsr(dsr)


@router.patch("/dsr/{dsr_id}")
async def update_dsr(
    dsr_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    dsr = (await db.execute(select(DataSubjectRequest).where(DataSubjectRequest.dsr_id == dsr_id))).scalar_one_or_none()
    if not dsr:
        raise HTTPException(404, "DSR not found")
    new_status = payload.get("status")
    if new_status:
        allowed = DSR_TRANSITIONS.get(dsr.status, set())
        if new_status not in DSR_STATUSES:
            raise HTTPException(400, f"Invalid status: {new_status}")
        if new_status not in allowed and new_status != dsr.status:
            raise HTTPException(400, f"Cannot transition from {dsr.status!r} to {new_status!r}")
        dsr.status = new_status
        if new_status in ("completed", "rejected"):
            dsr.completed_at = _now()
    if "assigned_to" in payload:
        dsr.assigned_to = payload["assigned_to"]
    if "notes" in payload:
        dsr.notes = payload["notes"]
    await db.commit()
    return _fmt_dsr(dsr)


@router.delete("/dsr/{dsr_id}", status_code=204)
async def delete_dsr(
    dsr_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    dsr = (await db.execute(select(DataSubjectRequest).where(DataSubjectRequest.dsr_id == dsr_id))).scalar_one_or_none()
    if not dsr:
        raise HTTPException(404, "DSR not found")
    await db.delete(dsr)
    await db.commit()


# ── Consent ───────────────────────────────────────────────────────────────────

LEGAL_BASES = {"consent", "legitimate_interest", "contract", "legal_obligation", "vital_interests", "public_task"}


def _fmt_consent(c: ConsentRecord) -> dict:
    return {
        "consent_id": c.consent_id,
        "asset_id": c.asset_id,
        "purpose": c.purpose,
        "legal_basis": c.legal_basis,
        "data_subject_type": c.data_subject_type,
        "requires_explicit_consent": c.requires_explicit_consent,
        "opt_in": c.opt_in,
        "recorded_by": c.recorded_by,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/consent")
async def list_consent(
    asset_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    q = select(ConsentRecord).order_by(ConsentRecord.created_at.desc())
    if asset_id:
        q = q.where(ConsentRecord.asset_id == asset_id)
    result = await db.execute(q)
    return [_fmt_consent(c) for c in result.scalars().all()]


@router.post("/consent", status_code=201)
async def create_consent(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    basis = payload.get("legal_basis")
    if basis not in LEGAL_BASES:
        raise HTTPException(400, f"legal_basis must be one of {sorted(LEGAL_BASES)}")
    purpose = payload.get("purpose", "").strip()
    if not purpose:
        raise HTTPException(400, "purpose is required")
    record = ConsentRecord(
        asset_id=payload.get("asset_id"),
        purpose=purpose,
        legal_basis=basis,
        data_subject_type=payload.get("data_subject_type"),
        requires_explicit_consent=bool(payload.get("requires_explicit_consent", False)),
        opt_in=bool(payload.get("opt_in", True)),
        recorded_by=user.get("email"),
        created_at=_now(),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return _fmt_consent(record)


@router.delete("/consent/{consent_id}", status_code=204)
async def delete_consent(
    consent_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    rec = (await db.execute(select(ConsentRecord).where(ConsentRecord.consent_id == consent_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Consent record not found")
    await db.delete(rec)
    await db.commit()


# ── Residency ─────────────────────────────────────────────────────────────────

def _fmt_residency(r: DataResidencyPolicy) -> dict:
    return {
        "residency_id": r.residency_id,
        "asset_id": r.asset_id,
        "domain_id": r.domain_id,
        "allowed_regions": _json.loads(r.allowed_regions) if r.allowed_regions else [],
        "prohibited_regions": _json.loads(r.prohibited_regions) if r.prohibited_regions else [],
        "data_sovereignty_country": r.data_sovereignty_country,
        "notes": r.notes,
        "created_by": r.created_by,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("/residency")
async def list_residency(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    result = await db.execute(select(DataResidencyPolicy).order_by(DataResidencyPolicy.created_at.desc()))
    return [_fmt_residency(r) for r in result.scalars().all()]


@router.post("/residency", status_code=201)
async def create_residency(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    allowed = payload.get("allowed_regions", [])
    prohibited = payload.get("prohibited_regions", [])
    policy = DataResidencyPolicy(
        asset_id=payload.get("asset_id"),
        domain_id=payload.get("domain_id"),
        allowed_regions=_json.dumps(allowed) if allowed else None,
        prohibited_regions=_json.dumps(prohibited) if prohibited else None,
        data_sovereignty_country=payload.get("data_sovereignty_country"),
        notes=payload.get("notes"),
        created_by=user.get("email"),
        created_at=_now(),
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return _fmt_residency(policy)


@router.delete("/residency/{residency_id}", status_code=204)
async def delete_residency(
    residency_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    rec = (await db.execute(select(DataResidencyPolicy).where(DataResidencyPolicy.residency_id == residency_id))).scalar_one_or_none()
    if not rec:
        raise HTTPException(404, "Residency policy not found")
    await db.delete(rec)
    await db.commit()
```

- [ ] **Step 4: Run tests — verify PASS**

```
python -m pytest tests/test_privacy_api.py -v
```
Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add app/api/privacy.py app/db/models.py tests/test_privacy_api.py
git commit -m "feat(privacy): add DSR, consent, and residency endpoints"
```

---

### Task 5: Compliance assess-all endpoint

**Files:**
- Modify: `app/api/compliance.py` (add `assess_all` endpoint after `assess_asset`)

**Interfaces:**
- Consumes: existing `assess_asset` logic (lines ~236–322 of compliance.py)
- Produces: `POST /compliance/frameworks/{framework_id}/assess/all` → `{total_assets, compliant, gaps, per_asset: [...]}`

- [ ] **Step 1: Add endpoint to `app/api/compliance.py`**

Add after the `assess_asset` function (after line ~322):

```python
@router.post("/frameworks/{framework_id}/assess/all")
async def assess_all_assets(
    framework_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Run compliance assessment for a framework across every asset that has DQ rules."""
    from app.db.models import gen_uuid, now as model_now

    fw_result = await db.execute(
        select(ComplianceFramework).where(ComplianceFramework.framework_id == framework_id)
    )
    framework = fw_result.scalar_one_or_none()
    if not framework:
        raise HTTPException(404, "Framework not found")

    # Get all assets that have at least one DQ rule
    assets_result = await db.execute(
        select(Asset).where(
            Asset.asset_id.in_(select(DQRule.asset_id).where(DQRule.is_active == True).distinct())
        )
    )
    assets = assets_result.scalars().all()

    reqs_result = await db.execute(
        select(ComplianceRequirement).where(ComplianceRequirement.framework_id == framework_id)
    )
    requirements = reqs_result.scalars().all()

    total_compliant = 0
    total_gaps = 0
    per_asset = []

    for asset in assets:
        asset_compliant = 0
        asset_gaps = 0
        for req in requirements:
            mapping_result = await db.execute(
                select(ComplianceMapping).where(
                    ComplianceMapping.asset_id == asset.asset_id,
                    ComplianceMapping.framework_id == framework_id,
                    ComplianceMapping.req_id == req.req_id,
                )
            )
            mapping = mapping_result.scalar_one_or_none()
            new_status = "gap"
            if mapping and mapping.rule_id:
                run_result = await db.execute(
                    select(DQRuleRun)
                    .where(DQRuleRun.rule_id == mapping.rule_id, DQRuleRun.status == "passed")
                    .order_by(desc(DQRuleRun.created_at))
                    .limit(1)
                )
                new_status = "compliant" if run_result.scalar_one_or_none() else "gap"
            if mapping:
                mapping.status = new_status
            else:
                mapping = ComplianceMapping(
                    mapping_id=gen_uuid(),
                    asset_id=asset.asset_id,
                    framework_id=framework_id,
                    req_id=req.req_id,
                    status=new_status,
                    mapped_by=user.get("email"),
                    created_at=model_now(),
                )
                db.add(mapping)
            if new_status == "compliant":
                asset_compliant += 1
            else:
                asset_gaps += 1
        total_compliant += asset_compliant
        total_gaps += asset_gaps
        per_asset.append({
            "asset_id": asset.asset_id,
            "sf_table_name": asset.sf_table_name,
            "compliant": asset_compliant,
            "gaps": asset_gaps,
        })

    await db.commit()
    return {
        "framework_id": framework_id,
        "total_assets": len(assets),
        "compliant": total_compliant,
        "gaps": total_gaps,
        "per_asset": per_asset,
    }
```

- [ ] **Step 2: Run existing tests**

```
python -m pytest tests/ -x -q
```
Expected: all existing tests pass

- [ ] **Step 3: Commit**

```bash
git add app/api/compliance.py
git commit -m "feat(compliance): add assess-all endpoint to run assessment across all assets"
```

---

### Task 6: Next.js API proxy routes

**Files to create** (12 files):
- `frontend/src/app/api/privacy/masking-policies/route.ts`
- `frontend/src/app/api/privacy/masking-policies/[id]/route.ts`
- `frontend/src/app/api/privacy/pii-exposure/route.ts`
- `frontend/src/app/api/privacy/dsr/route.ts`
- `frontend/src/app/api/privacy/dsr/[id]/route.ts`
- `frontend/src/app/api/privacy/consent/route.ts`
- `frontend/src/app/api/privacy/consent/[id]/route.ts`
- `frontend/src/app/api/privacy/residency/route.ts`
- `frontend/src/app/api/privacy/residency/[id]/route.ts`
- `frontend/src/app/api/compliance/seed/route.ts`
- `frontend/src/app/api/compliance/[frameworkId]/assess-all/route.ts`

- [ ] **Step 1: Create all proxy route files**

`frontend/src/app/api/privacy/masking-policies/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('asset_id')
  const url = s ? `${B}/privacy/masking-policies?asset_id=${s}` : `${B}/privacy/masking-policies`
  try {
    const r = await fetch(url, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json([], { status: 200 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await fetch(`${B}/privacy/masking-policies`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
```

`frontend/src/app/api/privacy/masking-policies/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await fetch(`${B}/privacy/masking-policies/${id}`, {
      method: 'DELETE', headers: { Authorization: req.headers.get('Authorization') ?? '' },
    })
    return new NextResponse(null, { status: r.status })
  } catch { return new NextResponse(null, { status: 500 }) }
}
```

`frontend/src/app/api/privacy/pii-exposure/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const r = await fetch(`${B}/privacy/pii-exposure-report`, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json({ unprotected_pii_tables: 0, assets: [] }) }
}
```

`frontend/src/app/api/privacy/dsr/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get('status')
  const url = s ? `${B}/privacy/dsr?status=${s}` : `${B}/privacy/dsr`
  try {
    const r = await fetch(url, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json([]) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await fetch(`${B}/privacy/dsr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
```

`frontend/src/app/api/privacy/dsr/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const r = await fetch(`${B}/privacy/dsr/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await fetch(`${B}/privacy/dsr/${id}`, { method: 'DELETE', headers: { Authorization: req.headers.get('Authorization') ?? '' } })
    return new NextResponse(null, { status: r.status })
  } catch { return new NextResponse(null, { status: 500 }) }
}
```

`frontend/src/app/api/privacy/consent/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const a = req.nextUrl.searchParams.get('asset_id')
  const url = a ? `${B}/privacy/consent?asset_id=${a}` : `${B}/privacy/consent`
  try {
    const r = await fetch(url, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json([]) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await fetch(`${B}/privacy/consent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
```

`frontend/src/app/api/privacy/consent/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await fetch(`${B}/privacy/consent/${id}`, { method: 'DELETE', headers: { Authorization: req.headers.get('Authorization') ?? '' } })
    return new NextResponse(null, { status: r.status })
  } catch { return new NextResponse(null, { status: 500 }) }
}
```

`frontend/src/app/api/privacy/residency/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const r = await fetch(`${B}/privacy/residency`, { headers: { Authorization: req.headers.get('Authorization') ?? '' }, cache: 'no-store' })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch { return NextResponse.json([]) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const r = await fetch(`${B}/privacy/residency`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body: JSON.stringify(body),
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
```

`frontend/src/app/api/privacy/residency/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const r = await fetch(`${B}/privacy/residency/${id}`, { method: 'DELETE', headers: { Authorization: req.headers.get('Authorization') ?? '' } })
    return new NextResponse(null, { status: r.status })
  } catch { return new NextResponse(null, { status: 500 }) }
}
```

`frontend/src/app/api/compliance/seed/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const r = await fetch(`${B}/compliance/seed`, { method: 'POST', headers: { Authorization: req.headers.get('Authorization') ?? '' } })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
```

`frontend/src/app/api/compliance/[frameworkId]/assess-all/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest, { params }: { params: Promise<{ frameworkId: string }> }) {
  const { frameworkId } = await params
  try {
    const r = await fetch(`${B}/compliance/frameworks/${frameworkId}/assess/all`, {
      method: 'POST', headers: { Authorization: req.headers.get('Authorization') ?? '' },
    })
    return NextResponse.json(await r.json(), { status: r.status })
  } catch (e) { return NextResponse.json({ detail: String(e) }, { status: 500 }) }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (or only pre-existing errors unrelated to new files)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/privacy/ frontend/src/app/api/compliance/seed/ frontend/src/app/api/compliance/
git commit -m "feat(privacy): add Next.js API proxy routes for DSR, consent, residency, masking, compliance"
```

---

### Task 7: Fix compliance page (KPIs + Seed + Assess buttons)

**Files:**
- Modify: `frontend/src/app/compliance/page.tsx`

- [ ] **Step 1: Apply all three fixes to `frontend/src/app/compliance/page.tsx`**

**Fix A — KPI logic** (line ~83): change `overallPct` to show 0 when data exists:
```typescript
// Replace:
const overallPct = totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : null
// With:
const overallPct = frameworks.length > 0 ? (totalControls > 0 ? Math.round((passedControls / totalControls) * 100) : 0) : null
```

**Fix B — add state variables** after existing state declarations (after line ~31):
```typescript
const [seeding, setSeeding] = useState(false)
const [assessing, setAssessing] = useState<string | null>(null)
```

**Fix C — add seed handler** after `useEffect` blocks (after line ~75):
```typescript
async function handleSeed() {
  setSeeding(true)
  try {
    await fetch('/api/compliance/seed', { method: 'POST' })
    const r = await fetch('/api/compliance')
    const data = await r.json()
    const items = Array.isArray(data) ? data : []
    setFrameworks(items.map((f: Record<string, unknown>, i: number) => ({
      id: String(f.framework_id ?? f.id ?? i),
      name: String(f.framework_name ?? f.name ?? ''),
      version: String(f.version ?? ''),
      description: String(f.description ?? ''),
      controlsTotal: Number(f.controls_total ?? 0),
      controlsPassed: Number(f.controls_passed ?? 0),
      controlsFailed: Number(f.controls_failed ?? 0),
      status: (f.status as 'compliant' | 'partial' | 'non-compliant') ?? 'partial',
    })))
  } finally { setSeeding(false) }
}

async function handleAssessAll(fwId: string) {
  setAssessing(fwId)
  try {
    await fetch(`/api/compliance/${fwId}/assess-all`, { method: 'POST' })
    const r = await fetch('/api/compliance')
    const data = await r.json()
    const items = Array.isArray(data) ? data : []
    setFrameworks(items.map((f: Record<string, unknown>, i: number) => ({
      id: String(f.framework_id ?? f.id ?? i),
      name: String(f.framework_name ?? f.name ?? ''),
      version: String(f.version ?? ''),
      description: String(f.description ?? ''),
      controlsTotal: Number(f.controls_total ?? 0),
      controlsPassed: Number(f.controls_passed ?? 0),
      controlsFailed: Number(f.controls_failed ?? 0),
      status: (f.status as 'compliant' | 'partial' | 'non-compliant') ?? 'partial',
    })))
    if (fwId === selectedFw) {
      const cr = await fetch(`/api/compliance/${fwId}/controls`)
      const cd = await cr.json()
      setControls((Array.isArray(cd) ? cd : []).map((c: Record<string, unknown>) => ({
        id: String(c.req_id ?? ''),
        code: String(c.req_code ?? ''),
        name: String(c.req_name ?? ''),
        description: String(c.req_description ?? ''),
        framework: String(c.framework_name ?? ''),
        status: (c.status as 'passed' | 'failed' | 'not-assessed') ?? 'not-assessed',
        rulesMapped: Number(c.rules_mapped ?? 0),
        lastAssessed: c.last_assessed ? String(c.last_assessed).slice(0, 10) : null,
        evidence: String(c.evidence ?? ''),
        ruleTypes: String(c.dq_rule_types ?? ''),
      })))
    }
  } finally { setAssessing(null) }
}
```

**Fix D — empty state with Seed button**: replace the `frameworks.length === 0` block (lines ~125–127):
```typescript
) : frameworks.length === 0 ? (
  <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
    <div style={{ marginBottom: '12px' }}>No compliance frameworks configured</div>
    <button onClick={handleSeed} disabled={seeding} style={{
      padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: seeding ? 'not-allowed' : 'pointer',
      background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '13px',
    }}>{seeding ? 'Initializing…' : 'Initialize Frameworks'}</button>
  </div>
```

**Fix E — Assess All button per framework card**: inside the framework card `onClick` div (after the progress bar div, before closing `</div>`):
```typescript
<button
  onClick={(e) => { e.stopPropagation(); handleAssessAll(fw.id) }}
  disabled={assessing === fw.id}
  style={{
    marginTop: '8px', width: '100%', padding: '4px 0', borderRadius: '6px', border: '1px solid var(--border)',
    background: 'transparent', cursor: assessing === fw.id ? 'not-allowed' : 'pointer',
    fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500,
  }}
>{assessing === fw.id ? 'Assessing…' : 'Assess All Assets'}</button>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/compliance/page.tsx
git commit -m "fix(compliance): add seed/assess buttons and fix KPI dash-when-empty"
```

---

### Task 8: New `/privacy` page with 4 tabs

**Files:**
- Create: `frontend/src/app/privacy/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/privacy/page.tsx`**

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'

type Tab = 'masking' | 'dsr' | 'consent' | 'residency'

interface MaskingPolicy {
  policy_id: string; asset_id: string; column_name: string; masking_type: string
  unmasked_roles: string | null; created_by: string | null; created_at: string
}
interface PIIExposure { unprotected_pii_tables: number; assets: { asset_id: string; sf_table_name: string }[] }
interface DSR {
  dsr_id: string; subject_email: string; request_type: string; status: string
  description: string | null; affected_tables: string[]; assigned_to: string | null
  notes: string | null; requested_by: string | null; created_at: string; completed_at: string | null
}
interface ConsentRecord {
  consent_id: string; asset_id: string | null; purpose: string; legal_basis: string
  data_subject_type: string | null; requires_explicit_consent: boolean; opt_in: boolean
  recorded_by: string | null; created_at: string
}
interface ResidencyPolicy {
  residency_id: string; asset_id: string | null; domain_id: string | null
  allowed_regions: string[]; prohibited_regions: string[]
  data_sovereignty_country: string | null; notes: string | null; created_at: string
}

const card: React.CSSProperties = { background: 'var(--surface)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--border)' }

const MASKING_TYPES = ['full_mask', 'partial_mask', 'hash', 'tokenize', 'nullify']
const DSR_TYPES = ['erasure', 'access', 'rectification', 'portability', 'opt_out']
const LEGAL_BASES = ['consent', 'legitimate_interest', 'contract', 'legal_obligation', 'vital_interests', 'public_task']
const REGIONS = ['US', 'EU', 'UK', 'APAC', 'CA', 'AU', 'IN', 'JP', 'SG', 'BR']

function statusStyle(s: string): React.CSSProperties {
  if (s === 'completed' || s === 'compliant') return { background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)' }
  if (s === 'pending' || s === 'in_review') return { background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)' }
  return { background: 'var(--status-error-bg)', color: 'var(--status-error-text)' }
}

function Pill({ label }: { label: string }) {
  return <span style={{ ...statusStyle(label), padding: '2px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{label.replace('_', ' ')}</span>
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: '14px', padding: '24px', width: '480px', maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface-muted)', color: 'var(--foreground)', fontSize: '13px', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }
const submitBtn: React.CSSProperties = { marginTop: '16px', width: '100%', padding: '9px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '13px' }

// ── Masking Tab ──────────────────────────────────────────────────────────────
function MaskingTab() {
  const [policies, setPolicies] = useState<MaskingPolicy[]>([])
  const [exposure, setExposure] = useState<PIIExposure>({ unprotected_pii_tables: 0, assets: [] })
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ asset_id: '', column_name: '', masking_type: 'full_mask', unmasked_roles: 'admin,data_steward' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([
      fetch('/api/privacy/masking-policies').then(r => r.json()).catch(() => []),
      fetch('/api/privacy/pii-exposure').then(r => r.json()).catch(() => ({ unprotected_pii_tables: 0, assets: [] })),
    ])
    setPolicies(Array.isArray(p) ? p : [])
    setExposure(e)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    setSaving(true)
    try {
      await fetch('/api/privacy/masking-policies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, unmasked_roles: form.unmasked_roles || null }),
      })
      setShowAdd(false)
      setForm({ asset_id: '', column_name: '', masking_type: 'full_mask', unmasked_roles: 'admin,data_steward' })
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/privacy/masking-policies/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {exposure.unprotected_pii_tables > 0 && (
        <div style={{ ...card, background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)' }}>
          <div style={{ fontWeight: 700, color: 'var(--status-error-text)', fontSize: '14px' }}>
            ⚠ {exposure.unprotected_pii_tables} PII table{exposure.unprotected_pii_tables > 1 ? 's' : ''} with no masking policy
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {exposure.assets.slice(0, 3).map(a => a.sf_table_name).join(', ')}{exposure.assets.length > 3 ? ` +${exposure.assets.length - 3} more` : ''}
          </div>
        </div>
      )}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px' }}>Masking Policies</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '12px' }}>+ Add Policy</button>
        </div>
        {policies.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>No masking policies configured</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Asset', 'Column', 'Type', 'Unmasked Roles', 'Created By', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {policies.map(p => (
                <tr key={p.policy_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>{p.asset_id.slice(0, 8)}…</td>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 600 }}>{p.column_name}</td>
                  <td style={{ padding: '10px' }}><Pill label={p.masking_type} /></td>
                  <td style={{ padding: '10px', fontSize: '11.5px', color: 'var(--text-muted)' }}>{p.unmasked_roles ?? '—'}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{p.created_by ?? '—'}</td>
                  <td style={{ padding: '10px' }}>
                    <button onClick={() => handleDelete(p.policy_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-error-text)', fontSize: '12px' }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <Modal title="Add Masking Policy" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label style={lbl}>Asset ID</label><input style={inp} value={form.asset_id} onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Paste asset UUID" /></div>
            <div><label style={lbl}>Column Name</label><input style={inp} value={form.column_name} onChange={e => setForm(f => ({ ...f, column_name: e.target.value }))} placeholder="e.g. email" /></div>
            <div><label style={lbl}>Masking Type</label>
              <select style={inp} value={form.masking_type} onChange={e => setForm(f => ({ ...f, masking_type: e.target.value }))}>
                {MASKING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Unmasked Roles (comma-separated)</label><input style={inp} value={form.unmasked_roles} onChange={e => setForm(f => ({ ...f, unmasked_roles: e.target.value }))} placeholder="admin,data_steward" /></div>
            <button onClick={handleAdd} disabled={saving || !form.asset_id || !form.column_name} style={{ ...submitBtn, opacity: saving || !form.asset_id || !form.column_name ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Policy'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── DSR Tab ──────────────────────────────────────────────────────────────────
function DSRTab() {
  const [dsrs, setDSRs] = useState<DSR[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ subject_email: '', request_type: 'erasure', description: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const data = await fetch('/api/privacy/dsr').then(r => r.json()).catch(() => [])
    setDSRs(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { load() }, [load])

  const pending = dsrs.filter(d => d.status === 'pending').length
  const inReview = dsrs.filter(d => d.status === 'in_review').length
  const completed = dsrs.filter(d => d.status === 'completed').length

  async function handleAction(id: string, status: string) {
    await fetch(`/api/privacy/dsr/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  async function handleAdd() {
    setSaving(true)
    try {
      await fetch('/api/privacy/dsr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setShowAdd(false)
      setForm({ subject_email: '', request_type: 'erasure', description: '' })
      load()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {[['Pending', pending, 'var(--status-warn-text)'], ['In Review', inReview, 'var(--brand-primary)'], ['Completed', completed, 'var(--status-ok-text)']].map(([label, count, color]) => (
          <div key={String(label)} style={card}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>{label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: String(color) }}>{count}</div>
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px' }}>Data Subject Requests</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '12px' }}>+ New Request</button>
        </div>
        {dsrs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>No data subject requests</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Subject', 'Type', 'Status', 'Assigned To', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {dsrs.map(d => (
                <tr key={d.dsr_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px' }}>{d.subject_email}</td>
                  <td style={{ padding: '10px' }}><Pill label={d.request_type} /></td>
                  <td style={{ padding: '10px' }}><Pill label={d.status} /></td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{d.assigned_to ?? '—'}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.created_at?.slice(0, 10)}</td>
                  <td style={{ padding: '10px', display: 'flex', gap: '6px' }}>
                    {d.status === 'pending' && <button onClick={() => handleAction(d.dsr_id, 'in_review')} style={{ padding: '3px 10px', borderRadius: '5px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '11px', background: 'transparent', color: 'var(--foreground)' }}>Accept</button>}
                    {d.status === 'in_review' && <>
                      <button onClick={() => handleAction(d.dsr_id, 'completed')} style={{ padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11px', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontWeight: 600 }}>Complete</button>
                      <button onClick={() => handleAction(d.dsr_id, 'rejected')} style={{ padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontWeight: 600 }}>Reject</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <Modal title="New Data Subject Request" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label style={lbl}>Subject Email</label><input style={inp} value={form.subject_email} onChange={e => setForm(f => ({ ...f, subject_email: e.target.value }))} placeholder="user@example.com" /></div>
            <div><label style={lbl}>Request Type</label>
              <select style={inp} value={form.request_type} onChange={e => setForm(f => ({ ...f, request_type: e.target.value }))}>
                {DSR_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Description</label><textarea style={{ ...inp, height: '80px', resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Details of the request…" /></div>
            <button onClick={handleAdd} disabled={saving || !form.subject_email} style={{ ...submitBtn, opacity: saving || !form.subject_email ? 0.6 : 1 }}>{saving ? 'Submitting…' : 'Submit Request'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Consent Tab ──────────────────────────────────────────────────────────────
function ConsentTab() {
  const [records, setRecords] = useState<ConsentRecord[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ asset_id: '', purpose: '', legal_basis: 'consent', data_subject_type: '', requires_explicit_consent: false, opt_in: true })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const data = await fetch('/api/privacy/consent').then(r => r.json()).catch(() => [])
    setRecords(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { load() }, [load])

  const optInRate = records.length > 0 ? Math.round((records.filter(r => r.opt_in).length / records.length) * 100) : null

  async function handleAdd() {
    setSaving(true)
    try {
      await fetch('/api/privacy/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setShowAdd(false)
      setForm({ asset_id: '', purpose: '', legal_basis: 'consent', data_subject_type: '', requires_explicit_consent: false, opt_in: true })
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/privacy/consent/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        <div style={card}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>Total Records</div><div style={{ fontSize: '28px', fontWeight: 700, color: records.length > 0 ? 'var(--foreground)' : 'var(--text-muted)' }}>{records.length || '—'}</div></div>
        <div style={card}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>Opt-In Rate</div><div style={{ fontSize: '28px', fontWeight: 700, color: optInRate != null ? 'var(--status-ok-text)' : 'var(--text-muted)' }}>{optInRate != null ? `${optInRate}%` : '—'}</div></div>
        <div style={card}><div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '8px' }}>Explicit Consent</div><div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--foreground)' }}>{records.filter(r => r.requires_explicit_consent).length}</div></div>
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px' }}>Consent Records</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '12px' }}>+ Add Record</button>
        </div>
        {records.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>No consent records</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Purpose', 'Legal Basis', 'Subject Type', 'Opt-In', 'Explicit', 'Recorded By', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.consent_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.purpose}</td>
                  <td style={{ padding: '10px' }}><Pill label={r.legal_basis.replace('_', ' ')} /></td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{r.data_subject_type ?? '—'}</td>
                  <td style={{ padding: '10px' }}><span style={{ fontWeight: 600, color: r.opt_in ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>{r.opt_in ? 'Yes' : 'No'}</span></td>
                  <td style={{ padding: '10px' }}><span style={{ fontWeight: 600, color: r.requires_explicit_consent ? 'var(--brand-primary)' : 'var(--text-muted)' }}>{r.requires_explicit_consent ? 'Yes' : 'No'}</span></td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{r.recorded_by ?? '—'}</td>
                  <td style={{ padding: '10px' }}><button onClick={() => handleDelete(r.consent_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-error-text)', fontSize: '12px' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <Modal title="Add Consent Record" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label style={lbl}>Asset ID (optional)</label><input style={inp} value={form.asset_id} onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Leave blank for global" /></div>
            <div><label style={lbl}>Purpose</label><input style={inp} value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Marketing analytics" /></div>
            <div><label style={lbl}>Legal Basis</label>
              <select style={inp} value={form.legal_basis} onChange={e => setForm(f => ({ ...f, legal_basis: e.target.value }))}>
                {LEGAL_BASES.map(b => <option key={b} value={b}>{b.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Data Subject Type</label><input style={inp} value={form.data_subject_type} onChange={e => setForm(f => ({ ...f, data_subject_type: e.target.value }))} placeholder="e.g. Customer" /></div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.requires_explicit_consent} onChange={e => setForm(f => ({ ...f, requires_explicit_consent: e.target.checked }))} />
                Requires Explicit Consent
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.opt_in} onChange={e => setForm(f => ({ ...f, opt_in: e.target.checked }))} />
                Opt-In
              </label>
            </div>
            <button onClick={handleAdd} disabled={saving || !form.purpose} style={{ ...submitBtn, opacity: saving || !form.purpose ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Record'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Residency Tab ─────────────────────────────────────────────────────────────
function ResidencyTab() {
  const [policies, setPolicies] = useState<ResidencyPolicy[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ asset_id: '', domain_id: '', allowed_regions: [] as string[], prohibited_regions: [] as string[], data_sovereignty_country: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const data = await fetch('/api/privacy/residency').then(r => r.json()).catch(() => [])
    setPolicies(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { load() }, [load])

  function toggleRegion(list: 'allowed_regions' | 'prohibited_regions', region: string) {
    setForm(f => {
      const current = f[list]
      return { ...f, [list]: current.includes(region) ? current.filter(r => r !== region) : [...current, region] }
    })
  }

  async function handleAdd() {
    setSaving(true)
    try {
      await fetch('/api/privacy/residency', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setShowAdd(false)
      setForm({ asset_id: '', domain_id: '', allowed_regions: [], prohibited_regions: [], data_sovereignty_country: '', notes: '' })
      load()
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/privacy/residency/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: '14.5px' }}>Data Residency Policies</div>
          <button onClick={() => setShowAdd(true)} style={{ padding: '6px 16px', borderRadius: '7px', border: 'none', cursor: 'pointer', background: 'var(--brand-primary)', color: '#fff', fontWeight: 600, fontSize: '12px' }}>+ Add Policy</button>
        </div>
        {policies.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border)', borderRadius: '10px' }}>No residency policies configured</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Scope', 'Allowed Regions', 'Prohibited Regions', 'Sovereignty', 'Notes', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontWeight: 500, fontSize: '11.5px' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {policies.map(p => (
                <tr key={p.residency_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>{p.asset_id ? `asset:${p.asset_id.slice(0, 8)}…` : p.domain_id ? `domain:${p.domain_id.slice(0, 8)}…` : 'Global'}</td>
                  <td style={{ padding: '10px' }}>{p.allowed_regions.length > 0 ? p.allowed_regions.map(r => <span key={r} style={{ display: 'inline-block', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', borderRadius: '4px', padding: '1px 6px', fontSize: '11px', marginRight: '4px' }}>{r}</span>) : '—'}</td>
                  <td style={{ padding: '10px' }}>{p.prohibited_regions.length > 0 ? p.prohibited_regions.map(r => <span key={r} style={{ display: 'inline-block', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', borderRadius: '4px', padding: '1px 6px', fontSize: '11px', marginRight: '4px' }}>{r}</span>) : '—'}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px' }}>{p.data_sovereignty_country ?? '—'}</td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)', fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes ?? '—'}</td>
                  <td style={{ padding: '10px' }}><button onClick={() => handleDelete(p.residency_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-error-text)', fontSize: '12px' }}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && (
        <Modal title="Add Residency Policy" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div><label style={lbl}>Asset ID (optional)</label><input style={inp} value={form.asset_id} onChange={e => setForm(f => ({ ...f, asset_id: e.target.value }))} placeholder="Leave blank for domain or global scope" /></div>
            <div><label style={lbl}>Domain ID (optional)</label><input style={inp} value={form.domain_id} onChange={e => setForm(f => ({ ...f, domain_id: e.target.value }))} placeholder="Leave blank for global scope" /></div>
            <div><label style={lbl}>Allowed Regions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {REGIONS.map(r => <button key={r} type="button" onClick={() => toggleRegion('allowed_regions', r)} style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${form.allowed_regions.includes(r) ? 'var(--status-ok-text)' : 'var(--border)'}`, background: form.allowed_regions.includes(r) ? 'var(--status-ok-bg)' : 'transparent', color: form.allowed_regions.includes(r) ? 'var(--status-ok-text)' : 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>{r}</button>)}
              </div>
            </div>
            <div><label style={lbl}>Prohibited Regions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {REGIONS.map(r => <button key={r} type="button" onClick={() => toggleRegion('prohibited_regions', r)} style={{ padding: '3px 10px', borderRadius: '5px', border: `1px solid ${form.prohibited_regions.includes(r) ? 'var(--status-error-text)' : 'var(--border)'}`, background: form.prohibited_regions.includes(r) ? 'var(--status-error-bg)' : 'transparent', color: form.prohibited_regions.includes(r) ? 'var(--status-error-text)' : 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>{r}</button>)}
              </div>
            </div>
            <div><label style={lbl}>Data Sovereignty Country</label><input style={inp} value={form.data_sovereignty_country} onChange={e => setForm(f => ({ ...f, data_sovereignty_country: e.target.value }))} placeholder="e.g. Germany" /></div>
            <div><label style={lbl}>Notes</label><textarea style={{ ...inp, height: '60px', resize: 'vertical' }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <button onClick={handleAdd} disabled={saving} style={{ ...submitBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Add Policy'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PrivacyPage() {
  const [tab, setTab] = useState<Tab>('masking')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'masking', label: 'Data Masking' },
    { key: 'dsr', label: 'Subject Requests' },
    { key: 'consent', label: 'Consent' },
    { key: 'residency', label: 'Data Residency' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>Workspace · <span style={{ color: 'var(--text-secondary)' }}>Privacy</span></div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: '0 0 4px' }}>Data Protection & Privacy</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 20px' }}>Manage masking policies, data subject requests, consent records, and residency requirements</p>

      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '8px 18px', border: 'none', cursor: 'pointer', fontWeight: tab === t.key ? 600 : 400,
            fontSize: '13px', background: 'transparent',
            color: tab === t.key ? 'var(--brand-primary)' : 'var(--text-secondary)',
            borderBottom: tab === t.key ? '2px solid var(--brand-primary)' : '2px solid transparent',
            marginBottom: '-1px', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'masking' && <MaskingTab />}
      {tab === 'dsr' && <DSRTab />}
      {tab === 'consent' && <ConsentTab />}
      {tab === 'residency' && <ResidencyTab />}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/privacy/
git commit -m "feat(privacy): new /privacy page with masking, DSR, consent, and residency tabs"
```

---

### Task 9: Navigation — add Privacy to sidebar and tab bar

**Files:**
- Modify: `frontend/src/components/ui/SectionTabBar.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Interfaces:**
- Produces: `/privacy` route visible in the Governance section tab bar; active highlight works

- [ ] **Step 1: Add `/privacy` to SectionTabBar `govern` section**

In `frontend/src/components/ui/SectionTabBar.tsx`, find the `govern` section tabs array and add Privacy after Compliance:

```typescript
// Find this line in the govern tabs array:
{ href: '/compliance',    label: 'Compliance' },
// Add after it:
{ href: '/privacy',       label: 'Privacy' },
```

- [ ] **Step 2: Add `/privacy` to Sidebar `SECTION_KEY_MAP`**

In `frontend/src/components/Sidebar.tsx`, find `SECTION_KEY_MAP` and add:

```typescript
// Find this line:
'/compliance': 'govern',
// Add after it:
'/privacy': 'govern',
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Run all backend tests**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard && python -m pytest tests/ -x -q
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/SectionTabBar.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat(nav): add Privacy tab to Governance section"
```
