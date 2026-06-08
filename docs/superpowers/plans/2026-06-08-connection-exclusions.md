# Connection Exclusions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove default_database/default_schema from the Snowflake connection form and add a persistent tree-based exclusions panel that lets users select databases/schemas to always skip during data discovery.

**Architecture:** Two new `JSONVariant` (Snowflake VARIANT) columns on `snowflake_connections` store exclusion lists. The discovery service filters selections against these lists before running. A new `ConnectionExclusionsPanel` React component provides a live tree UI (same three-state checkbox pattern as `ImportDatasetsModal`) accessed via a button on each connection card.

**Tech Stack:** Python/FastAPI, SQLAlchemy with Snowflake VARIANT, Pydantic, Next.js 15 API routes, React/TypeScript

---

## File Map

| File | Action |
|------|--------|
| `app/db/models.py` | Add two `JSONVariant` columns to `SnowflakeConnection` |
| `app/db/database.py` | Add two `ALTER TABLE` statements in `create_tables()` |
| `app/api/connections.py` | Add fields to `ConnectionCreate`, `ConnectionUpdate`, `_mask()` |
| `app/services/discovery_service.py` | Add exclusion filtering in `run_discovery()` |
| `migrations/versions/0009_connection_exclusions.py` | Alembic migration (new file) |
| `tests/test_connections.py` | Add tests for new columns and _mask |
| `tests/test_discovery_exclusions.py` | New test file for discovery filtering |
| `frontend/src/lib/types.ts` | Add `excludedDatabases`/`excludedSchemas` to `Connection` |
| `frontend/src/app/api/connections/route.ts` | Map new fields in GET mapper |
| `frontend/src/app/api/connections/[connectionId]/route.ts` | New: GET + PUT proxy to backend |
| `frontend/src/app/api/connections/[connectionId]/databases/route.ts` | Add GET handler (stored-credential browse) |
| `frontend/src/app/api/connections/[connectionId]/schemas/route.ts` | Add GET handler (stored-credential browse) |
| `frontend/src/components/connections/ConnectionExclusionsPanel.tsx` | New: tree UI component |
| `frontend/src/components/connections/ConnectionsClient.tsx` | Remove fields from Snowflake typeFields; add exclusions button + badge |

---

## Task 1: Add columns to SnowflakeConnection model

**Files:**
- Modify: `app/db/models.py:422-458`
- Modify: `app/db/database.py:228-256`
- Test: `tests/test_connections.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_connections.py`:

```python
def test_snowflake_connection_has_exclusion_columns():
    """SnowflakeConnection must have excluded_databases and excluded_schemas columns."""
    cols = {c.key for c in SnowflakeConnection.__table__.columns}
    assert "excluded_databases" in cols
    assert "excluded_schemas" in cols
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pytest tests/test_connections.py::test_snowflake_connection_has_exclusion_columns -v
```

Expected: FAIL — `AssertionError: assert 'excluded_databases' in {...}`

- [ ] **Step 3: Add columns to the model**

In `app/db/models.py`, after line 435 (`default_schema` field), add:

```python
    excluded_databases: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
    excluded_schemas: Mapped[Optional[list]] = mapped_column(JSONVariant, nullable=True)
```

- [ ] **Step 4: Add ALTER TABLE statements to create_tables()**

In `app/db/database.py`, inside the `_run_ddl(conn, [...])` block at line 228, add two entries after the `is_primary_target` line:

```python
            "ALTER TABLE snowflake_connections ADD COLUMN excluded_databases VARIANT",
            "ALTER TABLE snowflake_connections ADD COLUMN excluded_schemas VARIANT",
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
pytest tests/test_connections.py::test_snowflake_connection_has_exclusion_columns -v
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/db/models.py app/db/database.py tests/test_connections.py
git commit -m "feat: add excluded_databases and excluded_schemas columns to SnowflakeConnection"
```

---

## Task 2: Update API schemas and _mask response

**Files:**
- Modify: `app/api/connections.py:38-120`
- Test: `tests/test_connections.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_connections.py`:

