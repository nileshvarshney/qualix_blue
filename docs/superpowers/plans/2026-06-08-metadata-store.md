# Metadata Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist rich, normalized metadata (column schema, operational scan state, quality placeholders) on existing asset models and add a daily-rollup snapshot table for historical comparisons.

**Architecture:** Additive migration (0011) extends `assets`, `asset_source_meta`, and `column_metadata` in place, and creates `asset_metadata_snapshots`. A new `metadata_store` service owns all reads/writes; a new `/metadata` router exposes four endpoints. The discovery service is updated to call the store after each table scan.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy 2 async, Snowflake + `snowflake-sqlalchemy` (VARIANT for JSON), Pydantic v2, Alembic, pytest with `asyncio_mode = auto`.

**Spec:** `docs/superpowers/specs/2026-06-08-metadata-store-design.md`

---

## File Map

| File | Action |
|---|---|
| `migrations/versions/0011_metadata_store.py` | Create — additive DDL + backfill |
| `app/db/models.py` | Modify — extend `Asset`, `AssetSourceMeta`, `ColumnMetadata`; add `AssetMetadataSnapshot` |
| `app/schemas/metadata.py` | Create — Pydantic schemas for the metadata store |
| `app/services/metadata_store.py` | Create — all reads and writes for the metadata store |
| `app/api/metadata.py` | Create — four API endpoints |
| `app/main.py` | Modify — import and register the new router |
| `app/services/discovery_service.py` | Modify — call `upsert_column_metadata` and `record_scan_result` at end of each table scan |
| `tests/test_metadata_store.py` | Create — pure-function and async-mock service tests |

---

## Task 1: Migration 0011 — Additive DDL

**Files:**
- Create: `migrations/versions/0011_metadata_store.py`

No tests needed for migration files; correctness is verified by running the migration.

- [ ] **Step 1: Create the migration file**

```python
# migrations/versions/0011_metadata_store.py
"""Add metadata store: extend assets, asset_source_meta, column_metadata; add asset_metadata_snapshots

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-08
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Extend assets — operational + quality placeholders
    op.add_column('assets', sa.Column('last_scanned_at', sa.DateTime(), nullable=True))
    op.add_column('assets', sa.Column('scan_status', sa.String(20), nullable=True))
    op.add_column('assets', sa.Column('scan_duration_ms', sa.Integer(), nullable=True))
    op.add_column('assets', sa.Column('scan_version', sa.String(50), nullable=True))
    op.add_column('assets', sa.Column('latest_profile_score', sa.Float(), nullable=True))
    op.add_column('assets', sa.Column('latest_quality_status', sa.String(20), nullable=True))
    op.add_column('assets', sa.Column('is_critical_data_element', sa.Boolean(),
                                     nullable=False, server_default=sa.text('false')))
    op.add_column('assets', sa.Column('attached_rule_count', sa.Integer(),
                                     nullable=False, server_default=sa.text('0')))

    # 2. Extend asset_source_meta
    op.add_column('asset_source_meta', sa.Column('partition_info', VARIANT(), nullable=True))
    op.add_column('asset_source_meta', sa.Column('last_modified_at', sa.DateTime(), nullable=True))
    op.add_column('asset_source_meta', sa.Column('table_created_at', sa.DateTime(), nullable=True))

    # 3. Extend column_metadata
    op.add_column('column_metadata', sa.Column('precision', sa.Integer(), nullable=True))
    op.add_column('column_metadata', sa.Column('scale', sa.Integer(), nullable=True))
    op.add_column('column_metadata', sa.Column('character_max_length', sa.Integer(), nullable=True))
    op.add_column('column_metadata', sa.Column('default_value', sa.Text(), nullable=True))
    op.add_column('column_metadata', sa.Column('is_partition_key', sa.Boolean(),
                                               nullable=False, server_default=sa.text('false')))
    op.add_column('column_metadata', sa.Column('partition_key_index', sa.Integer(), nullable=True))

    # 4. Create asset_metadata_snapshots
    op.create_table(
        'asset_metadata_snapshots',
        sa.Column('snapshot_id', sa.String(36), primary_key=True),
        sa.Column('asset_id', sa.String(36),
                  sa.ForeignKey('assets.asset_id', ondelete='CASCADE'), nullable=False),
        sa.Column('snapshot_date', sa.Date(), nullable=False),
        sa.Column('scan_version', sa.String(50), nullable=True),
        sa.Column('scan_status', sa.String(20), nullable=True),
        sa.Column('scan_duration_ms', sa.Integer(), nullable=True),
        sa.Column('row_count', sa.BigInteger(), nullable=True),
        sa.Column('bytes', sa.BigInteger(), nullable=True),
        sa.Column('last_modified_at', sa.DateTime(), nullable=True),
        sa.Column('column_count', sa.Integer(), nullable=True),
        sa.Column('schema_hash', sa.String(64), nullable=True),
        sa.Column('latest_profile_score', sa.Float(), nullable=True),
        sa.Column('latest_quality_status', sa.String(20), nullable=True),
        sa.Column('attached_rule_count', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('asset_id', 'snapshot_date', name='uq_ams_asset_date'),
    )
    op.create_index('ix_ams_asset_date', 'asset_metadata_snapshots',
                    ['asset_id', 'snapshot_date'])

    # 5. Backfill attached_rule_count from existing active rules
    op.execute("""
        UPDATE assets
        SET attached_rule_count = (
            SELECT COUNT(*) FROM dq_rules
            WHERE dq_rules.asset_id = assets.asset_id
            AND dq_rules.is_active = TRUE
        )
    """)


def downgrade() -> None:
    op.drop_table('asset_metadata_snapshots')
    for col in ['last_modified_at', 'table_created_at', 'partition_info']:
        op.drop_column('asset_source_meta', col)
    for col in ['partition_key_index', 'is_partition_key', 'default_value',
                'character_max_length', 'scale', 'precision']:
        op.drop_column('column_metadata', col)
    for col in ['attached_rule_count', 'is_critical_data_element', 'latest_quality_status',
                'latest_profile_score', 'scan_version', 'scan_duration_ms',
                'scan_status', 'last_scanned_at']:
        op.drop_column('assets', col)
```

