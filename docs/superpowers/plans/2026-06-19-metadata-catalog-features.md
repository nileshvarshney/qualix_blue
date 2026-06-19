# Metadata & Catalog Feature Set — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the Data Catalog with quality scores, tags, and column descriptions; add a full Glossary term-to-asset linking UI; expose an asset history timeline; and enable bulk editing from the catalog list.

**Architecture:** Four new backend endpoints bolt onto `app/api/assets.py` (enrich, column-meta patch, history, bulk-update). Five frontend files are modified: `AssetColumnsSection` gains description editing, `AssetDetailDrawer` mounts it plus a History section, the catalog page gets quality/tag columns and a bulk-select bar, and the glossary page gets a full linked-assets panel with a link-asset modal backed by extended Next.js proxy routes.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy async, Next.js 15 App Router, React 19 (no test framework on frontend — verify via `npm run build` and manual browser testing).

## Global Constraints

- All backend tests use `fastapi.testclient.TestClient` with `AsyncMock` db; run with `pytest` from repo root.
- Frontend has no test framework — every frontend task ends with `cd frontend && npm run build` passing with zero errors.
- No schema migrations — all models (`DQQualityScore`, `AssetTag`, `Tag`, `AuditLog`, `ColumnMetadata`) already exist.
- All Next.js route files must export `export const dynamic = 'force-dynamic'`.
- Backend: follow existing import style in `app/api/assets.py` (imports at top of file, not inside functions, except for circular-dependency workarounds already in the file).
- Git: commit after each task using `git add <specific files>; git commit`.

---

### Task 1: Backend — Enrich `/asset-registry/enriched` with quality_score and tag_names

**Files:**
- Modify: `app/api/assets.py` (function `list_assets_enriched`, lines ~31-88)
- Test: `tests/test_enriched_endpoint.py` (create new)

**Interfaces:**
- Produces: `GET /asset-registry/enriched` response now includes `quality_score: float | None` and `tag_names: list[str]` per asset.

- [ ] **Step 1: Write failing tests**

Create `tests/test_enriched_endpoint.py`:

```python
# tests/test_enriched_endpoint.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router
from app.core.security import get_current_user
from app.db.database import get_db


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "test@x.com", "role": "admin"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


def _make_asset(asset_id="a1"):
    from app.db.models import Asset, Domain, Subdomain, AssetSourceMeta
    asset = MagicMock(spec=Asset)
    asset.asset_id = asset_id
    asset.connection_id = None
    asset.owner_name = "Alice"
    asset.owner_email = "alice@x.com"
    asset.technical_owner_name = None
    asset.technical_owner_email = None
    asset.criticality = "high"
    asset.certification_status = "certified"
    asset.certified_by = None
    asset.is_active = True
    asset.created_at.isoformat.return_value = "2026-01-01T00:00:00"
    domain = MagicMock(spec=Domain)
    domain.domain_id = "d1"
    domain.domain_name = "Finance"
    subdomain = MagicMock(spec=Subdomain)
    subdomain.subdomain_id = "s1"
    subdomain.subdomain_name = "Reporting"
    meta = MagicMock(spec=AssetSourceMeta)
    meta.sf_database_name = "DB"
    meta.sf_schema_name = "SCH"
    meta.sf_table_name = "ORDERS"
    meta.sf_table_type = "table"
    return asset, domain, subdomain, meta


@pytest.mark.asyncio
async def test_enriched_includes_quality_score_and_tags():
    db = AsyncMock()
    asset, domain, subdomain, meta = _make_asset("a1")

    # First call: main join query
    main_result = MagicMock()
    main_result.all.return_value = [(asset, domain, subdomain, meta)]

    # Second call: quality score subquery
    score_subq_result = MagicMock()
    score_subq_result.all.return_value = []

    # Third call: score join
    score_join_result = MagicMock()
    score_join_result.all.return_value = [MagicMock(asset_id="a1", quality_score=87.5)]

    # Fourth call: tag query
    tag_result = MagicMock()
    tag_result.all.return_value = [
        MagicMock(entity_id="a1", tag_name="PII"),
        MagicMock(entity_id="a1", tag_name="Finance"),
    ]

    db.execute.side_effect = [main_result, score_subq_result, score_join_result, tag_result]

    client = _make_client(db)
    resp = client.get("/asset-registry/enriched")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["quality_score"] == 87.5
    assert data[0]["tag_names"] == ["PII", "Finance"]


@pytest.mark.asyncio
async def test_enriched_quality_score_null_when_no_scores():
    db = AsyncMock()
    asset, domain, subdomain, meta = _make_asset("a2")

    main_result = MagicMock()
    main_result.all.return_value = [(asset, domain, subdomain, meta)]
    score_subq_result = MagicMock()
    score_subq_result.all.return_value = []
    score_join_result = MagicMock()
    score_join_result.all.return_value = []
    tag_result = MagicMock()
    tag_result.all.return_value = []

    db.execute.side_effect = [main_result, score_subq_result, score_join_result, tag_result]

    client = _make_client(db)
    resp = client.get("/asset-registry/enriched")
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["quality_score"] is None
    assert data[0]["tag_names"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
pytest tests/test_enriched_endpoint.py -v
```

Expected: FAIL — `quality_score` and `tag_names` keys not present in response.

- [ ] **Step 3: Modify `list_assets_enriched` in `app/api/assets.py`**

Add `DQQualityScore, AssetTag, Tag` to the imports block at the top of `app/api/assets.py` (they are already in `app/db/models.py`). Find the existing models import line and extend it:

```python
# Find this line (around line 9):
from app.db.models import (
    Asset, Domain, Subdomain, AuditLog, SnowflakeConnection, AssetSourceMeta,
)
# Replace with:
from app.db.models import (
    Asset, Domain, Subdomain, AuditLog, SnowflakeConnection, AssetSourceMeta,
    DQQualityScore, AssetTag, Tag, ColumnMetadata,
)
```

Then replace the body of `list_assets_enriched` (the `return [...]` block at lines ~63-88) with this full implementation:

```python
@router.get("/enriched")
async def list_assets_enriched(
    domain_id: Optional[str] = Query(None),
    subdomain_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Returns assets joined with domain, subdomain, and connection names."""
    effective_domain = get_domain_filter(user) or domain_id
    q = (
        select(Asset, Domain, Subdomain, AssetSourceMeta)
        .join(Domain, Asset.domain_id == Domain.domain_id)
        .join(Subdomain, Asset.subdomain_id == Subdomain.subdomain_id)
        .outerjoin(AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id)
        .order_by(Asset.display_name, Asset.physical_name)
    )
    if effective_domain:
        q = q.where(Asset.domain_id == effective_domain)
    if subdomain_id:
        q = q.where(Asset.subdomain_id == subdomain_id)
    rows = (await db.execute(q)).all()

    # Bulk-fetch connection names
    conn_ids = {asset.connection_id for asset, _, _, _ in rows if asset.connection_id}
    conn_map: dict[str, str] = {}
    if conn_ids:
        conn_result = await db.execute(
            select(SnowflakeConnection).where(SnowflakeConnection.connection_id.in_(conn_ids))
        )
        for c in conn_result.scalars().all():
            conn_map[c.connection_id] = c.connection_name

    asset_ids = [asset.asset_id for asset, _, _, _ in rows]

    # Bulk-fetch latest quality score per asset
    score_map: dict[str, float] = {}
    if asset_ids:
        subq = (
            select(
                DQQualityScore.asset_id,
                func.max(DQQualityScore.score_date).label("latest_date"),
            )
            .where(DQQualityScore.asset_id.in_(asset_ids))
            .group_by(DQQualityScore.asset_id)
            .subquery()
        )
        score_res = await db.execute(
            select(DQQualityScore.asset_id, DQQualityScore.quality_score)
            .join(
                subq,
                (DQQualityScore.asset_id == subq.c.asset_id)
                & (DQQualityScore.score_date == subq.c.latest_date),
            )
        )
        score_map = {r.asset_id: r.quality_score for r in score_res.all()}

    # Bulk-fetch tag names per asset
    tag_map: dict[str, list[str]] = {}
    if asset_ids:
        tag_res = await db.execute(
            select(AssetTag.entity_id, Tag.tag_name)
            .join(Tag, AssetTag.tag_id == Tag.tag_id)
            .where(AssetTag.entity_type == "asset", AssetTag.entity_id.in_(asset_ids))
        )
        for r in tag_res.all():
            tag_map.setdefault(r.entity_id, []).append(r.tag_name)

    return [
        {
            "asset_id": asset.asset_id,
            "connection_id": asset.connection_id,
            "connection_name": conn_map.get(asset.connection_id) if asset.connection_id else None,
            "sf_database_name": meta.sf_database_name if meta else None,
            "sf_schema_name": meta.sf_schema_name if meta else None,
            "sf_table_name": meta.sf_table_name if meta else asset.physical_name,
            "table_description": asset.description,
            "table_type": meta.sf_table_type if meta else None,
            "criticality": asset.criticality,
            "owner_name": asset.owner_name,
            "owner_email": asset.owner_email,
            "technical_owner_name": asset.technical_owner_name,
            "technical_owner_email": asset.technical_owner_email,
            "certification_status": asset.certification_status,
            "certified_by": asset.certified_by,
            "is_active": asset.is_active,
            "domain_id": domain.domain_id,
            "domain_name": domain.domain_name,
            "subdomain_id": subdomain.subdomain_id,
            "subdomain_name": subdomain.subdomain_name,
            "created_at": asset.created_at.isoformat(),
            "quality_score": score_map.get(asset.asset_id),
            "tag_names": tag_map.get(asset.asset_id, []),
        }
        for asset, domain, subdomain, meta in rows
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_enriched_endpoint.py -v
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/assets.py tests/test_enriched_endpoint.py
git commit -m "feat(backend): add quality_score and tag_names to enriched assets endpoint"
```

---

### Task 2: Backend — `PATCH /{asset_id}/column-meta/{column_name}`

**Files:**
- Modify: `app/api/assets.py` (add new route at end of router)
- Test: `tests/test_column_meta_patch.py` (create new)

**Interfaces:**
- Consumes: `ColumnMetadata` model (already imported in Task 1)
- Produces: `PATCH /asset-registry/{asset_id}/column-meta/{column_name}` accepts `{ "description": "..." }`, returns `{ col_id, column_name, description }`

- [ ] **Step 1: Write failing tests**

Create `tests/test_column_meta_patch.py`:

```python
# tests/test_column_meta_patch.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router
from app.core.security import get_current_user
from app.db.database import get_db


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "editor@x.com", "role": "admin"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


@pytest.mark.asyncio
async def test_patch_column_meta_404_when_column_not_found():
    db = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    db.execute.return_value = result

    client = _make_client(db)
    resp = client.patch(
        "/asset-registry/no-asset/column-meta/col1",
        json={"description": "test"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_column_meta_updates_description():
    from app.db.models import ColumnMetadata
    db = AsyncMock()

    col = MagicMock(spec=ColumnMetadata)
    col.col_id = "c1"
    col.column_name = "order_id"
    col.description = None
    col.updated_by = None
    col.updated_at = None

    result = MagicMock()
    result.scalar_one_or_none.return_value = col
    db.execute.return_value = result

    async def _fake_refresh(obj):
        obj.description = "Unique order identifier"

    db.refresh = _fake_refresh

    client = _make_client(db)
    resp = client.patch(
        "/asset-registry/a1/column-meta/order_id",
        json={"description": "Unique order identifier"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["col_id"] == "c1"
    assert data["column_name"] == "order_id"
    assert data["description"] == "Unique order identifier"
    assert col.description == "Unique order identifier"
    assert col.updated_by == "editor@x.com"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_column_meta_patch.py -v
```

Expected: FAIL — route does not exist yet (404 on the route, not asset).

- [ ] **Step 3: Add the endpoint to `app/api/assets.py`**

Append after the last `@router.*` definition in `app/api/assets.py`:

```python
@router.patch("/{asset_id}/column-meta/{column_name}")
async def patch_column_meta(
    asset_id: str,
    column_name: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update a single column's metadata (currently: description)."""
    result = await db.execute(
        select(ColumnMetadata).where(
            ColumnMetadata.asset_id == asset_id,
            ColumnMetadata.column_name == column_name,
        )
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(404, "Column metadata not found")
    if "description" in payload:
        col.description = payload["description"]
    col.updated_by = user.get("email")
    col.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()
    await db.refresh(col)
    return {"col_id": col.col_id, "column_name": col.column_name, "description": col.description}
```

Note: `datetime`, `timezone`, `select`, `ColumnMetadata`, `Depends`, `HTTPException`, `AsyncSession`, `get_db`, `get_current_user` are all already imported in the file.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_column_meta_patch.py -v
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/assets.py tests/test_column_meta_patch.py
git commit -m "feat(backend): add PATCH /asset-registry/{id}/column-meta/{col} endpoint"
```

---

### Task 3: Backend — `GET /{asset_id}/history`

**Files:**
- Modify: `app/api/assets.py` (add new route)
- Test: `tests/test_asset_history_endpoint.py` (create new)

**Interfaces:**
- Produces: `GET /asset-registry/{asset_id}/history` returns `list[{ audit_id, action, user_email, created_at, changed_fields, old_value, new_value }]`, max 50 entries, newest first.

- [ ] **Step 1: Write failing tests**

Create `tests/test_asset_history_endpoint.py`:

```python
# tests/test_asset_history_endpoint.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router
from app.core.security import get_current_user
from app.db.database import get_db


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "viewer@x.com", "role": "viewer"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