```python
def test_mask_includes_exclusion_fields():
    """_mask() must include excluded_databases and excluded_schemas."""
    conn = _make_conn(excluded_databases=["RAW"], excluded_schemas=[{"database": "PROD", "schema": "STAGING"}])
    result = _mask(conn)
    assert result["excluded_databases"] == ["RAW"]
    assert result["excluded_schemas"] == [{"database": "PROD", "schema": "STAGING"}]


def test_mask_exclusions_default_none():
    """_mask() must return None for exclusions when not set."""
    conn = _make_conn(excluded_databases=None, excluded_schemas=None)
    result = _mask(conn)
    assert result["excluded_databases"] is None
    assert result["excluded_schemas"] is None


def test_connection_update_accepts_exclusions():
    """ConnectionUpdate must accept excluded_databases and excluded_schemas."""
    from app.api.connections import ConnectionUpdate
    u = ConnectionUpdate(
        excluded_databases=["SANDBOX"],
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}],
    )
    assert u.excluded_databases == ["SANDBOX"]
    assert u.excluded_schemas == [{"database": "PROD", "schema": "STAGING"}]
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_connections.py::test_mask_includes_exclusion_fields tests/test_connections.py::test_mask_exclusions_default_none tests/test_connections.py::test_connection_update_accepts_exclusions -v
```

Expected: All FAIL

- [ ] **Step 3: Update ConnectionCreate and ConnectionUpdate in app/api/connections.py**

In `ConnectionCreate` (line 38), add after line 48 (`default_schema`):

```python
    excluded_databases: Optional[list] = None
    excluded_schemas: Optional[list] = None
```

In `ConnectionUpdate` (line 65), add after line 74 (`default_schema`):

```python
    excluded_databases: Optional[list] = None
    excluded_schemas: Optional[list] = None
```

- [ ] **Step 4: Update _mask() to include the new fields**

In `_mask()` (lines 90-120), add after the `"is_primary_target"` line (line 106):

```python
        "excluded_databases": conn.excluded_databases,
        "excluded_schemas": conn.excluded_schemas,
```

Also update the `_make_conn` helper in `tests/test_connections.py` to include defaults for the new fields:

```python
def _make_conn(**kwargs):
    """Build a mock SnowflakeConnection with defaults."""
    defaults = dict(
        connection_id="abc-123",
        connection_name="Test",
        account="myorg-myaccount",
        sf_user="dq_user",
        password="enc_pass",
        warehouse="DQ_WH",
        role="DQ_ROLE",
        default_database="MY_DB",
        default_schema="PUBLIC",
        description="desc",
        is_active=True,
        connection_type="named",
        is_primary_target=False,
        excluded_databases=None,
        excluded_schemas=None,
        created_at=__import__("datetime").datetime(2026, 1, 1),
        updated_at=__import__("datetime").datetime(2026, 1, 1),
    )
    defaults.update(kwargs)
    m = MagicMock()
    for k, v in defaults.items():
        setattr(m, k, v)
    return m
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pytest tests/test_connections.py -v
```

Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/connections.py tests/test_connections.py
git commit -m "feat: add exclusion fields to ConnectionUpdate schema and _mask response"
```

---

## Task 3: Discovery service exclusion filtering

**Files:**
- Modify: `app/services/discovery_service.py:246-275`
- Create: `tests/test_discovery_exclusions.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_discovery_exclusions.py`:

```python
"""Tests for discovery exclusion filtering logic."""
import pytest
from unittest.mock import MagicMock


def _build_exclusion_sets(conn):
    """Mirror the logic from run_discovery."""
    excluded_db_set = set(conn.excluded_databases or [])
    excluded_schema_set = {
        (e["database"], e["schema"])
        for e in (conn.excluded_schemas or [])
    }
    return excluded_db_set, excluded_schema_set


def _make_conn_with_exclusions(excluded_databases=None, excluded_schemas=None):
    m = MagicMock()
    m.excluded_databases = excluded_databases
    m.excluded_schemas = excluded_schemas
    return m


def _should_skip(sel, excluded_db_set, excluded_schema_set):
    """Mirror the skip logic from run_discovery."""
    if sel["database"] in excluded_db_set:
        return True, "database excluded by connection config"
    if (sel["database"], sel["schema"]) in excluded_schema_set:
        return True, "schema excluded by connection config"
    return False, None


def test_no_exclusions_skips_nothing():
    conn = _make_conn_with_exclusions()
    db_set, schema_set = _build_exclusion_sets(conn)
    skipped, _ = _should_skip({"database": "PROD", "schema": "PUBLIC"}, db_set, schema_set)
    assert not skipped