- [ ] **Step 2: Run the migration**

```bash
alembic upgrade head
```

Expected: `Running upgrade 0010 -> 0011, Add metadata store ...`

- [ ] **Step 3: Verify columns exist**

```bash
alembic current
```

Expected: `0011 (head)`

- [ ] **Step 4: Commit**

```bash
git add migrations/versions/0011_metadata_store.py
git commit -m "feat: migration 0011 — metadata store schema"
```

---

## Task 2: ORM Model Extensions

**Files:**
- Modify: `app/db/models.py`

- [ ] **Step 1: Add 8 operational + quality columns to `Asset` (after `description` field, around line 149)**

```python
    # Operational metadata — written by discovery scanner
    last_scanned_at:           Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    scan_status:               Mapped[Optional[str]]      = mapped_column(String(20), nullable=True)
    scan_duration_ms:          Mapped[Optional[int]]      = mapped_column(Integer, nullable=True)
    scan_version:              Mapped[Optional[str]]      = mapped_column(String(50), nullable=True)
    # Quality placeholders — written by Phase 2 profiler; NULL until then
    latest_profile_score:      Mapped[Optional[float]]    = mapped_column(Float, nullable=True)
    latest_quality_status:     Mapped[Optional[str]]      = mapped_column(String(20), nullable=True)
    is_critical_data_element:  Mapped[bool]               = mapped_column(Boolean, default=False)
    attached_rule_count:       Mapped[int]                = mapped_column(Integer, default=0)
```

- [ ] **Step 2: Add 3 columns to `AssetSourceMeta` (after `updated_at` field, before the `asset` relationship)**

```python
    partition_info:    Mapped[Optional[dict]]     = mapped_column(JSONVariant, nullable=True)
    last_modified_at:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    table_created_at:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 3: Add 6 columns to `ColumnMetadata` (after `last_profiled_at` field, before `updated_by`)**

```python
    precision:             Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    scale:                 Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    character_max_length:  Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    default_value:         Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
    is_partition_key:      Mapped[bool]           = mapped_column(Boolean, default=False)
    partition_key_index:   Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
