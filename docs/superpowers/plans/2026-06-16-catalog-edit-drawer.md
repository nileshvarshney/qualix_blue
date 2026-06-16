# Catalog Edit Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an edit mode to the catalog page right drawer so users can update status, criticality, certification, domain, subdomain, owner, technical owner, and table description for any asset.

**Architecture:** Extract the existing read-only inline drawer from `catalog/page.tsx` into a new `AssetDetailDrawer.tsx` component that manages its own edit state. A header Edit button switches all governance fields to inputs; Save calls `PUT /api/asset-registry/{asset_id}` and merges the result back into page state without a reload.

**Tech Stack:** Next.js 15 App Router, React, TypeScript, FastAPI/Pydantic (backend), SQLAlchemy ORM

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/schemas/asset.py` | Modify | Add `description`, `domain_id`, `subdomain_id` to `AssetUpdate` |
| `frontend/src/app/api/subdomains/route.ts` | Create | Proxy `GET /subdomains?domain_id=` to backend |
| `frontend/src/components/asset-registry/AssetDetailDrawer.tsx` | Create | Full drawer — view mode + edit mode with save logic |
| `frontend/src/app/catalog/page.tsx` | Modify | Add `domain_id`/`subdomain_id` to `Asset` type; replace inline drawer with `<AssetDetailDrawer>`; add `handleUpdated` |

---

## Task 1: Extend `AssetUpdate` schema with description, domain_id, subdomain_id

**Files:**
- Modify: `app/schemas/asset.py`
- Test: `tests/test_asset_registry.py`

### Context

The `PUT /asset-registry/{asset_id}` handler iterates `payload.model_dump(exclude_none=True)` and calls `setattr(asset, field, value)` for every field. `AssetUpdate` currently has `table_description` but the Asset ORM model only has a read-only `@property table_description` that returns `self.description` — so sending `table_description` via PUT would fail. The real DB column is `description`. We add `description` to `AssetUpdate` and also add `domain_id`/`subdomain_id` so those FK fields become updatable.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_asset_registry.py`:

```python
from app.schemas.asset import AssetUpdate


def test_asset_update_accepts_description():
    u = AssetUpdate(description="A new description")
    assert u.description == "A new description"


def test_asset_update_accepts_domain_and_subdomain():
    u = AssetUpdate(domain_id="d-123", subdomain_id="s-456")
    assert u.domain_id == "d-123"
    assert u.subdomain_id == "s-456"


def test_asset_update_exclude_none_omits_unset():
    u = AssetUpdate(criticality="high")
    dumped = u.model_dump(exclude_none=True)
    assert "description" not in dumped
    assert "domain_id" not in dumped
    assert dumped == {"criticality": "high"}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
python -m pytest tests/test_asset_registry.py::test_asset_update_accepts_description tests/test_asset_registry.py::test_asset_update_accepts_domain_and_subdomain tests/test_asset_registry.py::test_asset_update_exclude_none_omits_unset -v
```

