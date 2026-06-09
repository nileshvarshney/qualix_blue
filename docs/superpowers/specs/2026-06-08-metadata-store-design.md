# Metadata Store — Design Spec

**Date:** 2026-06-08
**Status:** Approved
**Migration:** 0011
**Scope:** Normalized metadata model and persistence layer for source, schema, table, and column metadata — including operational metadata, quality placeholders, and a daily-rollup snapshot table for historical comparisons.

---

## Background

The platform already has the core asset hierarchy (`assets` table), provider metadata (`asset_source_meta`), column metadata (`column_metadata`), and schema drift tracking (`schema_baselines` + `schema_drift_events`). What is missing:

- **Precision / scale / default value / partition key** on `column_metadata`
- **Partition info and source-reported timestamps** on `asset_source_meta`
- **Operational metadata** (scan status, last scanned, duration, version) — currently only in the in-memory job tracker, never persisted on the asset itself
- **Quality placeholders** (profile score, quality status, CDE flag, rule count) — Phase 2 profiler needs pre-existing columns to write into
- **Snapshot history** — no table tracks row_count, quality score, or scan outcome over time; needed for historical comparisons

---

## Goals

- Enrich `assets`, `asset_source_meta`, and `column_metadata` with the missing fields from the spec
- Add one new table (`asset_metadata_snapshots`) as a daily-rollup historical record per asset
- Wrap all reads and writes in a clean `metadata_store` service that discovery and the future profiler call
- Expose current-state and history via a dedicated `/metadata` API router
- Leave clear, non-implemented extension points for Phase 2 (profiling, rule engine, retention)

---

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Snapshot granularity | Daily rollup — one row per asset per calendar day, last scan wins | Predictable storage, simple queries, easy to extend |
| Column schema history | Use existing `schema_baselines` + `schema_drift_events` | YAGNI — drift system already handles this; adding new fields to current-state `column_metadata` is sufficient |
| Placement of operational + quality fields | Directly on `assets` table | Fewer JOINs; these fields appear in every list/search view |

---

## Database — Migration 0011

### 1. Extend `assets`

```sql
ALTER TABLE assets ADD COLUMN last_scanned_at         DATETIME;
ALTER TABLE assets ADD COLUMN scan_status              VARCHAR(20);  -- never|pending|running|success|failed|skipped
ALTER TABLE assets ADD COLUMN scan_duration_ms         INTEGER;
ALTER TABLE assets ADD COLUMN scan_version             VARCHAR(50);
ALTER TABLE assets ADD COLUMN latest_profile_score     FLOAT;
ALTER TABLE assets ADD COLUMN latest_quality_status    VARCHAR(20);  -- unknown|good|warning|critical
ALTER TABLE assets ADD COLUMN is_critical_data_element BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE assets ADD COLUMN attached_rule_count      INTEGER NOT NULL DEFAULT 0;
```

- `scan_status` is NULL until the first scan (interpreted as `never` by application code)
- `latest_profile_score` and `latest_quality_status` are NULL until Phase 2 profiler runs
- `attached_rule_count` is a maintained counter updated by rule CRUD (+1 on create, -1 on delete). The migration backfills this column from the actual `dq_rules` count per asset so existing assets start with a correct value

### 2. Extend `asset_source_meta`

```sql
ALTER TABLE asset_source_meta ADD COLUMN partition_info   VARIANT;   -- {type, columns, count}
ALTER TABLE asset_source_meta ADD COLUMN last_modified_at DATETIME;  -- source-reported last modification
ALTER TABLE asset_source_meta ADD COLUMN table_created_at DATETIME;  -- source-reported creation time
```

`partition_info` shape: `{"type": "range|list|hash", "columns": ["col1"], "count": 24}`. Nullable — only populated for partitioned tables.

### 3. Extend `column_metadata`

```sql
ALTER TABLE column_metadata ADD COLUMN precision            INTEGER;
ALTER TABLE column_metadata ADD COLUMN scale                INTEGER;
ALTER TABLE column_metadata ADD COLUMN character_max_length INTEGER;
ALTER TABLE column_metadata ADD COLUMN default_value        TEXT;
ALTER TABLE column_metadata ADD COLUMN is_partition_key     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE column_metadata ADD COLUMN partition_key_index  INTEGER;  -- 1-based, for composite partition keys
```