def test_excluded_database_skips_all_its_schemas():
    conn = _make_conn_with_exclusions(excluded_databases=["SANDBOX"])
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, reason = _should_skip({"database": "SANDBOX", "schema": "ANY_SCHEMA"}, db_set, schema_set)
    assert skipped
    assert reason == "database excluded by connection config"


def test_excluded_database_does_not_skip_other_databases():
    conn = _make_conn_with_exclusions(excluded_databases=["SANDBOX"])
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, _ = _should_skip({"database": "PROD", "schema": "PUBLIC"}, db_set, schema_set)
    assert not skipped


def test_excluded_schema_skips_only_that_schema():
    conn = _make_conn_with_exclusions(
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}]
    )
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, reason = _should_skip({"database": "PROD", "schema": "STAGING"}, db_set, schema_set)
    assert skipped
    assert reason == "schema excluded by connection config"


def test_excluded_schema_does_not_skip_other_schemas_in_same_db():
    conn = _make_conn_with_exclusions(
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}]
    )
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, _ = _should_skip({"database": "PROD", "schema": "PUBLIC"}, db_set, schema_set)
    assert not skipped


def test_excluded_schema_does_not_skip_same_schema_name_in_other_db():
    conn = _make_conn_with_exclusions(
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}]
    )
    db_set, schema_set = _build_exclusion_sets(conn)

    skipped, _ = _should_skip({"database": "DEV", "schema": "STAGING"}, db_set, schema_set)
    assert not skipped


def test_multiple_exclusions():
    conn = _make_conn_with_exclusions(
        excluded_databases=["SANDBOX", "TEST_DB"],
        excluded_schemas=[{"database": "PROD", "schema": "STAGING"}, {"database": "PROD", "schema": "DEV"}],
    )
    db_set, schema_set = _build_exclusion_sets(conn)

    assert _should_skip({"database": "SANDBOX", "schema": "ANYTHING"}, db_set, schema_set)[0]
    assert _should_skip({"database": "TEST_DB", "schema": "ANY"}, db_set, schema_set)[0]
    assert _should_skip({"database": "PROD", "schema": "STAGING"}, db_set, schema_set)[0]
    assert _should_skip({"database": "PROD", "schema": "DEV"}, db_set, schema_set)[0]
    assert not _should_skip({"database": "PROD", "schema": "PUBLIC"}, db_set, schema_set)[0]
```

- [ ] **Step 2: Run tests to confirm they pass (pure logic, no imports needed yet)**

```bash
pytest tests/test_discovery_exclusions.py -v
```

Expected: All PASS (these test the pure logic functions, not the service)

- [ ] **Step 3: Add exclusion filtering to run_discovery()**

In `app/services/discovery_service.py`, after line 246 (`conn = await _fetch_connection(...)`), add:

```python
            excluded_db_set = set(conn.excluded_databases or [])
            excluded_schema_set = {
                (e["database"], e["schema"])
                for e in (conn.excluded_schemas or [])
            }
```

Then in the selection loop (line 254), before line 258 (`try: db_safe = _validate_ident(...)`), add:

```python
                if database in excluded_db_set:
                    job_tracker.append_result(
                        job_id,
                        {
                            "database": database,
                            "schema": schema,
                            "table_name": "*",
                            "status": "excluded",
                            "reason": "database excluded by connection config",
                        },
                        success=True,
                    )
                    continue

                if (database, schema) in excluded_schema_set:
                    job_tracker.append_result(
                        job_id,
                        {
                            "database": database,
                            "schema": schema,
                            "table_name": "*",
                            "status": "excluded",
                            "reason": "schema excluded by connection config",
                        },
                        success=True,
                    )
                    continue
```

- [ ] **Step 4: Run all tests**

```bash
pytest tests/test_discovery_exclusions.py tests/test_connections.py -v
```

Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/discovery_service.py tests/test_discovery_exclusions.py
git commit -m "feat: filter excluded databases and schemas in run_discovery"
```

---

## Task 4: Alembic migration

**Files:**
- Create: `migrations/versions/0009_connection_exclusions.py`

- [ ] **Step 1: Create the migration file**

Create `migrations/versions/0009_connection_exclusions.py`:

```python
"""Add excluded_databases and excluded_schemas to snowflake_connections

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-08
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa
from snowflake.sqlalchemy import VARIANT

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('snowflake_connections', sa.Column('excluded_databases', VARIANT(), nullable=True))
    op.add_column('snowflake_connections', sa.Column('excluded_schemas', VARIANT(), nullable=True))


def downgrade() -> None:
    op.drop_column('snowflake_connections', 'excluded_schemas')
    op.drop_column('snowflake_connections', 'excluded_databases')
```