Expected: FAIL with `AttributeError` or similar (fields don't exist yet).

- [ ] **Step 3: Add fields to `AssetUpdate` in `app/schemas/asset.py`**

Open `app/schemas/asset.py`. In the `AssetUpdate` class (currently around line 88), add three new fields. Place them after the existing `table_description` line:

```python
class AssetUpdate(BaseModel):
    sf_schema_name: Optional[str] = None
    sf_table_name: Optional[str] = None
    table_type: Optional[str] = None
    table_description: Optional[str] = None
    description: Optional[str] = None          # ← add this
    view_definition: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    technical_owner_name: Optional[str] = None
    technical_owner_email: Optional[str] = None
    criticality: Optional[Criticality] = None
    certification_status: Optional[CertificationStatus] = None
    is_active: Optional[bool] = None
    asset_type: Optional[str] = None
    parent_asset_id: Optional[str] = None
    physical_name: Optional[str] = None
    display_name: Optional[str] = None
    qualified_name: Optional[str] = None
    path: Optional[str] = None
    status: Optional[str] = None
    owner_user_id: Optional[str] = None
    owner_team_id: Optional[str] = None
    steward_user_id: Optional[str] = None
    domain: Optional[str] = None
    sensitivity: Optional[str] = None
    domain_id: Optional[str] = None            # ← add this
    subdomain_id: Optional[str] = None         # ← add this
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python -m pytest tests/test_asset_registry.py::test_asset_update_accepts_description tests/test_asset_registry.py::test_asset_update_accepts_domain_and_subdomain tests/test_asset_registry.py::test_asset_update_exclude_none_omits_unset -v
```

Expected: all three PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
python -m pytest tests/ -x -q
```

Expected: all existing tests continue to pass.

- [ ] **Step 6: Commit**

```bash
git add app/schemas/asset.py tests/test_asset_registry.py
git commit -m "feat: add description, domain_id, subdomain_id to AssetUpdate schema"
```

---

## Task 2: Add `/api/subdomains` frontend proxy route

**Files:**
- Create: `frontend/src/app/api/subdomains/route.ts`

### Context

The backend already has `GET /subdomains?domain_id={id}` returning `[{subdomain_id, subdomain_name, ...}]`. The frontend has no proxy for it. The edit drawer calls this route when the user selects a domain to populate the subdomain dropdown.

- [ ] **Step 1: Create the proxy file**

Create `frontend/src/app/api/subdomains/route.ts` with this content:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const domainId = req.nextUrl.searchParams.get('domain_id') ?? ''
    const url = domainId
      ? `${BACKEND}/subdomains?domain_id=${encodeURIComponent(domainId)}`
      : `${BACKEND}/subdomains`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json([])
  }
}
```

- [ ] **Step 2: Verify the route is reachable (requires dev server running)**

With the dev server running (`npm run dev` inside `frontend/`), open a browser or run:

```bash
curl "http://localhost:3000/api/subdomains?domain_id=SOME_REAL_ID"
```

Expected: JSON array (empty `[]` is fine if domain has no subdomains, but no 404/500).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/api/subdomains/route.ts
git commit -m "feat: add /api/subdomains proxy route for domain cascade dropdown"
```

---

## Task 3: Create `AssetDetailDrawer` component (view mode)

**Files:**
- Create: `frontend/src/components/asset-registry/AssetDetailDrawer.tsx`
- Modify: `frontend/src/app/catalog/page.tsx`

### Context

The existing inline drawer in `page.tsx` (the `{popup && (...)}` block from line 257 to end) is moved into the new component unchanged, giving us a clean extraction before we add edit logic. `page.tsx` adds `handleUpdated` and replaces the inline JSX with `<AssetDetailDrawer>`. The `Asset` type gets `domain_id` and `subdomain_id` added. Badge helper functions are duplicated into the new component — they're private implementation details of display logic.

- [ ] **Step 1: Create `AssetDetailDrawer.tsx` with view mode only**

Create `frontend/src/components/asset-registry/AssetDetailDrawer.tsx`:

```typescript
'use client'
import { useState } from 'react'

export type Asset = {
  asset_id: string
  sf_table_name?: string
  sf_schema_name?: string
  sf_database_name?: string
  table_description?: string
  table_type?: string
  connection_name?: string
  criticality?: string
  owner_name?: string
  technical_owner_name?: string
  certification_status?: string
  certified_by?: string
  is_active?: boolean
  domain_name?: string
  subdomain_name?: string
  domain_id?: string
  subdomain_id?: string
  created_at?: string
}

interface Props {
  asset: Asset
  onClose: () => void
  onUpdated: (updated: Asset) => void
}

const critColor = (c?: string) =>
  c === 'high' ? 'var(--status-error-text)' : c === 'medium' ? 'var(--status-warn-text)' : 'var(--text-muted)'
const critBg = (c?: string) =>
  c === 'high' ? 'var(--status-error-bg)' : c === 'medium' ? 'var(--status-warn-bg)' : 'var(--surface-muted)'
const certColor = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-text)' : s === 'deprecated' ? 'var(--status-error-text)' : 'var(--text-muted)'
const certBg = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-bg)' : s === 'deprecated' ? 'var(--status-error-bg)' : 'var(--surface-muted)'

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ background: bg, color, padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
      {label}
    </span>
  )
}