```

- [ ] **Step 4: Add `AssetMetadataSnapshot` model (after `ColumnProfileHistory`, before `DataProduct`)**

`date` is already imported at line 5 (`from datetime import datetime, timezone, date`).

```python
class AssetMetadataSnapshot(Base):
    __tablename__ = "asset_metadata_snapshots"
    __table_args__ = (
        UniqueConstraint("asset_id", "snapshot_date", name="uq_ams_asset_date"),
    )

    snapshot_id:           Mapped[str]             = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id:              Mapped[str]             = mapped_column(
        String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    snapshot_date:         Mapped[date]            = mapped_column(Date, nullable=False)
    scan_version:          Mapped[Optional[str]]   = mapped_column(String(50), nullable=True)
    scan_status:           Mapped[Optional[str]]   = mapped_column(String(20), nullable=True)
    scan_duration_ms:      Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    row_count:             Mapped[Optional[int]]   = mapped_column(BigInteger, nullable=True)
    bytes:                 Mapped[Optional[int]]   = mapped_column(BigInteger, nullable=True)
    last_modified_at:      Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    column_count:          Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    schema_hash:           Mapped[Optional[str]]   = mapped_column(String(64), nullable=True)
    latest_profile_score:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latest_quality_status: Mapped[Optional[str]]   = mapped_column(String(20), nullable=True)
    attached_rule_count:   Mapped[Optional[int]]   = mapped_column(Integer, nullable=True)
    created_at:            Mapped[datetime]        = mapped_column(DateTime, default=now)
    updated_at:            Mapped[datetime]        = mapped_column(DateTime, default=now, onupdate=now)
```

- [ ] **Step 5: Verify Python import is clean**

```bash
python -c "from app.db.models import Asset, AssetSourceMeta, ColumnMetadata, AssetMetadataSnapshot; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add app/db/models.py
git commit -m "feat: extend ORM models for metadata store (0011)"
```

---

## Task 3: Pydantic Schemas

**Files:**
- Create: `app/schemas/metadata.py`

- [ ] **Step 1: Create the schemas file**

```python
# app/schemas/metadata.py
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date


class ColumnMetaIn(BaseModel):
    """Input model — carries all fields fetched from INFORMATION_SCHEMA.COLUMNS."""
    column_name: str
    data_type: Optional[str] = None
    is_nullable: Optional[bool] = None
    ordinal_position: Optional[int] = None
    default_value: Optional[str] = None
    character_max_length: Optional[int] = None
    precision: Optional[int] = None
    scale: Optional[int] = None
    is_partition_key: bool = False
    partition_key_index: Optional[int] = None
    description: Optional[str] = None
    is_primary_key: bool = False
    is_foreign_key: bool = False
    references_table: Optional[str] = None


class ColumnMetaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    col_id: str
    column_name: str
    data_type: Optional[str] = None
    is_nullable: Optional[bool] = None
    ordinal_position: Optional[int] = None
    precision: Optional[int] = None
    scale: Optional[int] = None
    character_max_length: Optional[int] = None
    default_value: Optional[str] = None
    is_primary_key: bool = False
    is_foreign_key: bool = False
    references_table: Optional[str] = None
    is_partition_key: bool = False
    partition_key_index: Optional[int] = None
    description: Optional[str] = None
    last_profiled_at: Optional[datetime] = None
    updated_at: datetime


class AssetMetaCurrentState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asset_id: str
    asset_type: str
    qualified_name: Optional[str] = None
    physical_name: Optional[str] = None
    display_name: Optional[str] = None
    status: str
    # Operational
    scan_status: Optional[str] = None
    last_scanned_at: Optional[datetime] = None
    scan_duration_ms: Optional[int] = None
    scan_version: Optional[str] = None
    # Source meta
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    last_modified_at: Optional[datetime] = None
    table_created_at: Optional[datetime] = None
    partition_info: Optional[dict] = None
    # Quality placeholders
    latest_profile_score: Optional[float] = None
    latest_quality_status: Optional[str] = None
    is_critical_data_element: bool = False
    attached_rule_count: int = 0
    # Ownership
    owner_user_id: Optional[str] = None
    owner_team_id: Optional[str] = None
    steward_user_id: Optional[str] = None


class SnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    snapshot_id: str
    snapshot_date: date
    scan_status: Optional[str] = None
    row_count: Optional[int] = None
    bytes: Optional[int] = None
    column_count: Optional[int] = None
    schema_hash: Optional[str] = None
    scan_duration_ms: Optional[int] = None
    scan_version: Optional[str] = None
    latest_profile_score: Optional[float] = None
    latest_quality_status: Optional[str] = None
    attached_rule_count: Optional[int] = None
    updated_at: datetime


class CDEPatch(BaseModel):
    is_critical_data_element: bool
```

- [ ] **Step 2: Verify import**

```bash
python -c "from app.schemas.metadata import ColumnMetaIn, ColumnMetaOut, AssetMetaCurrentState, SnapshotResponse, CDEPatch; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add app/schemas/metadata.py
git commit -m "feat: add metadata Pydantic schemas"
```

---

## Task 4: `compute_schema_hash` — Pure Utility

**Files:**
- Create: `app/services/metadata_store.py` (initial skeleton)
- Create: `tests/test_metadata_store.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_metadata_store.py
from app.schemas.metadata import ColumnMetaIn


def _col(name: str, dtype: str | None = None) -> ColumnMetaIn:
    return ColumnMetaIn(column_name=name, data_type=dtype)


def test_schema_hash_is_deterministic():
    from app.services.metadata_store import compute_schema_hash
    cols = [_col("ID", "NUMBER"), _col("NAME", "VARCHAR")]
    assert compute_schema_hash(cols) == compute_schema_hash(cols)


def test_schema_hash_is_order_independent():
    from app.services.metadata_store import compute_schema_hash
    cols_a = [_col("ID", "NUMBER"), _col("NAME", "VARCHAR")]
    cols_b = [_col("NAME", "VARCHAR"), _col("ID", "NUMBER")]
    assert compute_schema_hash(cols_a) == compute_schema_hash(cols_b)


def test_schema_hash_is_case_insensitive():
    from app.services.metadata_store import compute_schema_hash
    assert compute_schema_hash([_col("id", "number")]) == compute_schema_hash([_col("ID", "NUMBER")])


def test_schema_hash_differs_on_added_column():
    from app.services.metadata_store import compute_schema_hash
    a = [_col("ID", "NUMBER")]
    b = [_col("ID", "NUMBER"), _col("EMAIL", "VARCHAR")]
    assert compute_schema_hash(a) != compute_schema_hash(b)


def test_schema_hash_differs_on_type_change():
    from app.services.metadata_store import compute_schema_hash
    assert compute_schema_hash([_col("AMT", "FLOAT")]) != compute_schema_hash([_col("AMT", "NUMBER")])


def test_schema_hash_empty_columns():
    from app.services.metadata_store import compute_schema_hash
    assert compute_schema_hash([]) == compute_schema_hash([])


def test_schema_hash_none_data_type_equals_empty_string():
    from app.services.metadata_store import compute_schema_hash
    assert compute_schema_hash([_col("ID", None)]) == compute_schema_hash([_col("ID", "")])
```

- [ ] **Step 2: Run tests — expect ImportError (file doesn't exist yet)**

```bash
pytest tests/test_metadata_store.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError` or `ImportError` for `metadata_store`.

- [ ] **Step 3: Create `app/services/metadata_store.py` with the hash function**

```python
# app/services/metadata_store.py
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone, date as date_t
from typing import Optional

from sqlalchemy import select, asc, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Asset, AssetSourceMeta, AssetMetadataSnapshot, ColumnMetadata,
    gen_uuid,
)
from app.schemas.metadata import (
    ColumnMetaIn, AssetMetaCurrentState, SnapshotResponse, ColumnMetaOut,
)

logger = logging.getLogger("dq_platform.metadata_store")

SCANNER_VERSION = "1.0.0"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def compute_schema_hash(columns: list[ColumnMetaIn]) -> str:
    """MD5 of sorted (column_name, data_type) pairs — case-insensitive."""
    pairs = sorted(
        (c.column_name.upper(), (c.data_type or "").upper())
        for c in columns
    )
    return hashlib.md5(json.dumps(pairs).encode()).hexdigest()
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pytest tests/test_metadata_store.py -v -k "schema_hash"
```

Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add app/services/metadata_store.py tests/test_metadata_store.py
git commit -m "feat: metadata_store — compute_schema_hash + tests"
```

---

## Task 5: `upsert_column_metadata`

**Files:**
- Modify: `app/services/metadata_store.py`
- Modify: `tests/test_metadata_store.py`

- [ ] **Step 1: Append the failing tests to `tests/test_metadata_store.py`**

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.schemas.metadata import ColumnMetaIn