- [ ] **Step 2: Commit**

```bash
git add migrations/versions/0009_connection_exclusions.py
git commit -m "feat: Alembic migration 0009 — add exclusion columns to snowflake_connections"
```

---

## Task 5: Update frontend Connection type and GET route mapper

**Files:**
- Modify: `frontend/src/lib/types.ts:3-30`
- Modify: `frontend/src/app/api/connections/route.ts:15-32`

- [ ] **Step 1: Add exclusion fields to the Connection interface**

In `frontend/src/lib/types.ts`, add after `role?: string` (line 16):

```typescript
  excludedDatabases?: string[]
  excludedSchemas?: Array<{ database: string; schema: string }>
```

- [ ] **Step 2: Map new fields in the GET route**

In `frontend/src/app/api/connections/route.ts`, update the connections mapper (lines 15-30) to include the new fields:

```typescript
    const connections: Connection[] = items.map((c) => ({
      id: c.connection_id as string,
      name: c.connection_name as string,
      type: (c.database_type as Connection['type']) ?? 'snowflake',
      account: (c.account as string) ?? undefined,
      username: (c.sf_user as string) ?? undefined,
      warehouse: (c.warehouse as string) ?? undefined,
      role: (c.role as string) ?? undefined,
      host: (c.host as string) ?? undefined,
      port: (c.port as number) ?? undefined,
      excludedDatabases: (c.excluded_databases as string[]) ?? undefined,
      excludedSchemas: (c.excluded_schemas as Array<{ database: string; schema: string }>) ?? undefined,
      status: c.is_active ? 'active' : 'inactive',
      lastTested: (c.last_tested_at as string) ?? undefined,
      createdAt: c.created_at as string,
    }))
```

Note: the `database` and `schema` fields (mapped from `default_database`/`default_schema`) are intentionally removed from this mapper — they are no longer needed since we removed them from the Snowflake connection form.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/app/api/connections/route.ts
git commit -m "feat: add excludedDatabases/excludedSchemas to Connection type and GET mapper"
```

---

## Task 6: Remove database and schema from Snowflake connection form

**Files:**
- Modify: `frontend/src/components/connections/ConnectionsClient.tsx:158-166`

- [ ] **Step 1: Remove the two fields from Snowflake typeFields**

In `ConnectionsClient.tsx`, the `snowflake` entry in `typeFields` (lines 158-166) currently reads:

```typescript
  snowflake: [
    { key: 'account', label: 'Account Identifier', placeholder: 'abc12345.us-east-1', required: true, full: true, hint: 'Found in your Snowflake URL: <account>.snowflakecomputing.com' },
    { key: 'warehouse', label: 'Warehouse', placeholder: 'COMPUTE_WH', required: true },
    { key: 'role', label: 'Role', placeholder: 'SYSADMIN' },
    { key: 'database', label: 'Database', placeholder: 'MY_DATABASE', required: true },
    { key: 'schema', label: 'Schema', placeholder: 'PUBLIC' },
    { key: 'username', label: 'Username', placeholder: 'SNOWFLAKE_USER', required: true },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password', required: true },
  ],