@pytest.mark.asyncio
async def test_history_404_for_unknown_asset():
    db = AsyncMock()
    not_found = MagicMock()
    not_found.scalar_one_or_none.return_value = None
    db.execute.return_value = not_found

    client = _make_client(db)
    resp = client.get("/asset-registry/no-such/history")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_history_returns_audit_entries():
    from app.db.models import Asset, AuditLog
    db = AsyncMock()

    asset = MagicMock(spec=Asset)
    asset_result = MagicMock()
    asset_result.scalar_one_or_none.return_value = asset

    log = MagicMock(spec=AuditLog)
    log.audit_id = "log-1"
    log.action = "UPDATE"
    log.user_email = "alice@x.com"
    log.created_at = datetime(2026, 6, 1, 10, 0, 0)
    log.old_value = {"criticality": "low"}
    log.new_value = {"criticality": "high"}

    logs_result = MagicMock()
    logs_result.scalars.return_value.all.return_value = [log]

    db.execute.side_effect = [asset_result, logs_result]

    client = _make_client(db)
    resp = client.get("/asset-registry/a1/history")
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 1
    assert entries[0]["audit_id"] == "log-1"
    assert entries[0]["action"] == "UPDATE"
    assert entries[0]["user_email"] == "alice@x.com"
    assert "criticality" in entries[0]["changed_fields"]
    assert entries[0]["old_value"] == {"criticality": "low"}
    assert entries[0]["new_value"] == {"criticality": "high"}


@pytest.mark.asyncio
async def test_history_empty_when_no_logs():
    from app.db.models import Asset, AuditLog
    db = AsyncMock()

    asset = MagicMock(spec=Asset)
    asset_result = MagicMock()
    asset_result.scalar_one_or_none.return_value = asset

    logs_result = MagicMock()
    logs_result.scalars.return_value.all.return_value = []
    db.execute.side_effect = [asset_result, logs_result]

    client = _make_client(db)
    resp = client.get("/asset-registry/a1/history")
    assert resp.status_code == 200
    assert resp.json() == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_asset_history_endpoint.py -v