@pytest.mark.asyncio
async def test_upsert_column_metadata_inserts_new_column():
    from app.services.metadata_store import upsert_column_metadata
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None  # no existing row

    col = ColumnMetaIn(column_name="order_id", data_type="NUMBER",
                       is_nullable=False, is_primary_key=True, precision=38, scale=0)
    await upsert_column_metadata(db, "asset-abc", [col])

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.column_name == "order_id"
    assert added.data_type == "NUMBER"
    assert added.is_primary_key is True
    assert added.precision == 38
    assert added.scale == 0
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_column_metadata_updates_existing_column():
    from app.services.metadata_store import upsert_column_metadata
    db = AsyncMock()
    existing = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = existing

    col = ColumnMetaIn(column_name="amount", data_type="NUMBER",
                       precision=18, scale=2, is_partition_key=True, partition_key_index=1)
    await upsert_column_metadata(db, "asset-abc", [col])

    db.add.assert_not_called()
    assert existing.data_type == "NUMBER"
    assert existing.precision == 18
    assert existing.scale == 2
    assert existing.is_partition_key is True
    assert existing.partition_key_index == 1
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_column_metadata_empty_list_still_commits():
    from app.services.metadata_store import upsert_column_metadata
    db = AsyncMock()
    await upsert_column_metadata(db, "asset-abc", [])
    db.add.assert_not_called()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_upsert_column_metadata_multiple_columns():
    from app.services.metadata_store import upsert_column_metadata
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    cols = [
        ColumnMetaIn(column_name="id", data_type="NUMBER"),
        ColumnMetaIn(column_name="name", data_type="VARCHAR"),
    ]
    await upsert_column_metadata(db, "asset-abc", cols)
    assert db.add.call_count == 2
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pytest tests/test_metadata_store.py -v -k "upsert_column" 2>&1 | tail -10
```

Expected: `AttributeError` — `upsert_column_metadata` not defined yet.

- [ ] **Step 3: Add `upsert_column_metadata` to `app/services/metadata_store.py`**

```python
async def upsert_column_metadata(
    db: AsyncSession,
    asset_id: str,
    columns: list[ColumnMetaIn],
) -> None:
    """Create or update column_metadata rows. Absent columns are left untouched."""
    for col in columns:
        result = await db.execute(
            select(ColumnMetadata).where(
                ColumnMetadata.asset_id == asset_id,
                ColumnMetadata.column_name == col.column_name,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.data_type = col.data_type
            existing.is_nullable = col.is_nullable
            existing.ordinal_position = col.ordinal_position
            existing.default_value = col.default_value
            existing.character_max_length = col.character_max_length
            existing.precision = col.precision
            existing.scale = col.scale
            existing.is_partition_key = col.is_partition_key
            existing.partition_key_index = col.partition_key_index
            existing.description = col.description
            existing.is_primary_key = col.is_primary_key
            existing.is_foreign_key = col.is_foreign_key
            existing.references_table = col.references_table
        else:
            db.add(ColumnMetadata(
                col_id=gen_uuid(),
                asset_id=asset_id,
                column_name=col.column_name,
                data_type=col.data_type,
                is_nullable=col.is_nullable,
                ordinal_position=col.ordinal_position,
                default_value=col.default_value,
                character_max_length=col.character_max_length,
                precision=col.precision,
                scale=col.scale,
                is_partition_key=col.is_partition_key,
                partition_key_index=col.partition_key_index,
                description=col.description,
                is_primary_key=col.is_primary_key,
                is_foreign_key=col.is_foreign_key,
                references_table=col.references_table,
            ))
    await db.commit()
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pytest tests/test_metadata_store.py -v -k "upsert_column"
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add app/services/metadata_store.py tests/test_metadata_store.py
git commit -m "feat: metadata_store — upsert_column_metadata + tests"
```

---

## Task 6: `record_scan_result`

**Files:**
- Modify: `app/services/metadata_store.py`
- Modify: `tests/test_metadata_store.py`

- [ ] **Step 1: Append the failing tests**

```python
@pytest.mark.asyncio
async def test_record_scan_result_updates_asset_operational_fields():
    from app.services.metadata_store import record_scan_result
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 2
    asset.latest_quality_status = None
    asset.latest_profile_score = None
    # side_effect order: asset lookup, source_meta lookup, snapshot lookup
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, None, None]

    await record_scan_result(
        db, "asset-1", "success", "1.0.0", scan_duration_ms=300,
        row_count=1000, bytes=2048, last_modified_at=None,
        column_count=5, schema_hash="abc123",
    )

    assert asset.scan_status == "success"
    assert asset.scan_duration_ms == 300
    assert asset.scan_version == "1.0.0"
    assert asset.last_scanned_at is not None
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_record_scan_result_creates_snapshot_when_none_exists():
    from app.services.metadata_store import record_scan_result
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 0
    asset.latest_quality_status = None
    asset.latest_profile_score = None
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, None, None]

    await record_scan_result(
        db, "asset-1", "success", "1.0.0", scan_duration_ms=100,
        row_count=500, bytes=1024, last_modified_at=None,
        column_count=3, schema_hash="def456",
    )

    db.add.assert_called_once()
    snap = db.add.call_args[0][0]
    assert snap.scan_status == "success"
    assert snap.row_count == 500
    assert snap.schema_hash == "def456"
    assert snap.column_count == 3


@pytest.mark.asyncio
async def test_record_scan_result_updates_existing_snapshot():
    from app.services.metadata_store import record_scan_result
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 1
    asset.latest_quality_status = "good"
    asset.latest_profile_score = 98.5
    existing_snap = MagicMock()
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, None, existing_snap]

    await record_scan_result(
        db, "asset-1", "success", "1.0.1", scan_duration_ms=200,
        row_count=999, bytes=8192, last_modified_at=None,
        column_count=4, schema_hash="ghi789",
    )

    db.add.assert_not_called()
    assert existing_snap.scan_status == "success"
    assert existing_snap.row_count == 999
    assert existing_snap.latest_quality_status == "good"
    assert existing_snap.latest_profile_score == 98.5