### 4. New table: `asset_metadata_snapshots`

```sql
CREATE TABLE asset_metadata_snapshots (
    snapshot_id           VARCHAR(36)  PRIMARY KEY,
    asset_id              VARCHAR(36)  NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    snapshot_date         DATE         NOT NULL,
    scan_version          VARCHAR(50),
    scan_status           VARCHAR(20),
    scan_duration_ms      INTEGER,
    row_count             BIGINT,
    bytes                 BIGINT,
    last_modified_at      DATETIME,
    column_count          INTEGER,
    schema_hash           VARCHAR(64),   -- MD5 of sorted(column_name+data_type) pairs
    latest_profile_score  FLOAT,
    latest_quality_status VARCHAR(20),
    attached_rule_count   INTEGER,
    created_at            DATETIME NOT NULL,
    updated_at            DATETIME NOT NULL,
    UNIQUE (asset_id, snapshot_date)
);
CREATE INDEX ix_ams_asset_date ON asset_metadata_snapshots (asset_id, snapshot_date DESC);
```

**Daily rollup:** `INSERT ... ON CONFLICT (asset_id, snapshot_date) DO UPDATE` — the last scan of the day wins. A query for "last 30 days" returns at most 30 rows per asset.

---

## ORM Models (`app/db/models.py`)

### New model: `AssetMetadataSnapshot`

```python
class AssetMetadataSnapshot(Base):
    __tablename__ = "asset_metadata_snapshots"
    __table_args__ = (
        UniqueConstraint("asset_id", "snapshot_date", name="uq_ams_asset_date"),
    )

    snapshot_id:           Mapped[str]            = mapped_column(String(36), primary_key=True, default=gen_uuid)
    asset_id:              Mapped[str]            = mapped_column(String(36), ForeignKey("assets.asset_id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_date:         Mapped[date]           = mapped_column(Date, nullable=False)
    scan_version:          Mapped[Optional[str]]  = mapped_column(String(50), nullable=True)
    scan_status:           Mapped[Optional[str]]  = mapped_column(String(20), nullable=True)
    scan_duration_ms:      Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    row_count:             Mapped[Optional[int]]  = mapped_column(BigInteger, nullable=True)
    bytes:                 Mapped[Optional[int]]  = mapped_column(BigInteger, nullable=True)
    last_modified_at:      Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    column_count:          Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    schema_hash:           Mapped[Optional[str]]  = mapped_column(String(64), nullable=True)
    latest_profile_score:  Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latest_quality_status: Mapped[Optional[str]]  = mapped_column(String(20), nullable=True)
    attached_rule_count:   Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    created_at:            Mapped[datetime]       = mapped_column(DateTime, default=now)
    updated_at:            Mapped[datetime]       = mapped_column(DateTime, default=now, onupdate=now)
```

### Extensions to existing models

**`Asset`** — add 8 columns:
```python
last_scanned_at:           Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
scan_status:               Mapped[Optional[str]]      = mapped_column(String(20), nullable=True)
scan_duration_ms:          Mapped[Optional[int]]      = mapped_column(Integer, nullable=True)
scan_version:              Mapped[Optional[str]]      = mapped_column(String(50), nullable=True)
latest_profile_score:      Mapped[Optional[float]]    = mapped_column(Float, nullable=True)
latest_quality_status:     Mapped[Optional[str]]      = mapped_column(String(20), nullable=True)
is_critical_data_element:  Mapped[bool]               = mapped_column(Boolean, default=False)
attached_rule_count:       Mapped[int]                = mapped_column(Integer, default=0)
```

**`AssetSourceMeta`** — add 3 columns:
```python
partition_info:    Mapped[Optional[dict]]     = mapped_column(JSONVariant, nullable=True)
last_modified_at:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
table_created_at:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
```

**`ColumnMetadata`** — add 6 columns:
```python
precision:             Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
scale:                 Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
character_max_length:  Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
default_value:         Mapped[Optional[str]]  = mapped_column(Text, nullable=True)
is_partition_key:      Mapped[bool]           = mapped_column(Boolean, default=False)
partition_key_index:   Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
```

---

## Service Layer (`app/services/metadata_store.py`)

Single-responsibility module. All metadata reads and writes go through here.