const labelStyle = { fontSize: '8.5px', textTransform: 'uppercase' as const, letterSpacing: '.05em', color: 'var(--text-muted)' }

export default function AssetDetailDrawer({ asset, onClose }: Props) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px,52vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1, fontFamily: 'monospace' }}>{asset.sf_table_name ?? '—'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Location — always read-only */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
          {([['Connection', asset.connection_name], ['Database', asset.sf_database_name], ['Schema', asset.sf_schema_name]] as [string, string | undefined][]).map(([l, v], i) => (
            <div key={l} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div style={labelStyle}>{l}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: 'monospace' }}>{v || '—'}</div>
            </div>
          ))}
        </div>

        {/* Governance badges */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Status</div>
            <Badge label={asset.is_active !== false ? 'Active' : 'Inactive'} bg={asset.is_active !== false ? 'var(--status-ok-bg)' : 'var(--surface-muted)'} color={asset.is_active !== false ? 'var(--status-ok-text)' : 'var(--text-muted)'} />
          </div>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Criticality</div>
            <Badge label={asset.criticality ?? 'low'} bg={critBg(asset.criticality)} color={critColor(asset.criticality)} />
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Certification</div>
            <Badge label={asset.certification_status ?? 'uncertified'} bg={certBg(asset.certification_status)} color={certColor(asset.certification_status)} />
          </div>
        </div>

        {/* Domain / Subdomain */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Domain</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.domain_name ?? '—'}</div>
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Subdomain</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.subdomain_name ?? '—'}</div>
          </div>
        </div>

        {/* Owners */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Owner</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.owner_name ?? '—'}</div>
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Technical Owner</div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.technical_owner_name ?? '—'}</div>
          </div>
        </div>

        {/* Description */}
        <div style={{ margin: '6px 14px 0', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <div style={{ ...labelStyle, marginBottom: '4px' }}>Description</div>
          <div style={{ fontSize: '11.5px', color: asset.table_description ? 'var(--foreground)' : 'var(--text-muted)', lineHeight: 1.6 }}>
            {asset.table_description || '—'}
          </div>
        </div>

        <div style={{ height: '12px' }} />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Update `frontend/src/app/catalog/page.tsx`**

Replace the file so that:
1. The `Asset` type gains `domain_id?: string` and `subdomain_id?: string`
2. The inline badge/color helpers and `Badge` component are removed (now in the drawer)
3. The inline `{popup && (...)}` drawer block is removed
4. `AssetDetailDrawer` is imported and rendered
5. A `handleUpdated` function merges the updated asset into the `assets` array

The full updated `page.tsx`:

```typescript
'use client'
import { useState, useEffect, useMemo } from 'react'
import AssetDetailDrawer, { Asset } from '@/components/asset-registry/AssetDetailDrawer'

const critColor = (c?: string) =>
  c === 'high' ? 'var(--status-error-text)' : c === 'medium' ? 'var(--status-warn-text)' : 'var(--text-muted)'
const critBg = (c?: string) =>
  c === 'high' ? 'var(--status-error-bg)' : c === 'medium' ? 'var(--status-warn-bg)' : 'var(--surface-muted)'
const certColor = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-text)' : s === 'deprecated' ? 'var(--status-error-text)' : 'var(--text-muted)'
const certBg = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-bg)' : s === 'deprecated' ? 'var(--status-error-bg)' : 'var(--surface-muted)'

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ background: bg, color, padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
      {label}
    </span>
  )
}

function TableRow({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  const isActive = asset.is_active !== false
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr 110px 80px 70px 60px',
        gap: '0 8px',
        alignItems: 'center',
        padding: '4px 8px 4px 36px',
        borderLeft: `2px solid ${isActive ? 'var(--status-ok-text)' : 'var(--border)'}`,
        borderBottom: '1px solid var(--surface-muted)',
        background: hover ? 'var(--surface-muted)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.sf_table_name ?? '—'}
      </span>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {[asset.domain_name, asset.subdomain_name].filter(Boolean).join(' › ') || '—'}
      </span>
      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.owner_name ?? '—'}
      </span>
      <Badge label={asset.certification_status ?? 'uncertified'} bg={certBg(asset.certification_status)} color={certColor(asset.certification_status)} />
      <Badge label={asset.criticality ?? 'low'} bg={critBg(asset.criticality)} color={critColor(asset.criticality)} />
      <Badge label={isActive ? 'Active' : 'Inactive'} bg={isActive ? 'var(--status-ok-bg)' : 'var(--surface-muted)'} color={isActive ? 'var(--status-ok-text)' : 'var(--text-muted)'} />
    </div>
  )
}

export default function CatalogPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [popup, setPopup] = useState<Asset | null>(null)

  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(data => {
        const list: Asset[] = (Array.isArray(data) ? data : []).filter((a: Asset) => !!a.connection_name)
        setAssets(list)
        const keys = new Set<string>()
        for (const a of list) {
          if (!a.connection_name) continue
          const db = a.sf_database_name ?? '(no database)'
          keys.add(`conn:${a.connection_name}`)
          keys.add(`db:${a.connection_name}|${db}`)
        }
        setExpanded(keys)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggle(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleUpdated(updated: Asset) {
    setAssets(prev => prev.map(a => a.asset_id === updated.asset_id ? updated : a))
    setPopup(updated)
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return assets
    const q = search.toLowerCase()
    return assets.filter(a =>
      (a.sf_table_name ?? '').toLowerCase().includes(q) ||
      (a.sf_schema_name ?? '').toLowerCase().includes(q) ||
      (a.sf_database_name ?? '').toLowerCase().includes(q) ||
      (a.connection_name ?? '').toLowerCase().includes(q) ||
      (a.domain_name ?? '').toLowerCase().includes(q) ||
      (a.owner_name ?? '').toLowerCase().includes(q)
    )
  }, [assets, search])

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, Asset[]>>>()
    for (const a of filtered) {
      if (!a.connection_name) continue
      const db = a.sf_database_name ?? '(no database)'
      const schema = a.sf_schema_name ?? '(no schema)'
      if (!map.has(a.connection_name)) map.set(a.connection_name, new Map())
      const dbMap = map.get(a.connection_name)!
      if (!dbMap.has(db)) dbMap.set(db, new Map())
      const schemaMap = dbMap.get(db)!
      if (!schemaMap.has(schema)) schemaMap.set(schema, [])
      schemaMap.get(schema)!.push(a)
    }
    return map
  }, [filtered])

  const totalTables = filtered.length

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--foreground)' }}>Data Catalog</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
          {totalTables} tables
        </span>
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tables, schemas, domains, owners…"
          style={{ width: '260px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
        />
      </div>

      {/* column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 110px 80px 70px 60px', gap: '0 8px', padding: '0 8px 4px 36px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        {['Table', 'Domain › Subdomain', 'Owner', 'Certification', 'Criticality', 'Status'].map(h => (
          <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
        ))}
      </div>

      {/* grouped tree */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>
        )}
        {!loading && grouped.size === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            {assets.length === 0 ? 'No assets yet' : 'No assets match search'}
          </div>
        )}

        {!loading && Array.from(grouped.entries()).map(([conn, dbMap]) => {
          const connKey = `conn:${conn}`
          const connOpen = expanded.has(connKey)
          const connTotal = Array.from(dbMap.values()).reduce((sum, sm) => sum + Array.from(sm.values()).reduce((s, a) => s + a.length, 0), 0)

          return (
            <div key={conn}>
              <div
                onClick={() => toggle(connKey)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', cursor: 'pointer', background: 'var(--surface)', borderBottom: '1px solid var(--border)', userSelect: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
              >
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '10px' }}>{connOpen ? '▼' : '▶'}</span>
                <span style={{ fontSize: '13px' }}>🔗</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>{conn}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>{connTotal} tables</span>
              </div>

              {connOpen && Array.from(dbMap.entries()).map(([db, schemaMap]) => {
                const dbKey = `db:${conn}|${db}`
                const dbOpen = expanded.has(dbKey)
                const dbTotal = Array.from(schemaMap.values()).reduce((s, a) => s + a.length, 0)

                return (
                  <div key={db}>
                    <div
                      onClick={() => toggle(dbKey)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 8px 5px 22px', cursor: 'pointer', background: 'var(--background)', borderBottom: '1px solid var(--surface-muted)', userSelect: 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--background)')}
                    >
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '10px' }}>{dbOpen ? '▼' : '▶'}</span>
                      <span style={{ fontSize: '12px' }}>📦</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '11.5px', fontWeight: 700, color: 'var(--foreground)' }}>{db}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>{dbTotal} tables</span>
                    </div>

                    {dbOpen && Array.from(schemaMap.entries()).map(([schema, tables]) => {
                      const schemaKey = `schema:${conn}|${db}|${schema}`
                      const schemaOpen = expanded.has(schemaKey)

                      return (
                        <div key={schema}>
                          <div
                            onClick={() => toggle(schemaKey)}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px 4px 36px', cursor: 'pointer', background: 'var(--background)', borderBottom: '1px solid var(--surface-muted)', userSelect: 'none' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'var(--background)')}
                          >
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '10px' }}>{schemaOpen ? '▼' : '▶'}</span>
                            <span style={{ fontSize: '12px' }}>📁</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>{schema}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>{tables.length} tables</span>
                          </div>

                          {schemaOpen && tables.map(a => (
                            <TableRow key={a.asset_id} asset={a} onClick={() => setPopup(a)} />
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {popup && (
        <AssetDetailDrawer
          asset={popup}
          onClose={() => setPopup(null)}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify the drawer still opens correctly**

Start the dev server if not already running:

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npm run dev
```

Open `http://localhost:3000/catalog`. Click any table row — the right drawer should open showing the same read-only view as before. Close it. No regressions.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/asset-registry/AssetDetailDrawer.tsx frontend/src/app/catalog/page.tsx
git commit -m "feat: extract AssetDetailDrawer component from catalog page"
```

---

## Task 4: Add edit mode to `AssetDetailDrawer`

**Files:**
- Modify: `frontend/src/components/asset-registry/AssetDetailDrawer.tsx`

### Context

Now we add the full edit mode. The component gains: `editing` / `saving` / `error` state; an `EditForm` type; `openEdit()` that seeds the form from the current asset and lazily fetches domains; `handleDomainChange()` that fetches subdomains and resets the subdomain selection; `save()` that diffs the form against the original asset, sends only changed fields to `PUT /api/asset-registry/{asset_id}`, and calls `onUpdated` on success.

- [ ] **Step 1: Replace `AssetDetailDrawer.tsx` with the full edit-mode version**

Replace the entire content of `frontend/src/components/asset-registry/AssetDetailDrawer.tsx` with:

```typescript
'use client'
import { useState } from 'react'

export type Asset = {
  asset_id: string
  sf_table_name?: string
  sf_schema_name?: string
  sf_database_name?: string
  table_description?: string
  table_type?: string
  connection_name?: string
  criticality?: string
  owner_name?: string
  technical_owner_name?: string
  certification_status?: string
  certified_by?: string
  is_active?: boolean
  domain_name?: string
  subdomain_name?: string
  domain_id?: string
  subdomain_id?: string
  created_at?: string
}

type Domain = { domain_id: string; domain_name: string }
type Subdomain = { subdomain_id: string; subdomain_name: string }

type EditForm = {
  is_active: boolean
  criticality: string
  certification_status: string
  domain_id: string
  subdomain_id: string
  owner_name: string
  technical_owner_name: string
  description: string
}

interface Props {
  asset: Asset
  onClose: () => void
  onUpdated: (updated: Asset) => void
}

const critColor = (c?: string) =>
  c === 'high' ? 'var(--status-error-text)' : c === 'medium' ? 'var(--status-warn-text)' : 'var(--text-muted)'
const critBg = (c?: string) =>
  c === 'high' ? 'var(--status-error-bg)' : c === 'medium' ? 'var(--status-warn-bg)' : 'var(--surface-muted)'
const certColor = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-text)' : s === 'deprecated' ? 'var(--status-error-text)' : 'var(--text-muted)'
const certBg = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-bg)' : s === 'deprecated' ? 'var(--status-error-bg)' : 'var(--surface-muted)'

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ background: bg, color, padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
      {label}
    </span>
  )
}

