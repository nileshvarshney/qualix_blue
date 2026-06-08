# Asset Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Data Asset" → "Asset Registry" everywhere (DB, Python, API, UI), extract Snowflake-specific fields into `asset_source_meta`, add `description` with AI generation and ancestor inheritance, and build a two-panel hierarchy-browser frontend.

**Architecture:** Two-phase DB migration — 0007 is additive (adds `description` + `asset_source_meta`, backfills), then code and API rename, then 0008 renames the table and drops Snowflake columns. Association proxies on the `Asset` model provide Python-land backward compat; SQL queries in `catalog.py` and `lineage.py` are updated to join `AssetSourceMeta` explicitly.

**Tech Stack:** Python/FastAPI/SQLAlchemy (async, PostgreSQL), Alembic migrations, Next.js 14 React (inline styles, CSS variables, `use client`), no Tailwind.

---

## File Map

**Created:**
- `migrations/versions/0007_asset_source_meta.py` — additive migration
- `migrations/versions/0008_rename_assets_table.py` — rename + column drop
- `app/api/assets_compat.py` — 308 redirect shim for `/assets → /asset-registry`
- `frontend/src/app/asset-registry/page.tsx` — new page
- `frontend/src/app/api/asset-registry/[...path]/route.ts` — Next.js proxy route
- `frontend/src/components/asset-registry/AssetTreePanel.tsx`
- `frontend/src/components/asset-registry/AssetDetailPanel.tsx`
- `frontend/src/components/asset-registry/AssetDescriptionField.tsx`

**Modified:**
- `app/db/models.py` — add `AssetSourceMeta`, rename `DataAsset → Asset`, add `description` + `source_meta` relationship + association proxies
- `app/schemas/asset.py` — rename schemas, add `AssetSourceMetaResponse`, backward-compat aliases
- `app/api/assets.py` — new prefix `/asset-registry`, tag, new endpoints, updated imports
- `app/services/asset_registry.py` — add `generate_description`, `effective_description`
- `app/services/discovery_service.py` — write `AssetSourceMeta` instead of inline Snowflake fields
- `app/services/ai_service.py` — update `generate_asset_description` to use `description` + `source_meta`
- `app/api/catalog.py` — join `AssetSourceMeta` for SQL-level Snowflake field queries
- `app/api/lineage.py` — join `AssetSourceMeta` for SQL-level Snowflake field queries
- `app/main.py` — register compat router
- All other `app/` files importing `DataAsset` — bulk rename via sed
- `frontend/src/components/ui/SectionTabBar.tsx` — label + href
- `frontend/src/app/datasets/page.tsx` — replace with redirect

---

## Task 1: Migration 0007 — additive (description + asset_source_meta)

**Files:**
- Create: `migrations/versions/0007_asset_source_meta.py`
- Test: `tests/test_asset_registry.py`

- [ ] **Step 1: Run existing tests to confirm baseline**

```bash
pytest tests/test_asset_registry.py -v
```

Expected: all 3 existing tests PASS.

- [ ] **Step 2: Create migration 0007**

Create `migrations/versions/0007_asset_source_meta.py`:

```python
"""Add asset_source_meta table and description column

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-07
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('data_assets', sa.Column('description', sa.Text(), nullable=True))

    op.create_table(
        'asset_source_meta',
        sa.Column('asset_id', sa.String(36), nullable=False),
        sa.Column('provider', sa.String(50), nullable=False, server_default='snowflake'),
        sa.Column('sf_account', sa.String(200), nullable=True),
        sa.Column('sf_database_name', sa.String(200), nullable=True),
        sa.Column('sf_schema_name', sa.String(200), nullable=True),
        sa.Column('sf_table_name', sa.String(200), nullable=True),
        sa.Column('sf_table_type', sa.String(50), nullable=True),
        sa.Column('view_definition', sa.Text(), nullable=True),
        sa.Column('row_count', sa.BigInteger(), nullable=True),
        sa.Column('bytes', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('asset_id'),
        sa.ForeignKeyConstraint(
            ['asset_id'], ['data_assets.asset_id'],
            name='fk_asm_data_assets', ondelete='CASCADE'
        ),
    )
    op.create_index('ix_asm_sf_table_name', 'asset_source_meta', ['sf_table_name'])
    op.create_index('ix_asm_sf_schema_name', 'asset_source_meta', ['sf_schema_name'])

    conn = op.get_bind()
    conn.execute(sa.text("""
        INSERT INTO asset_source_meta
            (asset_id, provider, sf_account, sf_database_name, sf_schema_name,
             sf_table_name, sf_table_type, view_definition, row_count, bytes,
             created_at, updated_at)
        SELECT asset_id, 'snowflake',
               snowflake_account, sf_database_name, sf_schema_name,
               sf_table_name, table_type, view_definition, row_count, bytes,
               created_at, updated_at
        FROM data_assets
        WHERE connection_id IS NOT NULL
          AND sf_table_name IS NOT NULL
    """))

    conn.execute(sa.text("""
        UPDATE data_assets
        SET description = table_description
        WHERE table_description IS NOT NULL AND description IS NULL
    """))


def downgrade() -> None:
    op.drop_index('ix_asm_sf_table_name', 'asset_source_meta')
    op.drop_index('ix_asm_sf_schema_name', 'asset_source_meta')
    op.drop_table('asset_source_meta')
    op.drop_column('data_assets', 'description')
```

- [ ] **Step 3: Run migration**

```bash
alembic upgrade 0007
```

Expected: exits cleanly. Verify: `alembic current` shows `0007`.

- [ ] **Step 4: Verify backfill row count**

```bash
python -c "
import os
from sqlalchemy import create_engine, text
eng = create_engine(os.environ['DATABASE_URL'].replace('+asyncpg',''))
with eng.connect() as c:
    n = c.execute(text('SELECT COUNT(*) FROM asset_source_meta')).scalar()
    print(f'asset_source_meta rows: {n}')
"
```

Expected: a non-zero integer equal to the number of table-type assets in your DB.

- [ ] **Step 5: Commit**

```bash
git add migrations/versions/0007_asset_source_meta.py
git commit -m "feat: migration 0007 — add asset_source_meta table and description column"
```

---

## Task 2: Add AssetSourceMeta ORM model and wire into DataAsset

**Files:**
- Modify: `app/db/models.py`

- [ ] **Step 1: Add `AssetSourceMeta` class to `app/db/models.py`**

Find the line `class RuleTag(Base):` (the first class after `DataAsset`) and insert the new model immediately before it:

```python
class AssetSourceMeta(Base):
    __tablename__ = "asset_source_meta"

    asset_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("data_assets.asset_id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(50), server_default="snowflake", nullable=False)
    sf_account: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sf_database_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sf_schema_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sf_table_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sf_table_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    view_definition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    row_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)

    asset: Mapped["DataAsset"] = relationship("DataAsset", back_populates="source_meta")
```

- [ ] **Step 2: Add `description` and `source_meta` to `DataAsset`**

Inside `DataAsset`, after the `last_seen_at` field (end of the "Asset Registry fields" block), add:

```python
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    source_meta: Mapped[Optional["AssetSourceMeta"]] = relationship(
        "AssetSourceMeta", back_populates="asset", uselist=False, cascade="all, delete-orphan"
    )
```

Do NOT add association proxies yet — the Snowflake columns still exist as mapped columns and would conflict. Proxies are added in Task 12 after migration 0008 drops those columns.

- [ ] **Step 3: Verify `BigInteger` and `Text` are already imported in `models.py`**

```bash
grep -n "BigInteger\|Text\b" app/db/models.py | head -5
```

Expected: both appear. If missing, add them to the SQLAlchemy import line.

- [ ] **Step 4: Run tests**

```bash
pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/db/models.py
git commit -m "feat: add AssetSourceMeta model and source_meta/description to DataAsset"
```

---

## Task 3: Rename DataAsset → Asset across all Python files

**Files:**
- Modify: `app/db/models.py` (class name + relationship strings)
- Modify: all `app/api/*.py`, `app/services/*.py` that import `DataAsset`

- [ ] **Step 1: Rename the class and self-references in `app/db/models.py`**

Change the class declaration:
```python
class Asset(Base):
    __tablename__ = "data_assets"   # stays "data_assets" until Task 12
```

Update every string literal that references `"DataAsset"` inside `models.py` (relationship strings, `remote_side`, `foreign_keys`):

```python
# In Domain class:
assets: Mapped[list["Asset"]] = relationship("Asset", back_populates="domain_obj")

# In Subdomain class:
assets: Mapped[list["Asset"]] = relationship("Asset", back_populates="subdomain")

# In AssetSourceMeta class:
asset: Mapped["Asset"] = relationship("Asset", back_populates="source_meta")

# In Asset class — self-referential:
parent: Mapped[Optional["Asset"]] = relationship(
    "Asset",
    remote_side="Asset.asset_id",
    foreign_keys="[Asset.parent_asset_id]",
    back_populates="children",
)
children: Mapped[list["Asset"]] = relationship(
    "Asset",
    foreign_keys="[Asset.parent_asset_id]",
    back_populates="parent",
)

# In DQRule class:
asset: Mapped["Asset"] = relationship("Asset", back_populates="rules")

# In DQRuleRun class:
asset: Mapped["Asset"] = relationship("Asset", back_populates="rule_runs")

# All other models (AssetComment, AssetUsage, AssetRating, etc.):
asset: Mapped["Asset"] = relationship("Asset", ...)
```