```

Replace with (remove the `database` and `schema` entries):

```typescript
  snowflake: [
    { key: 'account', label: 'Account Identifier', placeholder: 'abc12345.us-east-1', required: true, full: true, hint: 'Found in your Snowflake URL: <account>.snowflakecomputing.com' },
    { key: 'warehouse', label: 'Warehouse', placeholder: 'COMPUTE_WH', required: true },
    { key: 'role', label: 'Role', placeholder: 'SYSADMIN' },
    { key: 'username', label: 'Username', placeholder: 'SNOWFLAKE_USER', required: true },
    { key: 'password', label: 'Password', placeholder: '••••••••', type: 'password', required: true },
  ],
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/connections/ConnectionsClient.tsx
git commit -m "feat: remove default_database and default_schema from Snowflake connection form"
```

---

## Task 7: Create Next.js proxy routes for connectionId-based operations

**Files:**
- Create: `frontend/src/app/api/connections/[connectionId]/route.ts`
- Modify: `frontend/src/app/api/connections/[connectionId]/databases/route.ts`
- Modify: `frontend/src/app/api/connections/[connectionId]/schemas/route.ts`

- [ ] **Step 1: Create [connectionId]/route.ts**

Create `frontend/src/app/api/connections/[connectionId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params
  try {
    const res = await fetch(`${BACKEND}/connections/${connectionId}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND}/connections/${connectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.ok ? 200 : res.status })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Add GET to the databases route**

In `frontend/src/app/api/connections/[connectionId]/databases/route.ts`, add the GET handler after the existing POST handler:

```typescript
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params
  try {
    const res = await fetch(`${BACKEND}/connections/${connectionId}/databases`, {
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ databases: [], error: (e as Error).message })
  }
}
```

- [ ] **Step 3: Add GET to the schemas route**

In `frontend/src/app/api/connections/[connectionId]/schemas/route.ts`, add the GET handler after the existing POST handler:

```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params
  const database = new URL(req.url).searchParams.get('database') ?? ''
  try {
    const res = await fetch(
      `${BACKEND}/connections/${connectionId}/schemas?database=${encodeURIComponent(database)}`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ schemas: [], error: (e as Error).message })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/api/connections/[connectionId]/route.ts \
        frontend/src/app/api/connections/[connectionId]/databases/route.ts \
        frontend/src/app/api/connections/[connectionId]/schemas/route.ts
git commit -m "feat: add GET/PUT proxy routes for connectionId-based operations"
```

---

## Task 8: Create ConnectionExclusionsPanel component

**Files:**
- Create: `frontend/src/components/connections/ConnectionExclusionsPanel.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/connections/ConnectionExclusionsPanel.tsx`:

```typescript
'use client'
import { useState, useEffect } from 'react'
import { Connection } from '@/lib/types'

type CheckState = 'none' | 'partial' | 'all'

interface SchemaNode {
  name: string
  checked: boolean
  loading?: boolean
}

interface DbNode {
  name: string
  checked: CheckState
  expanded: boolean
  schemas: SchemaNode[]
  schemasLoaded: boolean
  loading: boolean
}

interface Props {
  connection: Connection
  onClose: () => void
  onSaved: (updated: Connection) => void
}

export default function ConnectionExclusionsPanel({ connection, onClose, onSaved }: Props) {
  const [dbs, setDbs] = useState<DbNode[]>([])
  const [dbsLoading, setDbsLoading] = useState(false)
  const [dbsError, setDbsError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false) // true once initial DB list has loaded

  useEffect(() => {
    setDbsLoading(true)
    setDbsError(null)
    const excluded = new Set(connection.excludedDatabases ?? [])
    fetch(`/api/connections/${connection.id}/databases`)
      .then(r => r.json())
      .then(data => {
        const dbNames: string[] = data.databases ?? []
        setDbs(dbNames.map(name => ({
          name,
          checked: excluded.has(name) ? 'all' : 'none',
          expanded: false,
          schemas: [],
          schemasLoaded: false,
          loading: false,
        })))
        setLoaded(true)
      })
      .catch(() => setDbsError('Failed to load databases. Check connection credentials.'))
      .finally(() => setDbsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleDb(dbName: string) {
    setDbs(prev => prev.map(db => {
      if (db.name !== dbName) return db
      const next: CheckState = db.checked === 'all' ? 'none' : 'all'
      return {
        ...db,
        checked: next,
        schemas: db.schemas.map(s => ({ ...s, checked: next === 'all' })),
      }
    }))
  }

  async function expandDb(dbName: string) {
    const db = dbs.find(d => d.name === dbName)
    if (!db) return

    if (db.expanded) {
      setDbs(prev => prev.map(d => d.name === dbName ? { ...d, expanded: false } : d))
      return
    }

    if (db.schemasLoaded) {
      setDbs(prev => prev.map(d => d.name === dbName ? { ...d, expanded: true } : d))
      return
    }

    setDbs(prev => prev.map(d => d.name === dbName ? { ...d, expanded: true, loading: true } : d))
    try {
      const res = await fetch(`/api/connections/${connection.id}/schemas?database=${encodeURIComponent(dbName)}`)
      const data = await res.json()
      const schemaNames: string[] = data.schemas ?? []
      const excludedSchemas = new Set(
        (connection.excludedSchemas ?? [])
          .filter(e => e.database === dbName)
          .map(e => e.schema)
      )
      setDbs(prev => prev.map(d => {
        if (d.name !== dbName) return d
        const schemas: SchemaNode[] = schemaNames.map(name => ({
          name,
          checked: d.checked === 'all' || excludedSchemas.has(name),
        }))
        const allChecked = schemas.every(s => s.checked)
        const anyChecked = schemas.some(s => s.checked)
        return {
          ...d,
          loading: false,
          schemasLoaded: true,
          schemas,
          checked: allChecked ? 'all' : anyChecked ? 'partial' : 'none',
        }
      }))
    } catch {
      setDbs(prev => prev.map(d => d.name === dbName ? { ...d, loading: false, expanded: false } : d))
    }
  }

  function toggleSchema(dbName: string, schemaName: string) {
    setDbs(prev => prev.map(db => {
      if (db.name !== dbName) return db
      const schemas = db.schemas.map(s =>
        s.name === schemaName ? { ...s, checked: !s.checked } : s
      )
      const allChecked = schemas.every(s => s.checked)
      const anyChecked = schemas.some(s => s.checked)
      return {
        ...db,
        schemas,
        checked: allChecked ? 'all' : anyChecked ? 'partial' : 'none',
      }
    }))
  }

  async function save() {
    setSaving(true)
    const excludedDatabases: string[] = []
    const excludedSchemas: Array<{ database: string; schema: string }> = []

    for (const db of dbs) {
      if (db.checked === 'all') {
        excludedDatabases.push(db.name)
      } else if (db.checked === 'partial') {
        for (const schema of db.schemas) {
          if (schema.checked) {
            excludedSchemas.push({ database: db.name, schema: schema.name })
          }
        }
      }
    }

    try {
      const res = await fetch(`/api/connections/${connection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excluded_databases: excludedDatabases.length > 0 ? excludedDatabases : null,
          excluded_schemas: excludedSchemas.length > 0 ? excludedSchemas : null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      onSaved({
        ...connection,
        excludedDatabases: excludedDatabases.length > 0 ? excludedDatabases : undefined,
        excludedSchemas: excludedSchemas.length > 0 ? excludedSchemas : undefined,
      })
      onClose()
    } catch {
      alert('Failed to save exclusions. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const totalExcluded = dbs.filter(d => d.checked !== 'none').reduce((sum, db) => {
    if (db.checked === 'all') return sum + 1
    return sum + db.schemas.filter(s => s.checked).length
  }, 0)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '520px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>Discovery Exclusions</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Select databases or schemas to skip during data discovery for <strong>{connection.name}</strong>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Tree */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {dbsLoading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '13px' }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Loading databases…
            </div>
          )}
          {dbsError && (
            <div style={{ padding: '16px', background: '#fee2e2', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>{dbsError}</div>
          )}
          {!dbsLoading && !dbsError && dbs.length === 0 && loaded && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' }}>No databases found</div>
          )}
          {dbs.map(db => (
            <div key={db.name} style={{ marginBottom: '2px' }}>
              {/* Database row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', background: db.checked !== 'none' ? '#fef3c7' : '#fafaf9', border: '1px solid ' + (db.checked !== 'none' ? '#fde68a' : '#ebe8df'), cursor: 'pointer' }}
                onClick={() => expandDb(db.name)}>
                <input
                  type="checkbox"
                  checked={db.checked === 'all'}
                  ref={(el) => { if (el) el.indeterminate = db.checked === 'partial' }}
                  onChange={e => { e.stopPropagation(); toggleDb(db.name) }}
                  onClick={e => e.stopPropagation()}
                  style={{ accentColor: '#f59e0b', flexShrink: 0 }}
                />
                <span style={{ fontSize: '14px' }}>🗄</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', flex: 1 }}>{db.name}</span>
                {db.loading && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', color: '#94a3b8', fontSize: '12px' }}>⟳</span>}
                {!db.loading && <span style={{ color: '#94a3b8', fontSize: '11px' }}>{db.expanded ? '▲' : '▼'}</span>}
              </div>

              {/* Schema rows */}
              {db.expanded && db.schemasLoaded && (
                <div style={{ paddingLeft: '28px', marginTop: '2px' }}>
                  {db.schemas.length === 0 && (
                    <div style={{ padding: '6px 10px', fontSize: '12px', color: '#94a3b8' }}>No schemas found</div>
                  )}
                  {db.schemas.map(schema => (
                    <div key={schema.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', borderRadius: '6px', background: schema.checked ? '#fef9c3' : '#fff', border: '1px solid ' + (schema.checked ? '#fde68a' : '#f1f5f9'), marginBottom: '2px' }}>
                      <input
                        type="checkbox"
                        checked={schema.checked}
                        onChange={() => toggleSchema(db.name, schema.name)}
                        style={{ accentColor: '#f59e0b', flexShrink: 0 }}
                      />
                      <span style={{ fontSize: '12px' }}>📋</span>
                      <span style={{ fontSize: '13px', color: '#475569' }}>{schema.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #ebe8df', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ flex: 1, fontSize: '12px', color: '#64748b' }}>
            {totalExcluded > 0
              ? <span style={{ color: '#d97706', fontWeight: 600 }}>{totalExcluded} item{totalExcluded !== 1 ? 's' : ''} will be excluded</span>
              : 'No exclusions set — all databases and schemas will be discovered'}
          </div>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: saving ? '#e2e8f0' : '#2563eb', color: saving ? '#94a3b8' : '#fff', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? '⏳ Saving…' : '✓ Save Exclusions'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/connections/ConnectionExclusionsPanel.tsx
git commit -m "feat: add ConnectionExclusionsPanel tree UI component"
```

---

## Task 9: Wire up exclusions panel in ConnectionsClient

**Files:**
- Modify: `frontend/src/components/connections/ConnectionsClient.tsx`

- [ ] **Step 1: Add the import at the top of ConnectionsClient.tsx**

After the existing imports (around line 5), add:

```typescript
import ConnectionExclusionsPanel from './ConnectionExclusionsPanel'
```

- [ ] **Step 2: Add exclusionsForConn state**

In the component body, after the `testResult` state (line 389), add:

```typescript
  const [exclusionsForConn, setExclusionsForConn] = useState<Connection | null>(null)
```

- [ ] **Step 3: Add exclusion count badge helper**

After the `getCategoryForType` function (line 365), add:

```typescript
function exclusionCount(conn: Connection): number {
  return (conn.excludedDatabases?.length ?? 0) + (conn.excludedSchemas?.length ?? 0)
}
```

- [ ] **Step 4: Add "Exclusions" button to connection cards**

In the connection card action buttons area (lines 620-640), after the Edit button:

```typescript
                <button onClick={() => setExclusionsForConn(conn)} style={{
                  padding: '7px 12px', borderRadius: '7px', border: '1px solid #fde68a',
                  background: '#fff', color: '#d97706', fontSize: '12px', cursor: 'pointer', fontWeight: 500
                }}>
                  🚫 Exclude{exclusionCount(conn) > 0 ? ` (${exclusionCount(conn)})` : ''}
                </button>
```

- [ ] **Step 5: Add exclusions panel rendering**

After the Test Result Modal closing tag (around line 663), add:

```typescript
      {/* Exclusions Panel */}
      {exclusionsForConn && (
        <ConnectionExclusionsPanel
          connection={exclusionsForConn}
          onClose={() => setExclusionsForConn(null)}
          onSaved={(updated) => {
            setConnections(prev => prev.map(c => c.id === updated.id ? updated : c))
            setExclusionsForConn(null)
          }}
        />
      )}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/connections/ConnectionsClient.tsx
git commit -m "feat: wire up ConnectionExclusionsPanel — button, badge, and state in ConnectionsClient"
```

---

## Task 10: End-to-end verification

- [ ] **Step 1: Run all backend tests**

```bash
pytest tests/test_connections.py tests/test_discovery_exclusions.py -v
```

Expected: All PASS

- [ ] **Step 2: Start the backend and verify the new columns appear**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -c "from app.db.database import create_tables; create_tables()"
```

Expected: `create_tables: N created, M already existed` (no errors)

- [ ] **Step 3: Start the frontend dev server**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend
npm run dev
```

Expected: Server starts at `http://localhost:3000`

- [ ] **Step 4: Verify Snowflake connection form**

Open `http://localhost:3000/connections`, click **+ Add Connection**, select Snowflake. Confirm the form does NOT show Database or Schema fields.

- [ ] **Step 5: Verify exclusions panel**

On an existing Snowflake connection card, click **🚫 Exclude**. Confirm:
1. Panel opens with a loading state
2. Databases appear as a tree
3. Clicking a database expands it to show schemas
4. Checking a database selects all its schemas
5. Checking individual schemas updates the database to partial state
6. Save Exclusions closes the panel and updates the badge count on the card

- [ ] **Step 6: Final commit tag**

```bash
git tag v-connection-exclusions
```