const labelStyle = { fontSize: '8.5px', textTransform: 'uppercase' as const, letterSpacing: '.05em', color: 'var(--text-muted)' }
const inputStyle = { fontSize: '11px', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--background)', color: 'var(--foreground)', width: '100%', boxSizing: 'border-box' as const }

function initialForm(asset: Asset): EditForm {
  return {
    is_active: asset.is_active !== false,
    criticality: asset.criticality ?? 'low',
    certification_status: asset.certification_status ?? 'uncertified',
    domain_id: asset.domain_id ?? '',
    subdomain_id: asset.subdomain_id ?? '',
    owner_name: asset.owner_name ?? '',
    technical_owner_name: asset.technical_owner_name ?? '',
    description: asset.table_description ?? '',
  }
}

export default function AssetDetailDrawer({ asset, onClose, onUpdated }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(initialForm(asset))
  const [domains, setDomains] = useState<Domain[]>([])
  const [subdomains, setSubdomains] = useState<Subdomain[]>([])
  const [domainsLoaded, setDomainsLoaded] = useState(false)
  const [selectedDomainName, setSelectedDomainName] = useState(asset.domain_name ?? '')
  const [selectedSubdomainName, setSelectedSubdomainName] = useState(asset.subdomain_name ?? '')

  async function loadSubdomains(domainId: string) {
    if (!domainId) { setSubdomains([]); return }
    const res = await fetch(`/api/subdomains?domain_id=${encodeURIComponent(domainId)}`)
    if (res.ok) setSubdomains(await res.json())
  }

  async function openEdit() {
    const form = initialForm(asset)
    setEditForm(form)
    setSelectedDomainName(asset.domain_name ?? '')
    setSelectedSubdomainName(asset.subdomain_name ?? '')
    setError(null)
    setEditing(true)
    if (!domainsLoaded) {
      const res = await fetch('/api/domains-list')
      if (res.ok) {
        const data = await res.json()
        setDomains(data)
        setDomainsLoaded(true)
      }
    }
    if (asset.domain_id) await loadSubdomains(asset.domain_id)
  }

  function handleDomainChange(domainId: string) {
    const domain = domains.find(d => d.domain_id === domainId)
    setEditForm(f => ({ ...f, domain_id: domainId, subdomain_id: '' }))
    setSelectedDomainName(domain?.domain_name ?? '')
    setSelectedSubdomainName('')
    loadSubdomains(domainId)
  }

  function handleSubdomainChange(subdomainId: string) {
    const sub = subdomains.find(s => s.subdomain_id === subdomainId)
    setEditForm(f => ({ ...f, subdomain_id: subdomainId }))
    setSelectedSubdomainName(sub?.subdomain_name ?? '')
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const orig = initialForm(asset)
      const body: Record<string, unknown> = {}
      if (editForm.is_active !== orig.is_active) body.is_active = editForm.is_active
      if (editForm.criticality !== orig.criticality) body.criticality = editForm.criticality
      if (editForm.certification_status !== orig.certification_status) body.certification_status = editForm.certification_status
      if (editForm.domain_id !== orig.domain_id) body.domain_id = editForm.domain_id
      if (editForm.subdomain_id !== orig.subdomain_id) body.subdomain_id = editForm.subdomain_id
      if (editForm.owner_name !== orig.owner_name) body.owner_name = editForm.owner_name
      if (editForm.technical_owner_name !== orig.technical_owner_name) body.technical_owner_name = editForm.technical_owner_name
      if (editForm.description !== orig.description) body.description = editForm.description

      const res = await fetch(`/api/asset-registry/${asset.asset_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError((err as { detail?: string }).detail ?? 'Save failed')
        return
      }
      const updated: Asset = {
        ...asset,
        is_active: editForm.is_active,
        criticality: editForm.criticality,
        certification_status: editForm.certification_status,
        domain_id: editForm.domain_id,
        subdomain_id: editForm.subdomain_id,
        domain_name: selectedDomainName,
        subdomain_name: selectedSubdomainName,
        owner_name: editForm.owner_name,
        technical_owner_name: editForm.technical_owner_name,
        table_description: editForm.description,
      }
      setEditing(false)
      onUpdated(updated)
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setEditing(false)
    setError(null)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px,52vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1, fontFamily: 'monospace' }}>{asset.sf_table_name ?? '—'}</span>
          {!editing && (
            <button onClick={openEdit} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer' }}>
              Edit
            </button>
          )}
          {editing && <>
            <button onClick={cancel} disabled={saving} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>

        {/* Location — always read-only */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
          {([['Connection', asset.connection_name], ['Database', asset.sf_database_name], ['Schema', asset.sf_schema_name]] as [string, string | undefined][]).map(([l, v], i) => (
            <div key={l} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
              <div style={labelStyle}>{l}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: 'monospace' }}>{v || '—'}</div>
            </div>
          ))}
        </div>

        {/* Status / Criticality / Certification */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Status</div>
            {editing
              ? <select style={inputStyle} value={editForm.is_active ? 'active' : 'inactive'} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.value === 'active' }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              : <Badge label={asset.is_active !== false ? 'Active' : 'Inactive'} bg={asset.is_active !== false ? 'var(--status-ok-bg)' : 'var(--surface-muted)'} color={asset.is_active !== false ? 'var(--status-ok-text)' : 'var(--text-muted)'} />
            }
          </div>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Criticality</div>
            {editing
              ? <select style={inputStyle} value={editForm.criticality} onChange={e => setEditForm(f => ({ ...f, criticality: e.target.value }))}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              : <Badge label={asset.criticality ?? 'low'} bg={critBg(asset.criticality)} color={critColor(asset.criticality)} />
            }
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Certification</div>
            {editing
              ? <select style={inputStyle} value={editForm.certification_status} onChange={e => setEditForm(f => ({ ...f, certification_status: e.target.value }))}>
                  <option value="certified">Certified</option>
                  <option value="warning">Warning</option>
                  <option value="failed">Failed</option>
                  <option value="uncertified">Uncertified</option>
                </select>
              : <Badge label={asset.certification_status ?? 'uncertified'} bg={certBg(asset.certification_status)} color={certColor(asset.certification_status)} />
            }
          </div>
        </div>

        {/* Domain / Subdomain */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Domain</div>
            {editing
              ? <select style={inputStyle} value={editForm.domain_id} onChange={e => handleDomainChange(e.target.value)}>
                  <option value="">— Select —</option>
                  {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
                </select>
              : <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.domain_name ?? '—'}</div>
            }
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Subdomain</div>
            {editing
              ? <select style={inputStyle} value={editForm.subdomain_id} onChange={e => handleSubdomainChange(e.target.value)} disabled={!editForm.domain_id}>
                  <option value="">— Select —</option>
                  {subdomains.map(s => <option key={s.subdomain_id} value={s.subdomain_id}>{s.subdomain_name}</option>)}
                </select>
              : <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.subdomain_name ?? '—'}</div>
            }
          </div>
        </div>

        {/* Owners */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
          <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
            <div style={labelStyle}>Owner</div>
            {editing
              ? <input type="text" style={inputStyle} value={editForm.owner_name} onChange={e => setEditForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Owner name" />
              : <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.owner_name ?? '—'}</div>
            }
          </div>
          <div style={{ padding: '6px 8px' }}>
            <div style={labelStyle}>Technical Owner</div>
            {editing
              ? <input type="text" style={inputStyle} value={editForm.technical_owner_name} onChange={e => setEditForm(f => ({ ...f, technical_owner_name: e.target.value }))} placeholder="Technical owner name" />
              : <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{asset.technical_owner_name ?? '—'}</div>
            }
          </div>
        </div>

        {/* Description */}
        <div style={{ margin: '6px 14px 0', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <div style={{ ...labelStyle, marginBottom: '4px' }}>Description</div>
          {editing
            ? <textarea
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Add a table description…"
              />
            : <div style={{ fontSize: '11.5px', color: asset.table_description ? 'var(--foreground)' : 'var(--text-muted)', lineHeight: 1.6 }}>
                {asset.table_description || '—'}
              </div>
          }
        </div>

        {error && (
          <div style={{ margin: '6px 14px 0', padding: '6px 10px', borderRadius: '4px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '11px' }}>
            {error}
          </div>
        )}

        <div style={{ height: '12px' }} />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Test the edit flow manually**

With the dev server running, open `http://localhost:3000/catalog`.

**Check view mode is unchanged:** Click any table row. Drawer opens with read-only display. Connection, Database, Schema are visible. Close the drawer.

**Check edit mode opens:** Click a table row, then click **Edit** in the drawer header. All governance fields should switch to inputs. Connection, Database, Schema remain static text.

**Check domain cascade:** Change the Domain select. Subdomain select should reset to blank and repopulate with subdomains for the selected domain. Subdomain select should be disabled when no domain is selected.

**Check cancel:** Make changes, click **Cancel**. Drawer returns to view mode, original values are shown.

**Check save:** Make a change (e.g., change Criticality to `high`). Click **Save**. The drawer should briefly show "Saving…", then return to view mode. The table row in the background should now show the updated badge. Reopen the drawer and confirm the new value is shown.

**Check error handling:** If the backend is unavailable, clicking Save should show an inline error message below the Save button, staying in edit mode.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/asset-registry/AssetDetailDrawer.tsx
git commit -m "feat: add edit mode to AssetDetailDrawer with domain/subdomain cascade and save"
```

---

## Self-Review Checklist

- [x] Task 1 covers `description`, `domain_id`, `subdomain_id` in `AssetUpdate` — spec requirement satisfied
- [x] Task 2 creates the `/api/subdomains` proxy — spec requirement satisfied
- [x] Task 3 extracts the drawer component and wires `handleUpdated` into page state — spec requirement satisfied
- [x] Task 4 covers all 8 editable fields: status, criticality, certification, domain, subdomain, owner, technical owner, description — spec requirement satisfied
- [x] Connection, Database, Schema are read-only in both Task 3 and Task 4 — spec requirement satisfied
- [x] `EditForm.description` is sent as `description` (not `table_description`) to match the Asset ORM column name — correct
- [x] Domain/subdomain names are carried from dropdown labels into the merged `updated` object so view mode shows them correctly without a page reload — spec requirement satisfied
- [x] `Asset` type is exported from `AssetDetailDrawer.tsx` so `page.tsx` can import it cleanly (no duplicate type definition)
- [x] No placeholders or TBDs