Also update `domain_obj`, `subdomain`, `rules`, `rule_runs` back_populates inside `Asset` to still say `"domain_obj"` etc. (those don't change, only the class name in the string changes).

- [ ] **Step 2: Bulk sed rename in all non-migration Python files**

```bash
find app tests -name "*.py" ! -path "*/__pycache__/*" | \
  xargs sed -i.bak 's/\bDataAsset\b/Asset/g'
find app tests -name "*.py.bak" -delete
```

- [ ] **Step 3: Verify no stray `DataAsset` outside migrations**

```bash
grep -rn "\bDataAsset\b" app tests --include="*.py" | grep -v "__pycache__"
```

Expected: zero output.

- [ ] **Step 4: Run tests**

```bash
pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: rename DataAsset → Asset across all Python files"
```

---

## Task 4: Rename schemas DataAsset* → Asset* in asset.py

**Files:**
- Modify: `app/schemas/asset.py`
- Modify: `app/api/assets.py`

- [ ] **Step 1: Rename schema classes in `app/schemas/asset.py`**

Make these renames (class names only — the sed in Task 3 already renamed `DataAsset` inside file bodies, so check for any remaining old names):

- `DataAssetCreate` → `AssetCreate`
- `DataAssetUpdate` → `AssetUpdate`
- `DataAssetCertifyRequest` → `AssetCertifyRequest`
- `DataAssetResponse` → `AssetResponse`

Run to check: `grep -n "DataAsset" app/schemas/asset.py` — should be zero after Task 3's sed.

- [ ] **Step 2: Add `AssetSourceMetaResponse` class**

Add after `AssetTreeNode`:

```python
class AssetSourceMetaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    provider: str = 'snowflake'
    sf_account: Optional[str] = None
    sf_database_name: Optional[str] = None
    sf_schema_name: Optional[str] = None
    sf_table_name: Optional[str] = None
    sf_table_type: Optional[str] = None
    view_definition: Optional[str] = None
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    updated_at: Optional[datetime] = None
```

- [ ] **Step 3: Rewrite `AssetResponse` to include the new registry fields**

Replace the existing `AssetResponse` (was `DataAssetResponse`) with:

```python
class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asset_id: str
    parent_asset_id: Optional[str] = None
    connection_id: Optional[str] = None
    asset_type: str = 'table'
    physical_name: Optional[str] = None
    display_name: Optional[str] = None
    qualified_name: Optional[str] = None
    path: Optional[str] = None
    description: Optional[str] = None
    status: str = 'active'
    criticality: str = 'medium'
    sensitivity: Optional[str] = None
    owner_user_id: Optional[str] = None
    owner_team_id: Optional[str] = None
    steward_user_id: Optional[str] = None
    domain: Optional[str] = None
    domain_id: Optional[str] = None
    subdomain_id: Optional[str] = None
    certification_status: str = 'uncertified'
    certified_by: Optional[str] = None
    certified_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    discovered_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    source_meta: Optional[AssetSourceMetaResponse] = None
```

- [ ] **Step 4: Rename `DiscoveryRequest` → `AssetRegistryDiscoveryRequest` and add aliases**

Change the class name in the schema, then add backward-compat aliases at the bottom of `asset.py`:

```python
# Backward-compatibility aliases (safe to remove once all callers are updated)
DataAssetCreate = AssetCreate
DataAssetUpdate = AssetUpdate
DataAssetCertifyRequest = AssetCertifyRequest
DataAssetResponse = AssetResponse
DiscoveryRequest = AssetRegistryDiscoveryRequest
```

- [ ] **Step 5: Update import in `app/api/assets.py`**

```python
from app.schemas.asset import (
    AssetCreate, AssetUpdate, AssetResponse, AssetCertifyRequest,
    AssetStatusUpdate, AssetRegistryDiscoveryRequest, AssetTreeNode,
    AssetSourceMetaResponse,
)
```

Update every use of the old schema names inside `assets.py` to the new names.

- [ ] **Step 6: Run tests**

```bash
pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/schemas/asset.py app/api/assets.py
git commit -m "refactor: rename DataAsset* schemas to Asset*, add AssetSourceMetaResponse"
```

---

## Task 5: Update catalog.py SQL queries for AssetSourceMeta

**Files:**
- Modify: `app/api/catalog.py`

- [ ] **Step 1: Add `AssetSourceMeta` to the models import**

```python
from app.db.models import (
    Asset, GlossaryTerm, DataProduct, AssetUsage,
    Domain, Subdomain, AssetSourceMeta,
)
```

- [ ] **Step 2: Update the search query to outer-join AssetSourceMeta**

Find the block that builds `q_stmt` with `sf_table_name.ilike`. Replace with:

```python
q_stmt = select(Asset).outerjoin(
    AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id
)
if q:
    pattern = f"%{q}%"
    q_stmt = q_stmt.where(
        AssetSourceMeta.sf_table_name.ilike(pattern)
        | Asset.description.ilike(pattern)
        | Asset.display_name.ilike(pattern)
    )
if domain_id:
    q_stmt = q_stmt.where(Asset.domain_id == domain_id)
if certification:
    q_stmt = q_stmt.where(Asset.certification_status == certification)
if owner:
    q_stmt = q_stmt.where(Asset.owner_user_id.ilike(f"%{owner}%"))
```

- [ ] **Step 3: Update sort clauses**

Change:
```python
Asset.table_description.isnot(None).desc(),
```
To:
```python
Asset.description.isnot(None).desc(),
```

- [ ] **Step 4: Update response dict field access throughout the file**

Replace every `a.sf_table_name`, `a.table_description`, `a.sf_schema_name`, `a.sf_database_name` in response dicts with source_meta-aware access:

```python
"name": (a.source_meta.sf_table_name if a.source_meta else None) or a.physical_name or a.display_name,
"description": a.description,
"sf_table_name": a.source_meta.sf_table_name if a.source_meta else None,
"sf_schema_name": a.source_meta.sf_schema_name if a.source_meta else None,
"sf_database_name": a.source_meta.sf_database_name if a.source_meta else None,
```

Sort by `Asset.sf_table_name` → sort by `Asset.physical_name`:
```python
.order_by(Asset.physical_name)
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_catalog_search.py -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/catalog.py
git commit -m "fix: catalog.py joins AssetSourceMeta for SQL-level field access"
```

---

## Task 6: Update lineage.py SQL queries for AssetSourceMeta

**Files:**
- Modify: `app/api/lineage.py`

- [ ] **Step 1: Update models import**

```python
from app.db.models import Asset, AssetSourceMeta, ColumnMetadata, ColumnProfileHistory, SnowflakeConnection
```

- [ ] **Step 2: Update `_enrich` to access fields via `source_meta`**

```python
async def _enrich(asset: Asset, db: AsyncSession) -> dict:
    meta = asset.source_meta
    return {
        "asset_id": asset.asset_id,
        "sf_table_name": meta.sf_table_name if meta else asset.physical_name,
        "sf_schema_name": meta.sf_schema_name if meta else None,
        "sf_database_name": meta.sf_database_name if meta else None,
        "table_description": asset.description,
        "connection_id": asset.connection_id,
        "criticality": asset.criticality,
        "row_count": meta.row_count if meta else None,
    }
```

- [ ] **Step 3: Update upstream-asset SQL query**

Change:
```python
select(Asset).where(
    func.upper(Asset.sf_table_name).in_(refs),
    Asset.connection_id == asset.connection_id,
    Asset.asset_id != asset_id,
)
```
To:
```python
select(Asset).join(
    AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id
).where(
    func.upper(AssetSourceMeta.sf_table_name).in_(refs),
    Asset.connection_id == asset.connection_id,
    Asset.asset_id != asset_id,
)
```

- [ ] **Step 4: Update downstream-asset SQL query**

```python
table_name = asset.source_meta.sf_table_name if asset.source_meta else asset.physical_name or ""
downstream_result = await db.execute(
    select(Asset).join(
        AssetSourceMeta, Asset.asset_id == AssetSourceMeta.asset_id
    ).where(
        AssetSourceMeta.view_definition.ilike(f"%{table_name}%"),
        Asset.connection_id == asset.connection_id,
        Asset.asset_id != asset_id,
    )
)
downstream_assets = downstream_result.scalars().all()
for candidate in downstream_assets:
    refs_cand = extract_table_refs(
        candidate.source_meta.view_definition if candidate.source_meta else ""
    )
```

- [ ] **Step 5: Update `_sync_fetch_view_definition`**

```python
def _sync_fetch_view_definition(conn: SnowflakeConnection, asset: Asset) -> Optional[str]:
    meta = asset.source_meta
    if not meta or not meta.sf_table_name:
        return None
    from app.api.connections import _open_connector
    sf = _open_connector(conn)
    cur = sf.cursor()
    try:
        db_part = f'"{meta.sf_database_name}".' if meta.sf_database_name else ""
        cur.execute(
            f"SELECT GET_DDL('VIEW', '{db_part}\"{meta.sf_schema_name}\".\"{meta.sf_table_name}\"')"
        )
        return cur.fetchone()[0]
    except Exception as exc:
        logger.debug("view_definition fetch failed for %s: %s", meta.sf_table_name, exc)
        return None
    finally:
        cur.close()
        sf.close()
```

- [ ] **Step 6: Update lazy view_definition fetch and save**

```python
meta = asset.source_meta
is_view = meta and meta.sf_table_type and meta.sf_table_type.upper() == 'VIEW'
if meta and is_view and not meta.view_definition and asset.connection_id:
    # ... fetch ...
    meta.view_definition = view_def
    await db.commit()

if meta and meta.view_definition and asset.connection_id:
    refs = extract_table_refs(meta.view_definition)
```

- [ ] **Step 7: Run tests**

```bash
pytest tests/test_lineage.py -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/api/lineage.py
git commit -m "fix: lineage.py joins AssetSourceMeta for SQL-level field access"
```

---

## Task 7: Rename assets.py API router — prefix, tag, new endpoints

**Files:**
- Modify: `app/api/assets.py`

- [ ] **Step 1: Change router prefix and tag**

```python
router = APIRouter(prefix="/asset-registry", tags=["Asset Registry"])
```

- [ ] **Step 2: Confirm no old names remain**

```bash
grep -n "DataAsset\|/assets\b\|Data Assets" app/api/assets.py
```

Expected: zero matches (the sed in Task 3 + the schema rename in Task 4 have cleaned these up).

- [ ] **Step 3: Add `AssetSourceMeta` to the models import in assets.py**

```python
from app.db.models import Asset, Domain, Subdomain, AuditLog, SnowflakeConnection, AssetSourceMeta
```

- [ ] **Step 4: Test the new prefix**

```bash
uvicorn app.main:app --port 8001 &
sleep 2
curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/asset-registry
kill %1
```

Expected: `401` (not authenticated) or `200` — not `404`.

- [ ] **Step 5: Commit**

```bash
git add app/api/assets.py
git commit -m "feat: rename /assets router to /asset-registry with Asset Registry tag"
```

---

## Task 8: Expand asset_registry.py service

**Files:**
- Modify: `app/services/asset_registry.py`
- Modify: `app/services/ai_service.py`
- Test: `tests/test_asset_registry.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_asset_registry.py`:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock


@pytest.mark.asyncio
async def test_effective_description_returns_own():
    from app.services.asset_registry import effective_description
    db = AsyncMock()
    mock_asset = MagicMock()
    mock_asset.description = "My own description"
    mock_asset.parent_asset_id = None
    db.execute.return_value.scalar_one_or_none.return_value = mock_asset
    result = await effective_description("asset-123", db)
    assert result == "My own description"


@pytest.mark.asyncio
async def test_effective_description_walks_ancestors():
    from app.services.asset_registry import effective_description
    db = AsyncMock()
    child = MagicMock(); child.description = None; child.parent_asset_id = "parent-456"
    parent = MagicMock(); parent.description = "Parent desc"; parent.parent_asset_id = None
    db.execute.return_value.scalar_one_or_none.side_effect = [child, parent]
    result = await effective_description("child-123", db)
    assert result == "Parent desc"


@pytest.mark.asyncio
async def test_effective_description_none_when_empty_lineage():
    from app.services.asset_registry import effective_description
    db = AsyncMock()
    asset = MagicMock(); asset.description = None; asset.parent_asset_id = None
    db.execute.return_value.scalar_one_or_none.return_value = asset
    result = await effective_description("orphan-123", db)
    assert result is None
```

- [ ] **Step 2: Run to confirm they fail**

```bash
pytest tests/test_asset_registry.py::test_effective_description_returns_own -v
```

Expected: FAIL (function not found).

- [ ] **Step 3: Implement `effective_description` and `generate_description` in `asset_registry.py`**

Replace the entire contents of `app/services/asset_registry.py`:

```python
"""Asset Registry service — stable IDs and description utilities."""
from __future__ import annotations
import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

_REGISTRY_NS = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')


def stable_asset_id(qualified_path: str) -> str:
    """Return a deterministic UUID v5 for a given qualified path string.

    Examples:
        stable_asset_id("source:conn-123")
        stable_asset_id("schema:conn-123:MY_DB:PUBLIC")
        stable_asset_id("column:table-asset-uuid:COLUMN_NAME")
    """
    return str(uuid.uuid5(_REGISTRY_NS, qualified_path))


async def effective_description(asset_id: str, db: AsyncSession) -> Optional[str]:
    """Return this asset's description, or walk ancestors until one is found."""
    from app.db.models import Asset
    visited: set[str] = set()
    current_id: Optional[str] = asset_id
    while current_id and current_id not in visited:
        visited.add(current_id)
        result = await db.execute(select(Asset).where(Asset.asset_id == current_id))
        asset = result.scalar_one_or_none()
        if not asset:
            break
        if asset.description:
            return asset.description
        current_id = asset.parent_asset_id
    return None


async def generate_description(
    asset_id: str,
    db: AsyncSession,
    provider_name: Optional[str] = None,
) -> str:
    """AI-generate a description for the given asset and persist it."""
    from app.services.ai_service import generate_asset_description
    return await generate_asset_description(asset_id, provider_name, db)
```

- [ ] **Step 4: Update `generate_asset_description` in `app/services/ai_service.py`**

Find `async def generate_asset_description` and replace its body with:

```python
async def generate_asset_description(
    asset_id: str,
    provider_name: Optional[str],
    db: AsyncSession,
) -> str:
    """Generate and save a business description for a data asset using column metadata."""
    from app.db.models import ColumnMetadata, Asset, AssetSourceMeta
    from sqlalchemy.orm import selectinload

    asset_res = await db.execute(
        select(Asset)
        .options(selectinload(Asset.source_meta))
        .where(Asset.asset_id == asset_id)
    )
    asset = asset_res.scalar_one_or_none()
    if not asset:
        return "Asset not found."

    meta = asset.source_meta
    table_label = (
        f"{meta.sf_schema_name}.{meta.sf_table_name}"
        if meta and meta.sf_table_name
        else asset.qualified_name or asset.physical_name or asset_id
    )

    cols_res = await db.execute(
        select(ColumnMetadata).where(ColumnMetadata.asset_id == asset_id).limit(50)
    )
    cols = cols_res.scalars().all()
    col_lines = []
    for c in cols:
        line = f"- {c.column_name} ({c.data_type or 'unknown'})"
        if c.cardinality_pct is not None:
            line += f", cardinality {c.cardinality_pct:.0f}%"
        if c.sample_values:
            line += f", samples: {c.sample_values[:80]}"
        col_lines.append(line)

    sys_doc = (
        "You are a data governance expert. Write a concise 2-4 sentence business description "
        "for a data asset. Describe what business data it contains, who likely uses it, "
        "and what it is useful for. Do NOT mention column names directly. Write for a business audience."
    )
    prompt = (
        f"Asset: {table_label}\n"
        f"Type: {asset.asset_type}\n"
        f"Criticality: {asset.criticality}\n"
        f"Columns ({len(cols)}):\n" + "\n".join(col_lines[:30])
    )

    provider = await get_provider_from_db(provider_name, db)
    description = (await provider.complete(prompt, sys_doc, max_tokens=300)).strip()
    asset.description = description
    await db.commit()
    return description
```

- [ ] **Step 5: Run tests**

```bash
pytest tests/test_asset_registry.py -v --tb=short
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/services/asset_registry.py app/services/ai_service.py tests/test_asset_registry.py
git commit -m "feat: add effective_description and generate_description to asset_registry service"
```

---

## Task 9: Add generate-description and effective-description endpoints

**Files:**
- Modify: `app/api/assets.py`

- [ ] **Step 1: Add both endpoints to `app/api/assets.py`**

Add after the existing `/{asset_id}/certify` endpoint:

```python
@router.post("/{asset_id}/generate-description")
async def generate_asset_description_endpoint(
    asset_id: str,
    provider_name: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """AI-generate a business description for this asset and save it."""
    from app.services.asset_registry import generate_description
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Asset not found")
    description = await generate_description(asset_id, db, provider_name)
    return {"asset_id": asset_id, "description": description}


@router.get("/{asset_id}/effective-description")
async def get_effective_description(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return this asset's description, or the nearest ancestor's if own is empty."""
    from app.services.asset_registry import effective_description
    result = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    desc = await effective_description(asset_id, db)
    source = "own" if asset.description else "inherited"
    return {"asset_id": asset_id, "description": desc, "source": source}
```

- [ ] **Step 2: Verify both paths appear in OpenAPI**

```bash
uvicorn app.main:app --port 8001 &
sleep 2
curl -s http://localhost:8001/openapi.json | python3 -c "
import json, sys
spec = json.load(sys.stdin)
for p in sorted(spec['paths']):
    if 'asset-registry' in p and 'description' in p:
        print(p)
"
kill %1
```

Expected output includes:
```
/asset-registry/{asset_id}/effective-description
/asset-registry/{asset_id}/generate-description
```

- [ ] **Step 3: Commit**

```bash
git add app/api/assets.py
git commit -m "feat: add generate-description and effective-description endpoints"
```

---

## Task 10: Update discovery_service.py to write AssetSourceMeta

**Files:**
- Modify: `app/services/discovery_service.py`
- Modify: `app/api/assets.py` (refresh-stats endpoint)

- [ ] **Step 1: Add `AssetSourceMeta` to models import in `discovery_service.py`**

```python
from app.db.models import AuditLog, Asset, Domain, DQRule, Subdomain, SnowflakeConnection, AssetSourceMeta
```

- [ ] **Step 2: Update the asset upsert block in `run_discovery`**

Find where `Asset` records are created for discovered tables (look for `Asset(asset_id=...`). Update so Snowflake fields go to `AssetSourceMeta`, not `Asset`:

```python
# Create the Asset (no Snowflake-specific fields)
asset = Asset(
    asset_id=asset_id,
    parent_asset_id=schema_asset_id,
    connection_id=connection_id,
    asset_type='table',
    physical_name=table_name,
    display_name=table_name,
    qualified_name=qualified_name,
    status='active',
    is_active=True,
    criticality=criticality,
    domain_id=domain_id,
    subdomain_id=subdomain_id,
    discovered_at=now,
    last_seen_at=now,
)
db.add(asset)

# Create the AssetSourceMeta with Snowflake-specific fields
db.add(AssetSourceMeta(
    asset_id=asset_id,
    provider='snowflake',
    sf_account=conn.account,
    sf_database_name=db_name,
    sf_schema_name=schema_name,
    sf_table_name=table_name,
    sf_table_type=table_info.get('table_type'),
    row_count=table_info.get('row_count'),
    bytes=table_info.get('bytes'),
))
```

For the existing-asset upsert path:

```python
existing.last_seen_at = now
existing.status = 'active'
if existing.source_meta:
    existing.source_meta.row_count = table_info.get('row_count')
    existing.source_meta.bytes = table_info.get('bytes')
    existing.source_meta.sf_table_type = table_info.get('table_type')
    existing.source_meta.updated_at = now
else:
    db.add(AssetSourceMeta(
        asset_id=existing.asset_id,
        provider='snowflake',
        sf_database_name=db_name,
        sf_schema_name=schema_name,
        sf_table_name=table_name,
        sf_table_type=table_info.get('table_type'),
        row_count=table_info.get('row_count'),
        bytes=table_info.get('bytes'),
    ))
```

- [ ] **Step 3: Update `refresh-stats` endpoint in `assets.py`**

Replace the return block of `refresh_asset_stats`:

```python
@router.post("/{asset_id}/refresh-stats")
async def refresh_asset_stats(asset_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Asset).options(selectinload(Asset.source_meta)).where(Asset.asset_id == asset_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(404, "Asset not found")
    if not asset.connection_id:
        raise HTTPException(400, "Asset has no associated connection; cannot fetch live stats")

    conn_result = await db.execute(
        select(SnowflakeConnection).where(SnowflakeConnection.connection_id == asset.connection_id)
    )
    conn = conn_result.scalar_one_or_none()
    if not conn:
        raise HTTPException(404, "Connection not found")

    from app.services.discovery_service import _browse_tables_sync, _validate_ident
    import asyncio as _asyncio

    meta = asset.source_meta
    if not meta or not meta.sf_database_name or not meta.sf_schema_name:
        raise HTTPException(400, "Asset has no source metadata; cannot refresh stats")

    try:
        db_safe = _validate_ident(meta.sf_database_name, "database")
        schema_safe = _validate_ident(meta.sf_schema_name, "schema")
    except ValueError as e:
        raise HTTPException(400, str(e))

    try:
        tables = await _asyncio.to_thread(_browse_tables_sync, conn, db_safe, schema_safe)
    except Exception as e:
        raise HTTPException(502, f"Snowflake error: {e}")

    match = next((t for t in tables if t["table_name"].upper() == (meta.sf_table_name or "").upper()), None)
    if not match:
        raise HTTPException(404, f"Table {meta.sf_table_name!r} not found in {db_safe}.{schema_safe}")

    meta.row_count = match.get("row_count")
    meta.bytes = match.get("bytes")
    meta.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.commit()

    return {
        "asset_id": asset_id,
        "row_count": meta.row_count,
        "bytes": meta.bytes,
        "message": "Stats refreshed from Snowflake",
    }
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/services/discovery_service.py app/api/assets.py
git commit -m "feat: discovery writes AssetSourceMeta; refresh-stats updates source_meta"
```

---

## Task 11: Add /assets 308 redirect compat shim

**Files:**
- Create: `app/api/assets_compat.py`
- Modify: `app/main.py`

- [ ] **Step 1: Create `app/api/assets_compat.py`**

```python
"""HTTP 308 redirect shim: /assets/* → /asset-registry/*

Preserves backward compatibility for clients still using the old /assets prefix.
"""
from __future__ import annotations
from fastapi import APIRouter
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/assets", tags=["_compat"])


@router.api_route("", methods=["GET", "POST"])
async def redirect_root():
    return RedirectResponse(url="/asset-registry", status_code=308)


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def redirect_to_asset_registry(path: str):
    return RedirectResponse(url=f"/asset-registry/{path}", status_code=308)
```

- [ ] **Step 2: Register in `app/main.py`**

Add to the imports block:
```python
from app.api import assets_compat
```

Add after `app.include_router(assets.router)`:
```python
app.include_router(assets_compat.router)
```

- [ ] **Step 3: Verify the redirect**

```bash
uvicorn app.main:app --port 8001 &
sleep 2
curl -v http://localhost:8001/assets 2>&1 | grep -E "HTTP|Location"
kill %1
```

Expected:
```
< HTTP/1.1 308 Permanent Redirect
< location: /asset-registry
```

- [ ] **Step 4: Commit**

```bash
git add app/api/assets_compat.py app/main.py
git commit -m "feat: add /assets → /asset-registry 308 redirect compat shim"
```

---

## Task 12: Migration 0008 — rename table, drop Snowflake columns, add proxies

**Files:**
- Create: `migrations/versions/0008_rename_assets_table.py`
- Modify: `app/db/models.py` (`__tablename__`, FK string, association proxies)

- [ ] **Step 1: Create migration 0008**

```python
"""Rename data_assets → assets, drop Snowflake-specific columns

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-07
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None

SNOWFLAKE_COLS = [
    'snowflake_account', 'sf_database_name', 'sf_schema_name',
    'sf_table_name', 'table_type', 'table_description',
    'view_definition', 'row_count', 'bytes',
]


def upgrade() -> None:
    # PostgreSQL keeps all existing FK constraints valid after rename (tracked by OID)
    op.rename_table('data_assets', 'assets')

    for col in SNOWFLAKE_COLS:
        op.drop_column('assets', col)

    # Re-create asset_source_meta FK to reference renamed table
    op.drop_constraint('fk_asm_data_assets', 'asset_source_meta', type_='foreignkey')
    op.create_foreign_key(
        'fk_asm_asset_id', 'asset_source_meta', 'assets',
        ['asset_id'], ['asset_id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_asm_asset_id', 'asset_source_meta', type_='foreignkey')
    op.create_foreign_key(
        'fk_asm_data_assets', 'asset_source_meta', 'data_assets',
        ['asset_id'], ['asset_id'], ondelete='CASCADE'
    )
    op.rename_table('assets', 'data_assets')
    # Dropped Snowflake columns are NOT restored; data lives in asset_source_meta
```

- [ ] **Step 2: Run migration**

```bash
alembic upgrade 0008
```

Expected: no errors. `alembic current` shows `0008`.

- [ ] **Step 3: Update `__tablename__` and FK string in `app/db/models.py`**

In `Asset` class:
```python
__tablename__ = "assets"
```

In `AssetSourceMeta` class — update the FK:
```python
asset_id: Mapped[str] = mapped_column(
    String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), primary_key=True
)
```

- [ ] **Step 4: Add association proxies to `Asset` (now safe — mapped columns are dropped)**

Add to the top of `models.py` imports:
```python
from sqlalchemy.ext.associationproxy import association_proxy
```

Inside the `Asset` class, after the `source_meta` relationship, add:

```python
    # Backward-compat proxies for Python attribute access after Snowflake column drop
    sf_table_name = association_proxy("source_meta", "sf_table_name")
    sf_schema_name = association_proxy("source_meta", "sf_schema_name")
    sf_database_name = association_proxy("source_meta", "sf_database_name")
    sf_table_type = association_proxy("source_meta", "sf_table_type")
    view_definition = association_proxy("source_meta", "view_definition")
    row_count = association_proxy("source_meta", "row_count")
    bytes = association_proxy("source_meta", "bytes")
    snowflake_account = association_proxy("source_meta", "sf_account")

    @property
    def table_description(self) -> Optional[str]:
        return self.description
```

- [ ] **Step 5: Run all tests**

```bash
pytest tests/ -v --tb=short
```

Expected: all tests pass.

- [ ] **Step 6: Final stray-name check**

```bash
grep -rn "\bdata_assets\b\|\bDataAsset\b" app tests --include="*.py" | grep -v "__pycache__" | grep -v "migrations/"
```

Expected: zero output.

- [ ] **Step 7: Commit**

```bash
git add migrations/versions/0008_rename_assets_table.py app/db/models.py
git commit -m "feat: migration 0008 — rename data_assets to assets, add association proxies"
```

---

## Task 13: Frontend — /asset-registry page and components

**Files:**
- Create: `frontend/src/app/asset-registry/page.tsx`
- Create: `frontend/src/app/api/asset-registry/[...path]/route.ts`
- Create: `frontend/src/components/asset-registry/AssetDescriptionField.tsx`
- Create: `frontend/src/components/asset-registry/AssetDetailPanel.tsx`
- Create: `frontend/src/components/asset-registry/AssetTreePanel.tsx`

- [ ] **Step 1: Create directories**

```bash
mkdir -p frontend/src/app/asset-registry \
         frontend/src/app/api/asset-registry/\[...path\] \
         frontend/src/components/asset-registry
```

- [ ] **Step 2: Create `AssetDescriptionField.tsx`**

Create `frontend/src/components/asset-registry/AssetDescriptionField.tsx`:

```tsx
'use client'
import { useState } from 'react'

interface Props {
  assetId: string
  description: string | null
  inheritedFrom: string | null
  onSave: (desc: string) => void
}

export default function AssetDescriptionField({ assetId, description, inheritedFrom, onSave }: Props) {
  const [value, setValue] = useState(description ?? '')
  const [generating, setGenerating] = useState(false)
  const [dirty, setDirty] = useState(false)

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/asset-registry/${assetId}/generate-description`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setValue(data.description ?? '')
        setDirty(true)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    await fetch(`/api/asset-registry/${assetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: value }),
    })
    onSave(value)
    setDirty(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          Description
        </span>
        <button
          onClick={generate}
          disabled={generating}
          style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}
        >
          {generating ? '…' : '✨ Generate'}
        </button>
        {dirty && (
          <button
            onClick={save}
            style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
          >
            Save
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setDirty(true) }}
        rows={3}
        placeholder={inheritedFrom ? `Inherited from ${inheritedFrom}` : 'Add a business description…'}
        style={{
          width: '100%', resize: 'vertical', padding: '6px 8px',
          border: '1px solid var(--border)', borderRadius: '6px',
          background: 'var(--surface)', color: 'var(--foreground)',
          fontSize: 'var(--text-sm)', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      {!description && inheritedFrom && (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          ↑ inherited from {inheritedFrom}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `AssetDetailPanel.tsx`**

Create `frontend/src/components/asset-registry/AssetDetailPanel.tsx`:

```tsx
'use client'
import AssetDescriptionField from './AssetDescriptionField'

interface AssetMeta {
  sf_table_name?: string
  sf_schema_name?: string
  sf_database_name?: string
  row_count?: number
  bytes?: number
}

interface Asset {
  asset_id: string
  asset_type: string
  display_name?: string
  physical_name?: string
  qualified_name?: string
  description?: string
  status: string
  criticality: string
  sensitivity?: string
  owner_user_id?: string
  owner_team_id?: string
  steward_user_id?: string
  domain?: string
  discovered_at?: string
  last_seen_at?: string
  connection_id?: string
  source_meta?: AssetMeta
}

const TYPE_COLOR: Record<string, string> = {
  source: '#7c3aed', database: '#1d4ed8', schema: '#0369a1', table: '#065f46',
  column: '#9a3412', file: '#92400e', dataset: '#374151', logical_dataset: '#4b5563',
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  active:      { background: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)' },
  missing:     { background: 'var(--status-warn-bg)',     color: 'var(--status-warn-text)' },
  deprecated:  { background: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
  scan_failed: { background: 'var(--status-error-bg)',   color: 'var(--status-error-text)' },
  disabled:    { background: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-sm)', color: value != null ? 'var(--foreground)' : 'var(--text-muted)' }}>
        {value != null ? String(value) : '—'}
      </div>
    </div>
  )
}

export default function AssetDetailPanel({
  asset,
  onDescriptionSaved,
}: {
  asset: Asset | null
  onDescriptionSaved: (desc: string) => void
}) {
  if (!asset) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Select an asset from the tree
      </div>
    )
  }

  const label = asset.display_name || asset.physical_name || asset.asset_id
  const typeBg = TYPE_COLOR[asset.asset_type] ?? '#64748b'
  const statusStyle = STATUS_STYLE[asset.status] ?? STATUS_STYLE.disabled

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ background: typeBg, color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {asset.asset_type}
        </span>
        <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--foreground)' }}>{label}</span>
        <span style={{ ...statusStyle, fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginLeft: 'auto' }}>
          {asset.status}
        </span>
      </div>

      {asset.qualified_name && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {asset.qualified_name}
        </div>
      )}

      <AssetDescriptionField
        assetId={asset.asset_id}
        description={asset.description ?? null}
        inheritedFrom={null}
        onSave={onDescriptionSaved}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px' }}>
        <Field label="Criticality" value={asset.criticality} />
        <Field label="Sensitivity" value={asset.sensitivity} />
        <Field label="Domain" value={asset.domain} />
        <Field label="Owner" value={asset.owner_user_id} />
        <Field label="Team" value={asset.owner_team_id} />
        <Field label="Steward" value={asset.steward_user_id} />
        <Field label="Discovered" value={asset.discovered_at ? new Date(asset.discovered_at).toLocaleDateString() : null} />
        <Field label="Last Seen" value={asset.last_seen_at ? new Date(asset.last_seen_at).toLocaleDateString() : null} />
        <Field label="Connection" value={asset.connection_id} />
      </div>

      {asset.source_meta && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          <Field label="Database" value={asset.source_meta.sf_database_name} />
          <Field label="Schema" value={asset.source_meta.sf_schema_name} />
          <Field label="Table" value={asset.source_meta.sf_table_name} />
          {asset.source_meta.row_count != null && (
            <Field label="Rows" value={asset.source_meta.row_count.toLocaleString()} />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <a href={`/rules?asset_id=${asset.asset_id}`}
          style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--border)', color: 'var(--text-secondary)', textDecoration: 'none', background: 'var(--surface)' }}>
          Run Rules
        </a>
        {(asset.asset_type === 'table' || asset.asset_type === 'view') && (
          <a href={`/datasets?asset_id=${asset.asset_id}`}
            style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--border)', color: 'var(--text-secondary)', textDecoration: 'none', background: 'var(--surface)' }}>
            View Columns
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `AssetTreePanel.tsx`**

Create `frontend/src/components/asset-registry/AssetTreePanel.tsx`:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'

interface TreeNode {
  asset_id: string
  display_name?: string
  physical_name?: string
  asset_type: string
  status: string
  qualified_name?: string
  children: TreeNode[]
  _expanded?: boolean
  _loaded?: boolean
}

const TYPE_ICON: Record<string, string> = {
  source: '⬡', database: '▦', schema: '▤', table: '▣',
  column: '∣', file: '⊟', dataset: '◈', logical_dataset: '◉',
}
const STATUS_DOT: Record<string, string> = {
  active: '#16a34a', missing: '#d97706', deprecated: '#94a3b8',
  scan_failed: '#dc2626', disabled: '#94a3b8',
}

function updateNodeInTree(
  nodes: TreeNode[],
  id: string,
  patch: Partial<TreeNode>,
): TreeNode[] {
  return nodes.map(n =>
    n.asset_id === id
      ? { ...n, ...patch }
      : { ...n, children: updateNodeInTree(n.children, id, patch) }
  )
}

function NodeRow({
  node, depth, onSelect, selectedId, onToggle,
}: {
  node: TreeNode; depth: number; onSelect: (id: string) => void
  selectedId: string | null; onToggle: (id: string) => void
}) {
  const isSelected = node.asset_id === selectedId
  const canExpand = node.asset_type !== 'column'
  const label = node.display_name || node.physical_name || node.asset_id
  const dot = STATUS_DOT[node.status] ?? '#94a3b8'
  const icon = TYPE_ICON[node.asset_type] ?? '▸'

  return (
    <div>
      <div
        onClick={() => { onSelect(node.asset_id); if (canExpand) onToggle(node.asset_id) }}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          paddingLeft: `${12 + depth * 14}px`, paddingRight: '8px',
          paddingTop: '4px', paddingBottom: '4px',
          cursor: 'pointer', borderRadius: '4px', userSelect: 'none',
          background: isSelected ? 'var(--accent-bg)' : 'transparent',
          color: isSelected ? 'var(--accent)' : 'var(--foreground)',
        }}
      >
        <span style={{ fontSize: '9px', width: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
          {canExpand ? (node._expanded ? '▾' : '▸') : ''}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 'var(--text-sm)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dot, flexShrink: 0 }} />
      </div>
      {node._expanded && node.children.map(child => (
        <NodeRow key={child.asset_id} node={child} depth={depth + 1}
          onSelect={onSelect} selectedId={selectedId} onToggle={onToggle} />
      ))}
    </div>
  )
}

export default function AssetTreePanel({
  onSelect, selectedId,
}: {
  onSelect: (id: string) => void; selectedId: string | null
}) {
  const [roots, setRoots] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<TreeNode[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetch('/api/asset-registry/tree?depth=2')
      .then(r => r.json())
      .then(data => { setRoots(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const toggleNode = useCallback((assetId: string) => {
    setRoots(prev => {
      const node = findNode(prev, assetId)
      if (!node) return prev
      if (!node._loaded && !node._expanded) {
        fetch(`/api/asset-registry/${assetId}/children`)
          .then(r => r.json())
          .then(children => {
            setRoots(p => updateNodeInTree(p, assetId, {
              _loaded: true, _expanded: true,
              children: Array.isArray(children) ? children : [],
            }))
          })
        return updateNodeInTree(prev, assetId, { _expanded: true })
      }
      return updateNodeInTree(prev, assetId, { _expanded: !node._expanded })
    })
  }, [])

  function findNode(nodes: TreeNode[], id: string): TreeNode | null {
    for (const n of nodes) {
      if (n.asset_id === id) return n
      const found = findNode(n.children, id)
      if (found) return found
    }
    return null
  }

  async function doSearch(q: string) {
    if (!q.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const res = await fetch(`/api/asset-registry/search?q=${encodeURIComponent(q)}&limit=30`)
      const data = await res.json()
      setSearchResults(Array.isArray(data) ? data : [])
    } finally {
      setSearching(false)
    }
  }

  const displayNodes = searchResults ?? roots

  return (
    <div style={{ width: '280px', minWidth: '180px', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); doSearch(e.target.value) }}
          placeholder="Search assets…"
          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '5px', fontSize: 'var(--text-sm)', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        {(loading || searching) && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {loading ? 'Loading…' : 'Searching…'}
          </div>
        )}
        {!loading && !searching && displayNodes.map(node => (
          <NodeRow key={node.asset_id} node={node} depth={0}
            onSelect={onSelect} selectedId={selectedId} onToggle={toggleNode} />
        ))}
        {!loading && !searching && displayNodes.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No assets found</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `frontend/src/app/asset-registry/page.tsx`**

```tsx
'use client'
import { useState, useCallback } from 'react'
import AssetTreePanel from '@/components/asset-registry/AssetTreePanel'
import AssetDetailPanel from '@/components/asset-registry/AssetDetailPanel'

interface Asset {
  asset_id: string
  asset_type: string
  display_name?: string
  physical_name?: string
  qualified_name?: string
  description?: string
  status: string
  criticality: string
  sensitivity?: string
  owner_user_id?: string
  owner_team_id?: string
  steward_user_id?: string
  domain?: string
  discovered_at?: string
  last_seen_at?: string
  connection_id?: string
  source_meta?: { sf_table_name?: string; sf_schema_name?: string; sf_database_name?: string; row_count?: number }
}

export default function AssetRegistryPage() {
  const [selected, setSelected] = useState<Asset | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSelect = useCallback(async (assetId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/asset-registry/${assetId}`)
      if (res.ok) setSelected(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDescriptionSaved = useCallback((desc: string) => {
    setSelected(prev => prev ? { ...prev, description: desc } : prev)
  }, [])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--background)' }}>
      <AssetTreePanel onSelect={handleSelect} selectedId={selected?.asset_id ?? null} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, background: 'var(--surface)' }}>
          <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Asset Registry</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Master inventory of all discovered data assets</span>
        </div>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>
        ) : (
          <AssetDetailPanel asset={selected} onDescriptionSaved={handleDescriptionSaved} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create the Next.js API proxy route**

Create `frontend/src/app/api/asset-registry/[...path]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8000'

function fwd(req: NextRequest) {
  return { Authorization: req.headers.get('Authorization') ?? '' }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/')
  const res = await fetch(`${BACKEND}/asset-registry/${path}${req.nextUrl.search}`, { headers: fwd(req) })
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/')
  const res = await fetch(`${BACKEND}/asset-registry/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...fwd(req) },
    body: await req.text(),
  })
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
}

export async function PUT(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/')
  const res = await fetch(`${BACKEND}/asset-registry/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...fwd(req) },
    body: await req.text(),
  })
  return NextResponse.json(await res.json().catch(() => ({})), { status: res.status })
}
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/asset-registry/ \
        frontend/src/app/api/asset-registry/ \
        frontend/src/components/asset-registry/
git commit -m "feat: add Asset Registry frontend page and tree/detail components"
```

---

## Task 14: Frontend navigation — SectionTabBar, Sidebar, datasets redirect

**Files:**
- Modify: `frontend/src/components/ui/SectionTabBar.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/app/datasets/page.tsx`

- [ ] **Step 1: Update `SectionTabBar.tsx`**

Change:
```tsx
{ href: '/datasets',       label: 'Data Assets' },
```
To:
```tsx
{ href: '/asset-registry', label: 'Asset Registry' },
```

- [ ] **Step 2: Update `Sidebar.tsx` active-path map**

Find the `SECTION_KEY_MAP` object. Change:
```typescript
'/datasets': 'quality',
```
To:
```typescript
'/datasets': 'quality', '/asset-registry': 'quality',
```

- [ ] **Step 3: Replace `/datasets` page with a redirect**

Replace the full contents of `frontend/src/app/datasets/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'

export default function DatasetsRedirect() {
  redirect('/asset-registry')
}
```

- [ ] **Step 4: Start dev server and verify**

```bash
cd frontend && npm run dev &
sleep 5
```

Open `http://localhost:3000/asset-registry` — expect the two-panel layout.
Open `http://localhost:3000/datasets` — expect redirect to `/asset-registry`.
Click "Data Quality" in the sidebar — expect "Asset Registry" tab in the tab bar.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/SectionTabBar.tsx \
        frontend/src/components/Sidebar.tsx \
        frontend/src/app/datasets/page.tsx
git commit -m "feat: rename Data Assets nav to Asset Registry, redirect /datasets"
```

---

## Final Verification Checklist

Run all of these after Task 14:

```bash
# 1. No stray DataAsset or data_assets references in app/tests (outside migrations)
grep -rn "\bDataAsset\b\|\bdata_assets\b" app tests --include="*.py" | grep -v "__pycache__" | grep -v "migrations/"

# 2. No old /assets prefix in non-compat routes
grep -rn "prefix.*\"/assets\"" app --include="*.py" | grep -v "compat"

# 3. All backend tests green
pytest tests/ -v --tb=short

# 4. /asset-registry responds (not 404)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/asset-registry

# 5. /assets 308 redirects to /asset-registry
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/assets

# 6. Alembic is at 0008
alembic current
```

Expected: grep finds nothing; all tests pass; asset-registry returns 401/200; assets returns 308; current shows `0008`.