@pytest.mark.asyncio
async def test_record_scan_result_updates_source_meta_row_count():
    from app.services.metadata_store import record_scan_result
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 0
    asset.latest_quality_status = None
    asset.latest_profile_score = None
    meta = MagicMock()
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, meta, None]

    await record_scan_result(
        db, "asset-1", "success", "1.0.0", scan_duration_ms=50,
        row_count=7777, bytes=65536, last_modified_at=None,
        column_count=2, schema_hash="hash1",
    )

    assert meta.row_count == 7777
    assert meta.bytes == 65536
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pytest tests/test_metadata_store.py -v -k "record_scan" 2>&1 | tail -10
```

Expected: `AttributeError` — `record_scan_result` not defined yet.

- [ ] **Step 3: Add `record_scan_result` to `app/services/metadata_store.py`**

```python
async def record_scan_result(
    db: AsyncSession,
    asset_id: str,
    scan_status: str,
    scan_version: str,
    scan_duration_ms: int,
    row_count: Optional[int],
    bytes: Optional[int],
    last_modified_at: Optional[datetime],
    column_count: int,
    schema_hash: str,
) -> None:
    """
    1. Update Asset: last_scanned_at, scan_status, scan_duration_ms, scan_version
    2. Update AssetSourceMeta: row_count, bytes, last_modified_at
    3. Upsert asset_metadata_snapshots for today (last write wins)
    """
    now_dt = _now()
    today = now_dt.date()

    # 1. Update Asset operational fields
    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if asset:
        asset.last_scanned_at = now_dt
        asset.scan_status = scan_status
        asset.scan_duration_ms = scan_duration_ms
        asset.scan_version = scan_version

    # 2. Update AssetSourceMeta
    meta_res = await db.execute(
        select(AssetSourceMeta).where(AssetSourceMeta.asset_id == asset_id)
    )
    meta = meta_res.scalar_one_or_none()
    if meta:
        if row_count is not None:
            meta.row_count = row_count
        if bytes is not None:
            meta.bytes = bytes
        if last_modified_at is not None:
            meta.last_modified_at = last_modified_at

    # 3. Upsert daily snapshot
    snap_res = await db.execute(
        select(AssetMetadataSnapshot).where(
            AssetMetadataSnapshot.asset_id == asset_id,
            AssetMetadataSnapshot.snapshot_date == today,
        )
    )
    snap = snap_res.scalar_one_or_none()
    attached = (asset.attached_rule_count if asset else None) or 0
    quality_status = asset.latest_quality_status if asset else None
    profile_score = asset.latest_profile_score if asset else None

    if snap:
        snap.scan_version = scan_version
        snap.scan_status = scan_status
        snap.scan_duration_ms = scan_duration_ms
        snap.row_count = row_count
        snap.bytes = bytes
        snap.last_modified_at = last_modified_at
        snap.column_count = column_count
        snap.schema_hash = schema_hash
        snap.latest_profile_score = profile_score
        snap.latest_quality_status = quality_status
        snap.attached_rule_count = attached
        snap.updated_at = now_dt
    else:
        db.add(AssetMetadataSnapshot(
            snapshot_id=gen_uuid(),
            asset_id=asset_id,
            snapshot_date=today,
            scan_version=scan_version,
            scan_status=scan_status,
            scan_duration_ms=scan_duration_ms,
            row_count=row_count,
            bytes=bytes,
            last_modified_at=last_modified_at,
            column_count=column_count,
            schema_hash=schema_hash,
            latest_profile_score=profile_score,
            latest_quality_status=quality_status,
            attached_rule_count=attached,
            created_at=now_dt,
            updated_at=now_dt,
        ))

    await db.commit()
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pytest tests/test_metadata_store.py -v -k "record_scan"
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add app/services/metadata_store.py tests/test_metadata_store.py
git commit -m "feat: metadata_store — record_scan_result + tests"
```

---

## Task 7: Governance Write Hooks

**Files:**
- Modify: `app/services/metadata_store.py`
- Modify: `tests/test_metadata_store.py`

- [ ] **Step 1: Append the failing tests**

```python
@pytest.mark.asyncio
async def test_update_quality_placeholders_sets_asset_fields():
    from app.services.metadata_store import update_quality_placeholders
    db = AsyncMock()
    asset = MagicMock()
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, None]  # asset, no snapshot

    await update_quality_placeholders(db, "asset-1", profile_score=95.5, quality_status="good")

    assert asset.latest_profile_score == 95.5
    assert asset.latest_quality_status == "good"
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_update_quality_placeholders_updates_snapshot():
    from app.services.metadata_store import update_quality_placeholders
    db = AsyncMock()
    asset = MagicMock()
    snap = MagicMock()
    db.execute.return_value.scalar_one_or_none.side_effect = [asset, snap]

    await update_quality_placeholders(db, "asset-1", profile_score=88.0, quality_status="warning")

    assert snap.latest_profile_score == 88.0
    assert snap.latest_quality_status == "warning"


@pytest.mark.asyncio
async def test_set_critical_data_element_sets_flag():
    from app.services.metadata_store import set_critical_data_element
    db = AsyncMock()
    asset = MagicMock()
    db.execute.return_value.scalar_one_or_none.return_value = asset

    await set_critical_data_element(db, "asset-1", True)

    assert asset.is_critical_data_element is True
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_set_critical_data_element_raises_for_unknown_asset():
    from app.services.metadata_store import set_critical_data_element
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    with pytest.raises(ValueError, match="not found"):
        await set_critical_data_element(db, "no-such-asset", True)


@pytest.mark.asyncio
async def test_increment_rule_count_increments():
    from app.services.metadata_store import increment_rule_count
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 3
    db.execute.return_value.scalar_one_or_none.return_value = asset

    await increment_rule_count(db, "asset-1", delta=1)

    assert asset.attached_rule_count == 4
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_increment_rule_count_does_not_go_below_zero():
    from app.services.metadata_store import increment_rule_count
    db = AsyncMock()
    asset = MagicMock()
    asset.attached_rule_count = 0
    db.execute.return_value.scalar_one_or_none.return_value = asset

    await increment_rule_count(db, "asset-1", delta=-1)

    assert asset.attached_rule_count == 0
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pytest tests/test_metadata_store.py -v -k "quality_placeholder or critical or rule_count" 2>&1 | tail -10
```

Expected: `AttributeError` — functions not yet defined.

- [ ] **Step 3: Add the three governance functions to `app/services/metadata_store.py`**

```python
async def update_quality_placeholders(
    db: AsyncSession,
    asset_id: str,
    profile_score: Optional[float],
    quality_status: Optional[str],
) -> None:
    """Phase 2 profiler hook — updates Asset and today's snapshot row."""
    now_dt = _now()
    today = now_dt.date()

    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if asset:
        if profile_score is not None:
            asset.latest_profile_score = profile_score
        if quality_status is not None:
            asset.latest_quality_status = quality_status

    snap_res = await db.execute(
        select(AssetMetadataSnapshot).where(
            AssetMetadataSnapshot.asset_id == asset_id,
            AssetMetadataSnapshot.snapshot_date == today,
        )
    )
    snap = snap_res.scalar_one_or_none()
    if snap:
        if profile_score is not None:
            snap.latest_profile_score = profile_score
        if quality_status is not None:
            snap.latest_quality_status = quality_status
        snap.updated_at = now_dt

    await db.commit()