### Write interface

```python
async def record_scan_result(
    db: AsyncSession,
    asset_id: str,
    scan_status: str,          # "success" | "failed" | "skipped"
    scan_version: str,
    scan_duration_ms: int,
    row_count: int | None,
    bytes: int | None,
    last_modified_at: datetime | None,
    column_count: int,
    schema_hash: str,
) -> None:
    """
    1. Updates Asset: last_scanned_at=now, scan_status, scan_duration_ms, scan_version
    2. Updates AssetSourceMeta: row_count, bytes, last_modified_at
    3. Upserts asset_metadata_snapshots for today (ON CONFLICT DO UPDATE)
    """

async def upsert_column_metadata(
    db: AsyncSession,
    asset_id: str,
    columns: list[ColumnMetaIn],
) -> None:
    """
    Creates or updates column_metadata rows.
    Columns in DB but absent from the incoming list are left untouched —
    removal is handled by schema drift detection, not here.
    """

async def update_quality_placeholders(
    db: AsyncSession,
    asset_id: str,
    profile_score: float | None,
    quality_status: str | None,
) -> None:
    """Phase 2 profiler hook. Updates Asset + today's snapshot row."""

async def set_critical_data_element(
    db: AsyncSession,
    asset_id: str,
    is_cde: bool,
) -> None:
    """Governance action — toggle CDE flag on an asset."""

async def increment_rule_count(
    db: AsyncSession,
    asset_id: str,
    delta: int,          # +1 on rule create, -1 on rule delete
) -> None:
    """Maintained counter — called by rule CRUD, not computed on the fly."""
```

### Read interface

```python
async def get_current_state(db: AsyncSession, asset_id: str) -> AssetMetaCurrentState:
    """Joins asset + source_meta + latest column count. Single source of truth for current metadata."""

async def get_snapshot_history(
    db: AsyncSession,
    asset_id: str,
    since: date | None = None,   # defaults to 90 days ago
    until: date | None = None,   # defaults to today
    limit: int = 90,
) -> list[AssetMetadataSnapshot]:
    """Ordered DESC by snapshot_date. Max 90 rows."""

async def get_column_state(db: AsyncSession, asset_id: str) -> list[ColumnMetaOut]:
    """All column_metadata rows for an asset, ordered by ordinal_position."""
```

### Schema hash utility

```python
def compute_schema_hash(columns: list[ColumnMetaIn]) -> str:
    pairs = sorted(
        (c.column_name.upper(), (c.data_type or "").upper())
        for c in columns
    )
    return hashlib.md5(json.dumps(pairs).encode()).hexdigest()
```

A hash change means a column was added, dropped, or its type changed. The discovery service uses this to decide whether to trigger schema drift detection.

### `ColumnMetaIn` (input model)

```python
class ColumnMetaIn(BaseModel):
    column_name: str
    data_type: str | None = None
    is_nullable: bool | None = None
    ordinal_position: int | None = None
    default_value: str | None = None
    character_max_length: int | None = None
    precision: int | None = None
    scale: int | None = None
    is_partition_key: bool = False
    partition_key_index: int | None = None
    description: str | None = None
    is_primary_key: bool = False
    is_foreign_key: bool = False
    references_table: str | None = None
```

### Discovery service integration

At the end of each table scan in `discovery_service.py`:

```python
await metadata_store.upsert_column_metadata(db, asset_id, columns)
schema_hash = metadata_store.compute_schema_hash(columns)
await metadata_store.record_scan_result(
    db, asset_id,
    scan_status="success",
    scan_version=SCANNER_VERSION,
    scan_duration_ms=elapsed_ms,
    row_count=table_row["row_count"],
    bytes=table_row["bytes"],
    last_modified_at=table_row.get("last_altered"),
    column_count=len(columns),
    schema_hash=schema_hash,
)
```

---

## API Layer (`app/api/metadata.py`)