```

Expected: FAIL — route not found.

- [ ] **Step 3: Add the endpoint to `app/api/assets.py`**

Append after the `patch_column_meta` endpoint added in Task 2:

```python
@router.get("/{asset_id}/history")
async def get_asset_history(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return the last 50 audit log entries for an asset, newest first."""
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Asset not found")

    logs_res = await db.execute(
        select(AuditLog)
        .where(AuditLog.entity_type == "asset", AuditLog.entity_id == asset_id)
        .order_by(AuditLog.created_at.desc())
        .limit(50)
    )
    logs = logs_res.scalars().all()

    entries = []
    for log in logs:
        old = log.old_value or {}
        new = log.new_value or {}
        changed_fields = list(set(list(old.keys()) + list(new.keys())))
        entries.append({
            "audit_id": log.audit_id,
            "action": log.action,
            "user_email": log.user_email,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "changed_fields": changed_fields,
            "old_value": old,
            "new_value": new,
        })
    return entries
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_asset_history_endpoint.py -v
```

Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/assets.py tests/test_asset_history_endpoint.py
git commit -m "feat(backend): add GET /asset-registry/{id}/history endpoint"
```

---

### Task 4: Backend — `POST /bulk-update`

**Files:**
- Modify: `app/api/assets.py` (add new route — must be placed BEFORE any `/{asset_id}` catch-all route to avoid path collision)
- Test: `tests/test_bulk_update_endpoint.py` (create new)

**Interfaces:**
- Produces: `POST /asset-registry/bulk-update` accepts `{ asset_ids: string[], patch: { criticality?, certification_status?, is_active?, domain_id?, subdomain_id?, owner_name? } }`, returns `{ updated: number }`.

- [ ] **Step 1: Write failing tests**

Create `tests/test_bulk_update_endpoint.py`:

```python
# tests/test_bulk_update_endpoint.py
import pytest
from unittest.mock import AsyncMock, MagicMock, call
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.assets import router
from app.core.security import get_current_user
from app.db.database import get_db


def _make_client(db_mock):
    app = FastAPI()
    app.include_router(router)

    async def _fake_user():
        return {"email": "admin@x.com", "role": "admin"}

    async def _fake_db():
        yield db_mock

    app.dependency_overrides[get_current_user] = _fake_user
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


def _mock_assets(ids):
    from app.db.models import Asset
    assets = []
    for aid in ids:
        a = MagicMock(spec=Asset)
        a.asset_id = aid
        a.criticality = "low"
        a.certification_status = "uncertified"
        a.is_active = True
        a.domain_id = None
        a.subdomain_id = None
        a.owner_name = None
        a.updated_at = None
        assets.append(a)
    return assets


@pytest.mark.asyncio
async def test_bulk_update_422_with_no_asset_ids():
    db = AsyncMock()
    client = _make_client(db)
    resp = client.post("/asset-registry/bulk-update", json={"asset_ids": [], "patch": {"criticality": "high"}})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_update_422_with_invalid_patch_field():
    db = AsyncMock()
    client = _make_client(db)
    resp = client.post(
        "/asset-registry/bulk-update",
        json={"asset_ids": ["a1"], "patch": {"hacked_field": "evil"}},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_update_404_when_asset_not_found():
    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute.return_value = result

    client = _make_client(db)
    resp = client.post(
        "/asset-registry/bulk-update",
        json={"asset_ids": ["missing-1"], "patch": {"criticality": "high"}},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_bulk_update_applies_patch_to_all_assets():
    db = AsyncMock()
    assets = _mock_assets(["a1", "a2"])
    result = MagicMock()
    result.scalars.return_value.all.return_value = assets
    db.execute.return_value = result

    client = _make_client(db)
    resp = client.post(
        "/asset-registry/bulk-update",
        json={"asset_ids": ["a1", "a2"], "patch": {"criticality": "critical"}},
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 2
    for asset in assets:
        assert asset.criticality == "critical"
    assert db.commit.called
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_bulk_update_endpoint.py -v
```

Expected: FAIL — route not found.

- [ ] **Step 3: Add the endpoint to `app/api/assets.py`**

This route MUST be added before any route that could match `/bulk-update` as an asset_id (i.e., before `@router.get("/{asset_id}")` etc.). In practice, FastAPI matches fixed paths before parameterized ones, so appending at the end is safe — but place it before `/{asset_id}/history` for clarity. Append after the `get_asset_history` endpoint:

```python
_BULK_ALLOWED_FIELDS = frozenset({
    "criticality", "certification_status", "is_active",
    "domain_id", "subdomain_id", "owner_name",
})


@router.post("/bulk-update")
async def bulk_update_assets(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Apply a partial patch to multiple assets at once."""
    asset_ids: list[str] = payload.get("asset_ids") or []
    patch: dict = payload.get("patch") or {}

    if not asset_ids:
        raise HTTPException(422, "asset_ids must be a non-empty list")
    if not patch:
        raise HTTPException(422, "patch must be a non-empty object")

    invalid = set(patch.keys()) - _BULK_ALLOWED_FIELDS
    if invalid:
        raise HTTPException(422, f"Invalid patch fields: {sorted(invalid)}")

    result = await db.execute(select(Asset).where(Asset.asset_id.in_(asset_ids)))
    assets = result.scalars().all()
    found_ids = {a.asset_id for a in assets}
    missing = set(asset_ids) - found_ids
    if missing:
        raise HTTPException(404, f"Assets not found: {sorted(missing)[:5]}")

    _now = datetime.now(timezone.utc).replace(tzinfo=None)
    for asset in assets:
        old_vals = {k: getattr(asset, k, None) for k in patch}
        for field, value in patch.items():
            setattr(asset, field, value)
        asset.updated_at = _now
        db.add(AuditLog(
            audit_id=str(uuid.uuid4()),
            user_email=user.get("email"),
            action="BULK_UPDATE",
            entity_type="asset",
            entity_id=asset.asset_id,
            old_value=old_vals,
            new_value=patch,
        ))
    await db.commit()
    return {"updated": len(assets)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_bulk_update_endpoint.py -v
```

Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/assets.py tests/test_bulk_update_endpoint.py
git commit -m "feat(backend): add POST /asset-registry/bulk-update endpoint"
```

---

### Task 5: Frontend — `AssetColumnsSection.tsx` — Description column + inline edit + save

**Files:**
- Modify: `frontend/src/components/asset-registry/AssetColumnsSection.tsx`

**Interfaces:**
- Consumes: `PATCH /api/asset-registry/{assetId}/column-meta/{columnName}` (Task 2 backend, forwarded by existing wildcard proxy `frontend/src/app/api/asset-registry/[...path]/route.ts`)
- Produces: `AssetColumnsSection` now accepts `editing?: boolean` prop; when true, description cells are editable inputs; a "Save Descriptions" button appears in the header if any descriptions were changed; clicking it calls the PATCH endpoint per changed column.

- [ ] **Step 1: Update the `Column` interface and `Props` in `AssetColumnsSection.tsx`**

Open `frontend/src/components/asset-registry/AssetColumnsSection.tsx`.

Replace the `Column` interface and `Props` interface with:

```typescript
interface Column {
  column_name: string
  data_type?: string
  ordinal_position?: number
  is_nullable?: boolean
  is_primary_key?: boolean
  classification?: string
  description?: string
}

interface Props {
  assetId: string
  connectionId?: string
  sourceMeta?: { sf_database_name?: string; sf_schema_name?: string; sf_table_name?: string }
  editing?: boolean
}
```

- [ ] **Step 2: Add description edit state and save logic**

After the existing `const [sampleError, setSampleError] = useState<string | null>(null)` line, add:

```typescript
const [descDrafts, setDescDrafts] = useState<Record<string, string>>({})
const [savingDesc, setSavingDesc] = useState(false)
const [descSaveError, setDescSaveError] = useState<string | null>(null)

const hasPendingDescriptions = Object.keys(descDrafts).length > 0

async function saveDescriptions() {
  if (!hasPendingDescriptions) return
  setSavingDesc(true)
  setDescSaveError(null)
  try {
    for (const [colName, desc] of Object.entries(descDrafts)) {
      const res = await fetch(`/api/asset-registry/${assetId}/column-meta/${encodeURIComponent(colName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc }),
      })
      if (!res.ok) throw new Error(`Failed to save description for ${colName}`)
    }
    // Commit drafts into columns state
    setColumns(prev => (prev ?? []).map(c =>
      descDrafts[c.column_name] !== undefined
        ? { ...c, description: descDrafts[c.column_name] }
        : c
    ))
    setDescDrafts({})
  } catch (e: unknown) {
    setDescSaveError((e as Error).message)
  } finally {
    setSavingDesc(false)
  }
}
```

- [ ] **Step 3: Update the column table header and rows**

Replace the existing `<thead>` block (inside the `!loadingCols && columns && columns.length > 0` branch):

```typescript
// Replace the headers array:
{['#', 'Name', 'Type', 'Nullable', 'Class', 'Description'].map(h => (
  <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
    {h}
  </th>
))}
```

Add a `<td>` for description inside each `<tr>` in the `<tbody>`, after the existing `classification` cell:

```typescript
<td style={{ padding: '4px 8px', minWidth: '120px', maxWidth: '220px' }}>
  {editing ? (
    <input
      value={descDrafts[col.column_name] ?? col.description ?? ''}
      onChange={e => setDescDrafts(prev => ({ ...prev, [col.column_name]: e.target.value }))}
      placeholder="Add description…"
      style={{
        width: '100%', fontSize: '10px', padding: '2px 4px',
        border: '1px solid var(--border)', borderRadius: '3px',
        background: 'var(--background)', color: 'var(--foreground)', outline: 'none',
        boxSizing: 'border-box' as const,
      }}
    />
  ) : (
    <span style={{ fontSize: '10px', color: col.description ? 'var(--foreground)' : 'var(--text-muted)' }}>
      {col.description || '—'}
    </span>
  )}
</td>
```

- [ ] **Step 4: Add "Save Descriptions" button and error to the column section header**

Replace the existing `<div style={headerStyle} onClick={handleToggleColumns}>` content block with:

```typescript
<div style={headerStyle} onClick={handleToggleColumns}>
  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>
    {open ? '▼' : '▶'} Columns{columns !== null ? ` (${colCount})` : ''}
  </span>
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
    {editing && hasPendingDescriptions && (
      <button
        onClick={saveDescriptions}
        disabled={savingDesc}
        style={{
          fontSize: '11px', padding: '3px 10px', borderRadius: '4px',
          border: 'none', background: 'var(--accent)', color: '#fff',
          cursor: savingDesc ? 'not-allowed' : 'pointer', fontWeight: 600,
          opacity: savingDesc ? 0.6 : 1,
        }}
      >
        {savingDesc ? 'Saving…' : 'Save Descriptions'}
      </button>
    )}
    <button
      onClick={handleViewSamples}
      disabled={!canSample}
      style={{
        fontSize: '11px', padding: '3px 10px', borderRadius: '4px',
        border: '1px solid var(--border)',
        background: canSample ? 'var(--accent-bg)' : 'var(--surface)',
        color: canSample ? 'var(--accent)' : 'var(--text-muted)',
        cursor: canSample ? 'pointer' : 'not-allowed', fontWeight: 600,
      }}
    >
      View 10 Samples
    </button>
  </div>