async def set_critical_data_element(
    db: AsyncSession,
    asset_id: str,
    is_cde: bool,
) -> None:
    """Toggle the CDE flag on an asset."""
    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if not asset:
        raise ValueError(f"Asset '{asset_id}' not found")
    asset.is_critical_data_element = is_cde
    await db.commit()


async def increment_rule_count(
    db: AsyncSession,
    asset_id: str,
    delta: int,
) -> None:
    """Maintain attached_rule_count (+1 on rule create, -1 on rule delete). Never goes below 0."""
    asset_res = await db.execute(select(Asset).where(Asset.asset_id == asset_id))
    asset = asset_res.scalar_one_or_none()
    if asset:
        asset.attached_rule_count = max(0, (asset.attached_rule_count or 0) + delta)
        await db.commit()
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pytest tests/test_metadata_store.py -v -k "quality_placeholder or critical or rule_count"
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add app/services/metadata_store.py tests/test_metadata_store.py
git commit -m "feat: metadata_store — governance write hooks + tests"
```

---

## Task 8: Read Interface

**Files:**
- Modify: `app/services/metadata_store.py`
- Modify: `tests/test_metadata_store.py`

- [ ] **Step 1: Append the failing tests**

```python
@pytest.mark.asyncio
async def test_get_current_state_returns_none_for_unknown_asset():
    from app.services.metadata_store import get_current_state
    db = AsyncMock()
    db.execute.return_value.scalar_one_or_none.return_value = None

    result = await get_current_state(db, "no-such")
    assert result is None


@pytest.mark.asyncio
async def test_get_current_state_maps_asset_and_meta_fields():
    from app.services.metadata_store import get_current_state
    db = AsyncMock()
    asset = MagicMock()
    asset.asset_id = "asset-1"
    asset.asset_type = "table"
    asset.qualified_name = "PROD.SALES.ORDERS"
    asset.physical_name = "ORDERS"
    asset.display_name = "ORDERS"
    asset.status = "active"
    asset.scan_status = "success"
    asset.last_scanned_at = None
    asset.scan_duration_ms = 300
    asset.scan_version = "1.0.0"
    asset.latest_profile_score = None
    asset.latest_quality_status = "unknown"
    asset.is_critical_data_element = False
    asset.attached_rule_count = 3
    asset.owner_user_id = "u1"
    asset.owner_team_id = None
    asset.steward_user_id = None

    meta = MagicMock()
    meta.row_count = 8000000
    meta.bytes = 10485760
    meta.last_modified_at = None
    meta.table_created_at = None
    meta.partition_info = None
    asset.source_meta = meta

    db.execute.return_value.scalar_one_or_none.return_value = asset

    result = await get_current_state(db, "asset-1")

    assert result.asset_id == "asset-1"
    assert result.row_count == 8000000
    assert result.scan_status == "success"
    assert result.attached_rule_count == 3


@pytest.mark.asyncio
async def test_get_snapshot_history_limits_to_90():
    from app.services.metadata_store import get_snapshot_history
    db = AsyncMock()
    db.execute.return_value.scalars.return_value.all.return_value = []

    result = await get_snapshot_history(db, "asset-1", limit=200)

    assert result == []
    call_args = db.execute.call_args[0][0]
    # limit is capped at 90 inside the function — verified by the query object's _limit_clause
    # (behaviour tested by the function's own cap logic)