New router, mounted at `/metadata` in `app/main.py`.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/metadata/assets/{asset_id}` | Current metadata state |
| `GET` | `/metadata/assets/{asset_id}/history` | Snapshot history (since, until, limit query params) |
| `GET` | `/metadata/assets/{asset_id}/columns` | Column metadata |
| `PATCH` | `/metadata/assets/{asset_id}/cde` | Set/unset CDE flag (admin/steward only) |

### Response shapes (abbreviated)

**Current state:**
```json
{
  "asset_id": "...",
  "asset_type": "table",
  "qualified_name": "PROD.SALES.ORDERS",
  "status": "active",
  "scan_status": "success",
  "last_scanned_at": "2026-06-08T02:00:00Z",
  "scan_duration_ms": 412,
  "scan_version": "1.0.0",
  "row_count": 8420000,
  "bytes": 104857600,
  "last_modified_at": "2026-06-07T23:41:00Z",
  "table_created_at": "2024-01-15T00:00:00Z",
  "partition_info": { "type": "range", "columns": ["order_date"], "count": 24 },
  "column_count": 18,
  "schema_hash": "d41d8cd9...",
  "latest_profile_score": null,
  "latest_quality_status": "unknown",
  "is_critical_data_element": false,
  "attached_rule_count": 3,
  "owner_user_id": "...",
  "owner_team_id": "...",
  "steward_user_id": "..."
}
```

**History row:**
```json
{
  "snapshot_date": "2026-06-08",
  "scan_status": "success",
  "row_count": 8420000,
  "bytes": 104857600,
  "column_count": 18,
  "schema_hash": "d41d8cd9...",
  "scan_duration_ms": 412,
  "latest_profile_score": null,
  "latest_quality_status": "unknown",
  "attached_rule_count": 3,
  "updated_at": "2026-06-08T02:00:00Z"
}
```

**Column row:**
```json
{
  "column_name": "order_id",
  "data_type": "NUMBER",
  "is_nullable": false,
  "ordinal_position": 1,
  "precision": 38,
  "scale": 0,
  "character_max_length": null,
  "default_value": null,
  "is_primary_key": true,
  "is_foreign_key": false,
  "references_table": null,
  "is_partition_key": false,
  "partition_key_index": null,
  "description": "Unique order identifier"
}
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `record_scan_result` for unknown `asset_id` | FK violation — caller catches, marks job failed |
| `upsert_column_metadata` — column already exists | UPDATE in place (upsert by `asset_id` + `column_name`) |
| Snapshot conflict on `(asset_id, snapshot_date)` | `ON CONFLICT DO UPDATE` — last scan of the day wins |
| `get_current_state` for unknown `asset_id` | 404 Not Found |
| Unknown `scan_status` / `latest_quality_status` value | Accepted as-is in DB; validated at service layer only |
| Malformed `partition_info` JSON | Validated by caller before write; stored as-is (VARIANT) |

No retries inside `metadata_store.py`. Retry logic lives in `discovery_service.py`.

---

## Extension Points (Phase 2)

These are seams, not implementations:

| Phase 2 concern | Hook |
|---|---|
| Profiler writes quality score | `update_quality_placeholders(asset_id, score, status)` |
| Rule engine updates rule count | `increment_rule_count(asset_id, delta)` |
| Snapshot retention / pruning | Nightly job deletes rows older than N days from `asset_metadata_snapshots` |
| Column-level quality tracking | Extend `ColumnMetaIn` with profiler output in Phase 2 |
| Cross-asset schema change queries | Query `asset_metadata_snapshots` WHERE `schema_hash` differs between adjacent rows |
| Catalog filter by CDE flag | `is_critical_data_element` on `assets` is indexed-ready |
| Data contract freshness checks | `last_modified_at` in snapshot gives staleness signal |

---

## Non-Goals (Phase 1)

- No column-level snapshot table (existing `schema_drift_events` handles column history)
- No snapshot pruning / retention enforcement
- No UI
- No cross-source lineage enrichment
- No full profiler implementation
- No rule engine integration beyond the `attached_rule_count` counter hook

---

## Files Changed

| File | Change |
|---|---|
| `migrations/versions/0011_metadata_store.py` | New migration (additive only — no drops) |
| `app/db/models.py` | New `AssetMetadataSnapshot`; extend `Asset`, `AssetSourceMeta`, `ColumnMetadata` |
| `app/services/metadata_store.py` | New service |
| `app/api/metadata.py` | New router |
| `app/main.py` | Register `/metadata` router |
| `app/services/discovery_service.py` | Call `upsert_column_metadata` + `record_scan_result` at end of table scan |