</div>
{descSaveError && (
  <div style={{ padding: '4px 10px', fontSize: '10px', color: 'var(--status-error-text)', background: 'var(--status-error-bg)' }}>
    {descSaveError}
  </div>
)}
```

- [ ] **Step 5: Verify build passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/asset-registry/AssetColumnsSection.tsx
git commit -m "feat(frontend): add column description display and inline editing to AssetColumnsSection"
```

---

### Task 6: Frontend — `AssetDetailDrawer.tsx` — Mount `AssetColumnsSection` + History section

**Files:**
- Modify: `frontend/src/components/asset-registry/AssetDetailDrawer.tsx`

**Interfaces:**
- Consumes: `AssetColumnsSection` (Task 5), `GET /api/asset-registry/{assetId}/history` (Task 3 backend, forwarded by wildcard proxy)
- Produces: Drawer now shows columns section and collapsible history timeline.

- [ ] **Step 1: Add `AssetColumnsSection` import and history state to the drawer**

At the top of `AssetDetailDrawer.tsx`, after the existing `import AssetDocumentsSection` line, add:

```typescript
import AssetColumnsSection from './AssetColumnsSection'
```

Inside the `AssetDetailDrawer` component function body, after the existing `useState` declarations, add:

```typescript
const [historyOpen, setHistoryOpen] = useState(false)
const [history, setHistory] = useState<HistoryEntry[] | null>(null)
const [historyLoading, setHistoryLoading] = useState(false)
const [historyError, setHistoryError] = useState<string | null>(null)
```

Add the `HistoryEntry` type at the top of the file, after the existing `type EditForm` declaration:

```typescript
type HistoryEntry = {
  audit_id: string
  action: string
  user_email: string | null
  created_at: string | null
  changed_fields: string[]
  old_value: Record<string, unknown>
  new_value: Record<string, unknown>
}
```

- [ ] **Step 2: Add history fetch function**

Inside the component, after the `cancel()` function, add:

```typescript
async function toggleHistory() {
  const next = !historyOpen
  setHistoryOpen(next)
  if (next && history === null && !historyLoading) {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/asset-registry/${asset.asset_id}/history`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setHistory(await res.json())
    } catch (e: unknown) {
      setHistoryError((e as Error).message)
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
```

- [ ] **Step 3: Mount `AssetColumnsSection` and History section in the drawer JSX**

Find the existing `<AssetDocumentsSection assetId={asset.asset_id} editing={editing} />` line in the return JSX. Replace it and the spacer `<div style={{ height: '12px' }} />` with:

```typescript
<AssetColumnsSection
  assetId={asset.asset_id}
  editing={editing}
  sourceMeta={{
    sf_database_name: asset.sf_database_name,
    sf_schema_name: asset.sf_schema_name,
    sf_table_name: asset.sf_table_name,
  }}
/>

<AssetDocumentsSection assetId={asset.asset_id} editing={editing} />

{/* History section */}
<div style={{ margin: '6px 14px 0', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
  <div
    onClick={toggleHistory}
    style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: 'var(--surface)', userSelect: 'none' }}
    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
    onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
  >
    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{historyOpen ? '▼' : '▶'}</span>
    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>History</span>
    {history !== null && (
      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{history.length} entries</span>
    )}
  </div>

  {historyOpen && (
    <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {historyLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loading…</div>}
      {historyError && <div style={{ fontSize: '11px', color: 'var(--status-error-text)' }}>{historyError}</div>}
      {!historyLoading && history !== null && history.length === 0 && (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No history yet</div>
      )}
      {!historyLoading && (history ?? []).map(entry => (
        <div key={entry.audit_id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <span style={{
              fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase',
              background: entry.action === 'CREATE' ? 'var(--status-ok-bg)' : entry.action === 'BULK_UPDATE' ? 'var(--status-info-bg)' : 'var(--surface-muted)',
              color: entry.action === 'CREATE' ? 'var(--status-ok-text)' : entry.action === 'BULK_UPDATE' ? 'var(--status-info-text)' : 'var(--text-secondary)',
            }}>
              {entry.action}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', flex: 1 }}>
              {entry.user_email ?? 'system'}
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{relativeTime(entry.created_at)}</span>
          </div>
          {entry.changed_fields.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {entry.changed_fields.map(field => (
                <div key={field} style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  <span style={{ color: 'var(--foreground)' }}>{field}</span>
                  {entry.old_value[field] !== undefined && (
                    <span> <span style={{ color: 'var(--status-error-text)' }}>{String(entry.old_value[field])}</span> → <span style={{ color: 'var(--status-ok-text)' }}>{String(entry.new_value[field] ?? '—')}</span></span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )}
</div>

<div style={{ height: '12px' }} />
```

- [ ] **Step 4: Verify build passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/asset-registry/AssetDetailDrawer.tsx
git commit -m "feat(frontend): add columns section and history timeline to AssetDetailDrawer"
```

---

### Task 7: Frontend — Catalog page — quality/tag columns + checkbox + bulk action bar

**Files:**
- Modify: `frontend/src/app/catalog/page.tsx`

**Interfaces:**
- Consumes: `quality_score` and `tag_names` from `/api/catalog` (Task 1 backend), `POST /api/asset-registry/bulk-update` (Task 4 backend)
- Produces: Catalog list rows show a Quality pill and tag chips; checkboxes enable multi-select; a floating bottom bar applies bulk patches.

- [ ] **Step 1: Extend the `Asset` type with new fields**

In `catalog/page.tsx`, find the import line:
```typescript
import AssetDetailDrawer, { Asset } from '@/components/asset-registry/AssetDetailDrawer'
```

The `Asset` type is defined in `AssetDetailDrawer.tsx`. Add `quality_score` and `tag_names` to it by extending it locally at the top of `catalog/page.tsx`. Replace the existing import line with:

```typescript
import AssetDetailDrawer, { Asset as BaseAsset } from '@/components/asset-registry/AssetDetailDrawer'

type Asset = BaseAsset & {
  quality_score?: number | null
  tag_names?: string[]
}
```

- [ ] **Step 2: Add quality/tag helpers and checkbox state**

Replace the existing color helper functions block at the top of `catalog/page.tsx` with:

```typescript
const critColor = (c?: string) =>
  c === 'high' ? 'var(--status-error-text)' : c === 'medium' ? 'var(--status-warn-text)' : 'var(--text-muted)'
const critBg = (c?: string) =>
  c === 'high' ? 'var(--status-error-bg)' : c === 'medium' ? 'var(--status-warn-bg)' : 'var(--surface-muted)'
const certColor = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-text)' : s === 'deprecated' ? 'var(--status-error-text)' : 'var(--text-muted)'
const certBg = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-bg)' : s === 'deprecated' ? 'var(--status-error-bg)' : 'var(--surface-muted)'
const qualColor = (q?: number | null) =>
  q == null ? 'var(--text-muted)' : q >= 80 ? 'var(--status-ok-text)' : q >= 60 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const qualBg = (q?: number | null) =>
  q == null ? 'var(--surface-muted)' : q >= 80 ? 'var(--status-ok-bg)' : q >= 60 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'
```

- [ ] **Step 3: Update `CatalogPage` state and bulk-update logic**

Inside the `CatalogPage` function body, after the existing `const [connTypeMap, ...]` state line, add:

```typescript
const [selected, setSelected] = useState<Set<string>>(new Set())
const [bulkPatch, setBulkPatch] = useState<{ criticality?: string; certification_status?: string; owner_name?: string }>({})
const [bulkApplying, setBulkApplying] = useState(false)
const [bulkError, setBulkError] = useState<string | null>(null)

function toggleSelect(e: React.MouseEvent, assetId: string) {
  e.stopPropagation()
  setSelected(prev => {
    const next = new Set(prev)
    if (next.has(assetId)) next.delete(assetId)
    else next.add(assetId)
    return next
  })
}

function toggleSelectAll() {
  const visibleIds = filtered.map(a => a.asset_id)
  setSelected(prev => {
    if (visibleIds.every(id => prev.has(id))) return new Set()
    return new Set(visibleIds)
  })
}

async function applyBulk() {
  const patch: Record<string, string> = {}
  if (bulkPatch.criticality) patch.criticality = bulkPatch.criticality
  if (bulkPatch.certification_status) patch.certification_status = bulkPatch.certification_status
  if (bulkPatch.owner_name) patch.owner_name = bulkPatch.owner_name
  if (!Object.keys(patch).length) return
  setBulkApplying(true)
  setBulkError(null)
  try {
    const res = await fetch('/api/asset-registry/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_ids: Array.from(selected), patch }),
    })
    if (!res.ok) throw new Error(`Server error ${res.status}`)
    setAssets(prev => prev.map(a =>
      selected.has(a.asset_id) ? { ...a, ...patch } : a
    ))
    setSelected(new Set())
    setBulkPatch({})
  } catch (e: unknown) {
    setBulkError((e as Error).message)
  } finally {
    setBulkApplying(false)
  }
}
```

- [ ] **Step 4: Update `TableRow` to include checkbox, quality score, and tags**

Replace the entire `TableRow` component with:

```typescript
function TableRow({ asset, selected, onToggleSelect, onClick }: {
  asset: Asset
  selected: boolean
  onToggleSelect: (e: React.MouseEvent) => void
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const isActive = asset.is_active !== false
  const tags = asset.tag_names ?? []
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 220px 1fr 110px 80px 70px 55px 60px',
        gap: '0 8px',
        alignItems: 'center',
        padding: '4px 8px 4px 8px',
        borderLeft: `2px solid ${selected ? 'var(--accent)' : isActive ? 'var(--status-ok-text)' : 'var(--border)'}`,
        borderBottom: '1px solid var(--surface-muted)',
        background: selected ? 'var(--accent-bg)' : hover ? 'var(--surface-muted)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={onToggleSelect}
        onChange={() => {}}
        style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '14px', height: '14px', flexShrink: 0 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {asset.table_type?.toLowerCase() === 'view'
            ? <Eye size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
            : <Table2 size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
          {asset.sf_table_name ?? '—'}
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: '3px', marginTop: '2px', flexWrap: 'nowrap', overflow: 'hidden' }}>
            {tags.slice(0, 2).map(tag => (
              <span key={tag} style={{ fontSize: '8px', fontWeight: 600, padding: '0 4px', borderRadius: '3px', background: 'var(--accent-bg)', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{tag}</span>
            ))}
            {tags.length > 2 && (
              <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>+{tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {[asset.domain_name, asset.subdomain_name].filter(Boolean).join(' › ') || '—'}
      </span>
      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.owner_name ?? '—'}
      </span>
      <Badge label={asset.certification_status ?? 'uncertified'} bg={certBg(asset.certification_status)} color={certColor(asset.certification_status)} />
      <Badge label={asset.criticality ?? 'low'} bg={critBg(asset.criticality)} color={critColor(asset.criticality)} />
      <span style={{ background: qualBg(asset.quality_score), color: qualColor(asset.quality_score), padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block', textAlign: 'center' }}>
        {asset.quality_score != null ? `${Math.round(asset.quality_score)}%` : '—'}
      </span>
      <Badge label={isActive ? 'Active' : 'Inactive'} bg={isActive ? 'var(--status-ok-bg)' : 'var(--surface-muted)'} color={isActive ? 'var(--status-ok-text)' : 'var(--text-muted)'} />
    </div>
  )
}
```

- [ ] **Step 5: Update the column headers, all-select checkbox, and `TableRow` call sites**

Replace the column headers `<div>` with:

```typescript
<div style={{ display: 'grid', gridTemplateColumns: '28px 220px 1fr 110px 80px 70px 55px 60px', gap: '0 8px', padding: '0 8px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
  <input
    type="checkbox"
    onChange={toggleSelectAll}
    checked={filtered.length > 0 && filtered.every(a => selected.has(a.asset_id))}
    style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '14px', height: '14px' }}
  />
  {['Table', 'Domain › Subdomain', 'Owner', 'Certification', 'Criticality', 'Quality', 'Status'].map(h => (
    <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
  ))}
</div>
```

Update the `TableRow` call site (inside the `{schemaOpen && tables.map(...)}` block):

```typescript
{schemaOpen && tables.map(a => (
  <TableRow
    key={a.asset_id}
    asset={a}
    selected={selected.has(a.asset_id)}
    onToggleSelect={e => toggleSelect(e, a.asset_id)}
    onClick={() => setPopup(a)}
  />
))}
```

- [ ] **Step 6: Add the bulk action bar**

Just before the closing `</div>` of the page (before `{popup && ...}`), add the bulk action bar:

```typescript
{selected.size > 0 && (
  <div style={{
    position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.18)', padding: '10px 16px',
    display: 'flex', alignItems: 'center', gap: '10px', zIndex: 100,
    minWidth: '560px', flexWrap: 'wrap',
  }}>
    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
      {selected.size} selected
    </span>
    <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
    <select
      value={bulkPatch.criticality ?? ''}
      onChange={e => setBulkPatch(p => ({ ...p, criticality: e.target.value || undefined }))}
      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
    >
      <option value="">Criticality…</option>
      <option value="critical">Critical</option>
      <option value="high">High</option>
      <option value="medium">Medium</option>
      <option value="low">Low</option>
    </select>
    <select
      value={bulkPatch.certification_status ?? ''}
      onChange={e => setBulkPatch(p => ({ ...p, certification_status: e.target.value || undefined }))}
      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
    >
      <option value="">Certification…</option>
      <option value="certified">Certified</option>
      <option value="warning">Warning</option>
      <option value="failed">Failed</option>
      <option value="uncertified">Uncertified</option>
    </select>
    <input
      value={bulkPatch.owner_name ?? ''}
      onChange={e => setBulkPatch(p => ({ ...p, owner_name: e.target.value || undefined }))}
      placeholder="Set owner…"
      style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', width: '120px' }}
    />
    {bulkError && <span style={{ fontSize: '10px', color: 'var(--status-error-text)' }}>{bulkError}</span>}
    <button
      onClick={applyBulk}
      disabled={bulkApplying || !Object.values(bulkPatch).some(Boolean)}
      style={{
        fontSize: '11px', padding: '5px 14px', borderRadius: '6px', border: 'none',
        background: 'var(--accent)', color: '#fff', fontWeight: 700,
        cursor: (bulkApplying || !Object.values(bulkPatch).some(Boolean)) ? 'not-allowed' : 'pointer',
        opacity: (bulkApplying || !Object.values(bulkPatch).some(Boolean)) ? 0.6 : 1,
      }}
    >
      {bulkApplying ? 'Applying…' : 'Apply'}
    </button>
    <button
      onClick={() => { setSelected(new Set()); setBulkPatch({}); setBulkError(null) }}
      style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}
    >
      Clear
    </button>
  </div>
)}
```

- [ ] **Step 7: Verify build passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/catalog/page.tsx
git commit -m "feat(frontend): add quality scores, tags, multi-select, and bulk action bar to catalog page"
```

---

### Task 8: Frontend — Extend `[termId]/route.ts` for GET, link-asset POST, and unlink DELETE

**Files:**
- Modify: `frontend/src/app/api/glossary/[termId]/route.ts`

**Interfaces:**
- Produces:
  - `GET /api/glossary/{termId}` → proxies to `GET /glossary/terms/{termId}` → returns `{ ..., linked_assets: [{ link_id, asset_id, column_name, sf_table_name, created_at }] }`
  - `POST /api/glossary/{termId}?action=link-asset` → proxies to `POST /glossary/terms/{termId}/link-asset` with body `{ asset_id, column_name? }`
  - `DELETE /api/glossary/{termId}?link_id={linkId}` → proxies to `DELETE /glossary/terms/{termId}/link-asset/{linkId}`

- [ ] **Step 1: Replace the file contents entirely**

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

function authHeader(req: NextRequest): Record<string, string> {
  const auth = req.headers.get('Authorization')
  return auth ? { Authorization: auth } : {}
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  try {
    const { termId } = await params
    const res = await fetch(`${BACKEND}/glossary/terms/${termId}`, {
      headers: { ...authHeader(req) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  try {
    const { termId } = await params
    const action = req.nextUrl.searchParams.get('action')

    if (action === 'link-asset') {
      const body = await req.json()
      const res = await fetch(`${BACKEND}/glossary/terms/${termId}/link-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(req) },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }

    // Existing workflow actions: submit, approve, reject
    if (!action || !['submit', 'approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const body = action === 'reject' ? await req.json() : {}
    const res = await fetch(`${BACKEND}/glossary/terms/${termId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(req) },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ termId: string }> },
) {
  try {
    const { termId } = await params
    const linkId = req.nextUrl.searchParams.get('link_id')
    if (!linkId) {
      return NextResponse.json({ error: 'link_id is required' }, { status: 400 })
    }
    const res = await fetch(`${BACKEND}/glossary/terms/${termId}/link-asset/${linkId}`, {
      method: 'DELETE',
      headers: { ...authHeader(req) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/glossary/[termId]/route.ts
git commit -m "feat(frontend): extend glossary term proxy route with GET, link-asset POST, and unlink DELETE"
```

---

### Task 9: Frontend — Glossary page — linked assets panel + link-asset modal

**Files:**
- Modify: `frontend/src/app/glossary/page.tsx`

**Interfaces:**
- Consumes: `GET /api/glossary/{termId}` (Task 8), `POST /api/glossary/{termId}?action=link-asset` (Task 8), `DELETE /api/glossary/{termId}?link_id={id}` (Task 8), `GET /api/catalog` (existing)
- Produces: Term popup shows linked assets list with Unlink buttons and a Link Asset modal that searches catalog assets.

- [ ] **Step 1: Add `LinkedAsset` type and linked-assets state to `GlossaryPage`**

At the top of `glossary/page.tsx`, after the `GlossaryTerm` interface, add:

```typescript
interface LinkedAsset {
  link_id: string
  asset_id: string
  column_name: string | null
  sf_table_name: string | null
  created_at: string | null
}

interface CatalogAsset {
  asset_id: string
  sf_table_name: string | null
  sf_schema_name: string | null
  sf_database_name: string | null
  connection_name: string | null
}
```

Inside the `GlossaryPage` function body, after the existing `const [actionError, ...]` state, add:

```typescript
const [popupLinkedAssets, setPopupLinkedAssets] = useState<LinkedAsset[]>([])
const [popupLinkedLoading, setPopupLinkedLoading] = useState(false)
const [showLinkModal, setShowLinkModal] = useState(false)
const [catalogAssets, setCatalogAssets] = useState<CatalogAsset[]>([])
const [linkAssetId, setLinkAssetId] = useState('')
const [linkColumnName, setLinkColumnName] = useState('')
const [linkSearch, setLinkSearch] = useState('')
const [linking, setLinking] = useState(false)
const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
```

- [ ] **Step 2: Add fetch function for full term detail when popup opens**

Replace the existing line `const [popup, setPopup] = useState<GlossaryTerm | null>(null)` state handler. Find where `setPopup(term)` is called in the list (the `onClick={() => setPopup(term)}` in the `filtered.map` block) and replace it with an async handler. Add this function in the component body:

```typescript
async function openPopup(term: GlossaryTerm) {
  setPopup(term)
  setPopupLinkedAssets([])
  setPopupLinkedLoading(true)
  try {
    const res = await fetch(`/api/glossary/${term.id}`)
    if (res.ok) {
      const data = await res.json()
      setPopupLinkedAssets(data.linked_assets ?? [])
    }
  } catch {
    // linked assets will remain empty
  } finally {
    setPopupLinkedLoading(false)
  }
}
```

Then update the `onClick={() => setPopup(term)}` call site in the list to `onClick={() => openPopup(term)}`.

- [ ] **Step 3: Add unlink and link-asset functions**

```typescript
async function unlinkAsset(termId: string, linkId: string) {
  setUnlinkingId(linkId)
  try {
    const res = await fetch(`/api/glossary/${termId}?link_id=${linkId}`, { method: 'DELETE' })
    if (res.ok) {
      setPopupLinkedAssets(prev => prev.filter(a => a.link_id !== linkId))
      setTerms(prev => prev.map(t =>
        t.id === termId ? { ...t, linkedAssets: Math.max(0, t.linkedAssets - 1) } : t
      ))
    }
  } catch {
    // silently ignore — list will be stale until popup reopened
  } finally {
    setUnlinkingId(null)
  }
}

async function openLinkModal(termId: string) {
  setShowLinkModal(true)
  setLinkAssetId('')
  setLinkColumnName('')
  setLinkSearch('')
  if (catalogAssets.length === 0) {
    try {
      const res = await fetch('/api/catalog')
      if (res.ok) {
        const data = await res.json()
        setCatalogAssets(Array.isArray(data) ? data : [])
      }
    } catch {
      // catalog assets remain empty
    }
  }
}

async function submitLink(termId: string) {
  if (!linkAssetId) return
  setLinking(true)
  try {
    const res = await fetch(`/api/glossary/${termId}?action=link-asset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_id: linkAssetId, column_name: linkColumnName || null }),
    })
    if (res.ok) {
      const link = await res.json()
      const asset = catalogAssets.find(a => a.asset_id === linkAssetId)
      setPopupLinkedAssets(prev => [...prev, {
        link_id: link.link_id,
        asset_id: linkAssetId,
        column_name: linkColumnName || null,
        sf_table_name: asset?.sf_table_name ?? null,
        created_at: link.created_at ?? null,
      }])
      setTerms(prev => prev.map(t =>
        t.id === termId ? { ...t, linkedAssets: t.linkedAssets + 1 } : t
      ))
      setShowLinkModal(false)
    }
  } catch {
    // silently ignore
  } finally {
    setLinking(false)
  }
}
```

- [ ] **Step 4: Add the linked assets section to the term popup JSX**

Inside the existing popup slide-in div (just before the closing `</div>` of the popup panel), after the `synonyms` block, add:

```typescript
{/* Linked Assets section */}
<div style={{ padding: '0 14px 12px' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
    <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
      Linked Assets
    </span>
    <button
      onClick={() => openLinkModal(popup.id)}
      style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
    >
      + Link Asset
    </button>
  </div>
  {popupLinkedLoading && (
    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Loading…</div>
  )}
  {!popupLinkedLoading && popupLinkedAssets.length === 0 && (
    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>No assets linked yet</div>
  )}
  {!popupLinkedLoading && popupLinkedAssets.map(la => (
    <div key={la.link_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--surface-muted)' }}>
      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {la.sf_table_name ?? la.asset_id}
        {la.column_name && (
          <span style={{ color: 'var(--text-muted)' }}>.{la.column_name}</span>
        )}
      </span>
      <button
        onClick={() => unlinkAsset(popup.id, la.link_id)}
        disabled={unlinkingId === la.link_id}
        style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--status-error-text)', cursor: unlinkingId === la.link_id ? 'not-allowed' : 'pointer', opacity: unlinkingId === la.link_id ? 0.6 : 1 }}
      >
        {unlinkingId === la.link_id ? '…' : 'Unlink'}
      </button>
    </div>
  ))}
</div>

{/* Link Asset modal (inline within popup) */}
{showLinkModal && (
  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
    <div style={{ background: 'var(--surface)', borderRadius: '10px', padding: '20px', width: '340px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)' }}>Link Asset to Term</div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Search Assets</label>
        <input
          value={linkSearch}
          onChange={e => setLinkSearch(e.target.value)}
          placeholder="Filter by table name…"
          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '11px', outline: 'none', boxSizing: 'border-box' as const }}
        />
        <select
          value={linkAssetId}
          onChange={e => setLinkAssetId(e.target.value)}
          size={5}
          style={{ width: '100%', marginTop: '4px', padding: '4px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '11px', outline: 'none', fontFamily: 'monospace' }}
        >
          {catalogAssets
            .filter(a => !linkSearch || (a.sf_table_name ?? '').toLowerCase().includes(linkSearch.toLowerCase()))
            .slice(0, 50)
            .map(a => (
              <option key={a.asset_id} value={a.asset_id}>
                {a.sf_table_name ?? a.asset_id}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Column name (optional)</label>
        <input
          value={linkColumnName}
          onChange={e => setLinkColumnName(e.target.value)}
          placeholder="e.g. customer_id"
          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: '11px', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowLinkModal(false)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
        <button
          onClick={() => submitLink(popup.id)}
          disabled={!linkAssetId || linking}
          style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: (!linkAssetId || linking) ? 'not-allowed' : 'pointer', opacity: (!linkAssetId || linking) ? 0.6 : 1 }}
        >
          {linking ? 'Linking…' : 'Link'}
        </button>
      </div>
    </div>
  </div>
)}
```

Note: The popup panel's parent `<div>` needs `position: 'relative'` for the modal overlay to be contained. Add `position: 'relative'` to the popup panel div (the one with `position: 'fixed', top: 0, right: 0...`). It already has `position: 'fixed'` so add `position: 'fixed'` and it should be fine — the absolute-positioned modal child will be relative to the viewport. That's acceptable since the glossary popup is full-height.

- [ ] **Step 5: Verify build passes**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/glossary/page.tsx
git commit -m "feat(frontend): add linked assets panel and link-asset modal to glossary term popup"
```

---

## Manual Verification Checklist

After all tasks are done, start both backend (`uvicorn app.main:app --reload`) and frontend (`cd frontend && npm run dev`) and verify:

**Catalog:**
- [ ] Quality score pill appears on rows that have DQ scores; shows `—` for assets without scores
- [ ] Tag chips appear below table name for tagged assets
- [ ] Clicking a row still opens `AssetDetailDrawer`
- [ ] Clicking a checkbox selects the row (accent border) without opening drawer
- [ ] "Select all" checkbox selects/deselects all visible rows
- [ ] Bottom bulk bar appears when 1+ rows selected; disappears on Clear
- [ ] Applying a criticality change updates all selected rows in place
- [ ] Opening drawer → Edit → Columns section is visible; description cells become inputs
- [ ] Typing a column description and clicking "Save Descriptions" succeeds (no error banner)
- [ ] Opening "History" section shows past audit entries with field diffs

**Glossary:**
- [ ] Clicking a term opens the popup; "Linked Assets" section loads (spinner, then list or "No assets")
- [ ] "+ Link Asset" opens the inline modal with an asset search list
- [ ] Searching filters the asset list; selecting one and clicking Link adds it to the linked list
- [ ] Unlink button removes the linked asset from the list and decrements the count badge