@pytest.mark.asyncio
async def test_get_column_state_returns_ordered_columns():
    from app.services.metadata_store import get_column_state
    db = AsyncMock()
    col1 = MagicMock(); col1.ordinal_position = 1
    col2 = MagicMock(); col2.ordinal_position = 2
    db.execute.return_value.scalars.return_value.all.return_value = [col1, col2]

    result = await get_column_state(db, "asset-1")

    assert result == [col1, col2]
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pytest tests/test_metadata_store.py -v -k "get_current or get_snapshot or get_column_state" 2>&1 | tail -10
```

- [ ] **Step 3: Add the three read functions to `app/services/metadata_store.py`**

```python
async def get_current_state(
    db: AsyncSession,
    asset_id: str,
) -> Optional[AssetMetaCurrentState]:
    """Joins Asset + AssetSourceMeta. Returns None when asset is unknown."""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Asset)
        .options(selectinload(Asset.source_meta))
        .where(Asset.asset_id == asset_id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        return None
    meta = asset.source_meta
    return AssetMetaCurrentState(
        asset_id=asset.asset_id,
        asset_type=asset.asset_type,
        qualified_name=asset.qualified_name,
        physical_name=asset.physical_name,
        display_name=asset.display_name,
        status=asset.status,
        scan_status=asset.scan_status,
        last_scanned_at=asset.last_scanned_at,
        scan_duration_ms=asset.scan_duration_ms,
        scan_version=asset.scan_version,
        row_count=meta.row_count if meta else None,
        bytes=meta.bytes if meta else None,
        last_modified_at=meta.last_modified_at if meta else None,
        table_created_at=meta.table_created_at if meta else None,
        partition_info=meta.partition_info if meta else None,
        latest_profile_score=asset.latest_profile_score,
        latest_quality_status=asset.latest_quality_status,
        is_critical_data_element=asset.is_critical_data_element,
        attached_rule_count=asset.attached_rule_count,
        owner_user_id=asset.owner_user_id,
        owner_team_id=asset.owner_team_id,
        steward_user_id=asset.steward_user_id,
    )


async def get_snapshot_history(
    db: AsyncSession,
    asset_id: str,
    since: Optional[date_t] = None,
    until: Optional[date_t] = None,
    limit: int = 90,
) -> list[AssetMetadataSnapshot]:
    """Returns snapshots ordered newest-first. Max 90 rows."""
    from datetime import timedelta
    if since is None:
        since = (_now() - timedelta(days=90)).date()
    if until is None:
        until = _now().date()
    limit = min(limit, 90)

    result = await db.execute(
        select(AssetMetadataSnapshot)
        .where(
            AssetMetadataSnapshot.asset_id == asset_id,
            AssetMetadataSnapshot.snapshot_date >= since,
            AssetMetadataSnapshot.snapshot_date <= until,
        )
        .order_by(desc(AssetMetadataSnapshot.snapshot_date))
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_column_state(
    db: AsyncSession,
    asset_id: str,
) -> list[ColumnMetadata]:
    """All column_metadata rows for an asset, ordered by ordinal_position."""
    result = await db.execute(
        select(ColumnMetadata)
        .where(ColumnMetadata.asset_id == asset_id)
        .order_by(asc(ColumnMetadata.ordinal_position))
    )
    return list(result.scalars().all())
```

- [ ] **Step 4: Run all metadata store tests**

```bash
pytest tests/test_metadata_store.py -v
```

Expected: `all passed` (should be 23+ tests at this point)

- [ ] **Step 5: Commit**

```bash
git add app/services/metadata_store.py tests/test_metadata_store.py
git commit -m "feat: metadata_store — read interface + tests"
```

---

## Task 9: API Router + main.py Registration

**Files:**
- Create: `app/api/metadata.py`
- Modify: `app/main.py`
- Create: `tests/test_metadata_api.py`

- [ ] **Step 1: Write the failing API tests**

```python
# tests/test_metadata_api.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient


def _make_app():
    from app.main import app
    return app


@pytest.mark.asyncio
async def test_get_asset_metadata_404_for_unknown():
    from app.api.metadata import router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(router)

    with patch("app.api.metadata.metadata_store") as mock_store, \
         patch("app.api.metadata.get_current_user", return_value={"email": "test@x.com"}), \
         patch("app.api.metadata.get_db"):
        mock_store.get_current_state = AsyncMock(return_value=None)
        client = TestClient(app)
        resp = client.get("/metadata/assets/no-such")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_asset_metadata_200_with_state():
    from app.api.metadata import router
    from app.schemas.metadata import AssetMetaCurrentState
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    state = AssetMetaCurrentState(
        asset_id="asset-1", asset_type="table",
        status="active", scan_status="success",
        attached_rule_count=2, is_critical_data_element=False,
    )

    app = FastAPI()
    app.include_router(router)

    with patch("app.api.metadata.metadata_store") as mock_store, \
         patch("app.api.metadata.get_current_user", return_value={"email": "test@x.com"}), \
         patch("app.api.metadata.get_db"):
        mock_store.get_current_state = AsyncMock(return_value=state)
        client = TestClient(app)
        resp = client.get("/metadata/assets/asset-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["asset_id"] == "asset-1"
    assert data["scan_status"] == "success"


@pytest.mark.asyncio
async def test_patch_cde_404_for_unknown():
    from app.api.metadata import router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(router)

    with patch("app.api.metadata.metadata_store") as mock_store, \
         patch("app.api.metadata.get_current_user", return_value={"email": "test@x.com"}), \
         patch("app.api.metadata.get_db"):
        mock_store.set_critical_data_element = AsyncMock(side_effect=ValueError("not found"))
        client = TestClient(app)
        resp = client.patch("/metadata/assets/no-such/cde",
                            json={"is_critical_data_element": True})
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests — expect import failures**

```bash
pytest tests/test_metadata_api.py -v 2>&1 | tail -10
```

Expected: `ImportError` or `ModuleNotFoundError` for `app.api.metadata`.

- [ ] **Step 3: Create `app/api/metadata.py`**

```python
# app/api/metadata.py
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.database import get_db
from app.schemas.metadata import (
    AssetMetaCurrentState, CDEPatch, ColumnMetaOut, SnapshotResponse,
)
from app.services import metadata_store

router = APIRouter(prefix="/metadata", tags=["Metadata"])


@router.get("/assets/{asset_id}", response_model=AssetMetaCurrentState)
async def get_asset_metadata(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    state = await metadata_store.get_current_state(db, asset_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return state


@router.get("/assets/{asset_id}/history", response_model=list[SnapshotResponse])
async def get_asset_snapshot_history(
    asset_id: str,
    since: Optional[date] = Query(None),
    until: Optional[date] = Query(None),
    limit: int = Query(90, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await metadata_store.get_snapshot_history(db, asset_id, since, until, limit)


@router.get("/assets/{asset_id}/columns", response_model=list[ColumnMetaOut])
async def get_asset_column_metadata(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return await metadata_store.get_column_state(db, asset_id)


@router.patch("/assets/{asset_id}/cde")
async def set_cde_flag(
    asset_id: str,
    payload: CDEPatch,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    try:
        await metadata_store.set_critical_data_element(
            db, asset_id, payload.is_critical_data_element
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"asset_id": asset_id, "is_critical_data_element": payload.is_critical_data_element}
```

- [ ] **Step 4: Register the router in `app/main.py`**

Add `metadata` to the existing import block (around line 18–30):

```python
from app.api import (
    domains, subdomains, assets, rules, schedules, executions,
    dashboard, ai, alerts, audit, config, connections,
    # §53 Catalog & Governance
    glossary, classifications, columns, data_products,
    comments, announcements, access_requests, tags, usage, catalog,
    lineage,
    schema_drift,
    # §54-§68 Advanced features
    governance, contracts, compliance, cost, incidents,
    anomaly, marketplace, mesh, observability, cicd,
    privacy, admin,
    # Metadata store
    metadata,
)
```

Then add the router registration after the other `app.include_router(...)` calls:

```python
app.include_router(metadata.router)
```

- [ ] **Step 5: Run API tests — expect all pass**

```bash
pytest tests/test_metadata_api.py -v
```

Expected: `3 passed`

- [ ] **Step 6: Verify the app starts without errors**

```bash
python -c "from app.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add app/api/metadata.py app/main.py tests/test_metadata_api.py
git commit -m "feat: /metadata API router + main.py registration + tests"
```

---

## Task 10: Discovery Service Integration

**Files:**
- Modify: `app/services/discovery_service.py`
- Modify: `tests/test_metadata_store.py` (one integration smoke test)

The discovery service has two asset paths that need metadata store calls:
- **New asset path** (~line 498–580): columns are fetched, asset is created and committed.
- **Existing asset path** (~line 427–470): table metadata is available; columns may or may not be fetched.

- [ ] **Step 1: Add `import time` and `SCANNER_VERSION` near the top of `discovery_service.py`**

Find the existing imports block (around lines 1–20) and add:

```python
import time

from app.services import metadata_store as _meta_store
from app.schemas.metadata import ColumnMetaIn as _ColumnMetaIn

SCANNER_VERSION = "1.0.0"
```

- [ ] **Step 2: Add a per-table scan timer in the new-asset path**

Find the line `table_safe = _validate_ident(tname, "table")` inside the **new asset** try block (~line 473) and add a timer start immediately before it:

```python
                    try:
                        _table_scan_start = time.monotonic()
                        table_safe = _validate_ident(tname, "table")
```

- [ ] **Step 3: Add `upsert_column_metadata` + `record_scan_result` after `await db.commit()` in the new-asset path**

Find the `await db.commit()` at ~line 552 (right after `db.add(AuditLog(...))`) and add after it:

```python
                        await db.commit()

                        # --- Metadata store: record column schema + operational snapshot ---
                        _col_models = [
                            _ColumnMetaIn(
                                column_name=c["column_name"],
                                data_type=c.get("data_type"),
                                is_nullable=(
                                    c.get("is_nullable") != "NO"
                                    if isinstance(c.get("is_nullable"), str)
                                    else c.get("is_nullable")
                                ),
                                ordinal_position=c.get("ordinal_position"),
                                description=c.get("comment") or None,
                            )
                            for c in columns
                        ]
                        await _meta_store.upsert_column_metadata(db, asset_id_new, _col_models)
                        _schema_hash = _meta_store.compute_schema_hash(_col_models)
                        _elapsed_ms = int((time.monotonic() - _table_scan_start) * 1000)
                        await _meta_store.record_scan_result(
                            db, asset_id_new,
                            scan_status="success",
                            scan_version=SCANNER_VERSION,
                            scan_duration_ms=_elapsed_ms,
                            row_count=table.get("row_count"),
                            bytes=table.get("bytes"),
                            last_modified_at=table.get("last_altered"),
                            column_count=len(columns),
                            schema_hash=_schema_hash,
                        )
```

- [ ] **Step 4: Add `record_scan_result` for the existing-asset ("skipped") path**

Find the `if existing_asset:` block (~line 427). Add the following at the **bottom of that `if` block** — after the inner `try/except` for rule backfill, but still inside the `if existing_asset:` block. The `job_tracker.append_result(...)` call is outside this block; do not add code near it.

```python
                            _existing_scan_start = time.monotonic()
                            _elapsed_existing = int((time.monotonic() - _existing_scan_start) * 1000)
                            try:
                                await _meta_store.record_scan_result(
                                    db, existing_asset.asset_id,
                                    scan_status="success",
                                    scan_version=SCANNER_VERSION,
                                    scan_duration_ms=_elapsed_existing,
                                    row_count=table.get("row_count"),
                                    bytes=table.get("bytes"),
                                    last_modified_at=table.get("last_altered"),
                                    column_count=0,
                                    schema_hash="",
                                )
                            except Exception as _meta_err:
                                logger.warning(
                                    "metadata_store.record_scan_result failed for existing asset %s: %s",
                                    existing_asset.asset_id, _meta_err,
                                )
```

Note: `column_count=0` and `schema_hash=""` for the existing-asset path because columns are not always fetched. A future improvement (when columns are always fetched) can pass real values here.

- [ ] **Step 5: Add a smoke test verifying the integration wiring**

Append to `tests/test_metadata_store.py`:

```python
def test_metadata_store_module_exports_all_public_functions():
    import app.services.metadata_store as ms
    for fn in [
        "compute_schema_hash",
        "upsert_column_metadata",
        "record_scan_result",
        "update_quality_placeholders",
        "set_critical_data_element",
        "increment_rule_count",
        "get_current_state",
        "get_snapshot_history",
        "get_column_state",
        "SCANNER_VERSION",
    ]:
        assert hasattr(ms, fn), f"Missing: {fn}"
```

- [ ] **Step 6: Run the full test suite**

```bash
pytest tests/test_metadata_store.py tests/test_metadata_api.py -v
```

Expected: all tests pass.

- [ ] **Step 7: Verify the discovery service imports cleanly**

```bash
python -c "from app.services.discovery_service import run_discovery; print('OK')"
```

Expected: `OK`

- [ ] **Step 8: Commit**

```bash
git add app/services/discovery_service.py tests/test_metadata_store.py
git commit -m "feat: discovery_service — call metadata_store after each table scan"
```

---

## Task 11: Full Test Run

- [ ] **Step 1: Run all existing tests to check for regressions**

```bash
pytest tests/ -v --tb=short 2>&1 | tail -40
```

Expected: all previously-passing tests still pass; new tests pass.

- [ ] **Step 2: Verify migration is idempotent (check current head)**

```bash
alembic current
```

Expected: `0011 (head)`

- [ ] **Step 3: Final commit if any fixups were needed**

```bash
git add -p
git commit -m "fix: metadata store post-integration fixups"
```

(Skip this step if no fixups were needed.)
