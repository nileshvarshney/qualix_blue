# Lineage Impact Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Impact Analysis tab to the lineage detail panel that surfaces blast-radius severity, business consumers, and an affected-objects table when a node is selected.

**Architecture:** Backend adds two owner fields to existing node dicts (zero new queries — `_bulk_enrich` already fetches them). Frontend restructures the detail panel into three tabs (Lineage Chain / Impact Analysis / Columns) using already-loaded graph data; all impact computation is client-side.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy (async) — backend. Next.js 14 App Router, React 18, TypeScript, inline CSS (no CSS-in-JS libraries) — frontend. pytest + pytest-asyncio — tests.

## Global Constraints

- All frontend styling uses inline `style={{}}` props — no Tailwind classes, no external CSS imports, no CSS modules.
- Node ordering in `get_lineage_graph` response must not change (existing consumers rely on field names).
- `ownerName` and `techOwnerName` are additive fields — their absence never breaks existing callers.
- Tab default is always `'chains'`; it resets to `'chains'` whenever the selected node changes.
- No new API routes, no DB migrations, no new npm packages.
- Run backend tests with: `pytest tests/test_lineage.py -v` from `/Users/laxmansrigiri/git_repo/DataGuard`.
- Run frontend type-check with: `cd frontend && npx tsc --noEmit` from the repo root.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/api/lineage.py` | Modify | Add `ownerName`/`techOwnerName` to node dict in `get_lineage_graph` |
| `tests/test_lineage.py` | Modify | Assert new owner fields are present in graph node response |
| `frontend/src/app/lineage/page.tsx` | Modify | Interface update, state additions, tab bar, Impact Analysis tab content |

---

### Task 1: Backend — expose owner data in lineage graph nodes

**Files:**
- Modify: `app/api/lineage.py` (lines 322–343, the `nodes.append(...)` block inside `get_lineage_graph`)
- Test: `tests/test_lineage.py`

**Interfaces:**
- Produces: each node dict in `GET /lineage` now contains `"ownerName": str | None` and `"techOwnerName": str | None`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/test_lineage.py`:

```python
@pytest.mark.asyncio
async def test_lineage_graph_nodes_include_owner_fields(monkeypatch):
    """GET /lineage returns ownerName and techOwnerName on every node."""
    from app.main import app
    from app.db.database import get_db
    from app.core.security import get_current_user

    _mock_user = {"email": "admin@example.com", "role": "admin", "user_id": "system", "full_name": "System Admin"}

    async def _mock_current_user():
        return _mock_user

    # Build minimal ORM fakes
    class FakeMeta:
        sf_table_name = "ORDERS"
        sf_schema_name = "PUBLIC"
        sf_database_name = "PROD"
        sf_table_type = "TABLE"
        view_definition = None
        last_modified_at = None
        row_count = 100

    class FakeAsset:
        asset_id = "asset-1"
        asset_type = "table"
        physical_name = "ORDERS"
        display_name = None
        description = "Order facts"
        table_description = "Order facts"
        owner_name = "Alice"
        technical_owner_name = "Bob"
        is_active = True
        connection_id = "conn-1"
        source_meta = FakeMeta()

    class FakeConn:
        connection_id = "conn-1"
        connection_name = "Prod"
        default_database = "PROD"
        default_schema = "PUBLIC"
        warehouse = "WH"
        is_active = True
        is_primary_target = True

    from unittest.mock import AsyncMock, MagicMock
    from sqlalchemy.engine import Result

    async def mock_db():
        db = AsyncMock()

        def make_result(rows):
            r = MagicMock(spec=Result)
            r.scalars.return_value.all.return_value = rows
            r.scalar.return_value = None
            r.all.return_value = rows
            return r

        db.get = AsyncMock(side_effect=lambda model, pk: FakeConn() if pk == "conn-1" else None)

        call_count = 0

        async def execute_side_effect(stmt):
            nonlocal call_count
            call_count += 1
            # First call = asset query, rest = enrich queries
            if call_count == 1:
                return make_result([FakeAsset()])
            return make_result([])

        db.execute = AsyncMock(side_effect=execute_side_effect)
        db.commit = AsyncMock()
        yield db

    app.dependency_overrides[get_db] = mock_db
    app.dependency_overrides[get_current_user] = _mock_current_user

    # monkeypatch _resolve_connection_id to return our fake conn
    monkeypatch.setattr(
        "app.api.lineage._resolve_connection_id",
        AsyncMock(return_value="conn-1"),
    )
    # monkeypatch _ensure_view_definitions to no-op
    monkeypatch.setattr(
        "app.api.lineage._ensure_view_definitions",
        AsyncMock(return_value=None),
    )

    try:
        from httpx import AsyncClient, ASGITransport
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/lineage?connection_id=conn-1")
        assert response.status_code == 200
        data = response.json()
        assert len(data["nodes"]) > 0
        node = data["nodes"][0]
        assert "ownerName" in node, "ownerName field missing from lineage node"
        assert "techOwnerName" in node, "techOwnerName field missing from lineage node"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard
pytest tests/test_lineage.py::test_lineage_graph_nodes_include_owner_fields -v
```

Expected: FAIL — `AssertionError: ownerName field missing from lineage node`

- [ ] **Step 3: Add ownerName and techOwnerName to the node dict**

In `app/api/lineage.py`, find the `nodes.append({...})` block inside `get_lineage_graph` (around line 329). Add two lines at the end of that dict:

```python
        nodes.append({
            "id": a.asset_id,
            "label": enr["sf_table_name"] or a.physical_name,
            "sub": ".".join(p for p in (schema_name, database_name) if p),
            "type": _classify_node_type(table_type),
            "icon": "📄",
            "schema": schema_name,
            "database": database_name,
            "tableType": table_type,
            "rowCount": enr["row_count"],
            "columnCount": enr["column_count"],
            "lastAltered": meta.last_modified_at.isoformat() if meta and meta.last_modified_at else None,
            "comment": enr["table_description"],
            "ownerName": enr["owner_name"],
            "techOwnerName": enr["technical_owner_name"],
        })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_lineage.py::test_lineage_graph_nodes_include_owner_fields -v
```

Expected: PASS

- [ ] **Step 5: Run full lineage test suite**

```bash
pytest tests/test_lineage.py -v
```

Expected: all tests PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add app/api/lineage.py tests/test_lineage.py
git commit -m "feat(lineage): expose ownerName and techOwnerName in graph node response"
```

---

### Task 2: Frontend — interface, state, and impactStats

**Files:**
- Modify: `frontend/src/app/lineage/page.tsx`

**Interfaces:**
- Consumes: `LineageNode` (existing), `downstreamChain` / `upstreamChain` (computed in render body after useMemo hooks)
- Produces:
  - Updated `LineageNode` interface with `ownerName?: string | null` and `techOwnerName?: string | null`
  - `activeTab: 'chains' | 'impact' | 'columns'` state
  - `impactStats` object (regular render-body variable, not useMemo — depends on render-time vars)

- [ ] **Step 1: Update the LineageNode interface**

Find the `LineageNode` interface (line 5). Replace it with:

```typescript
interface LineageNode {
  id: string; label: string; sub: string
  type: 'source' | 'raw' | 'transform' | 'warehouse' | 'output'
  icon: string; schema: string; database: string; tableType: string
  rowCount: number | null; columnCount: number
  lastAltered: string | null; comment: string | null
  ownerName?: string | null; techOwnerName?: string | null
  x?: number; y?: number
}
```

- [ ] **Step 2: Add the activeTab state**

Find the block of `useState` declarations near the top of `LineagePage()` (around line 232). After the `nodeDraggedRef` line, add:

```typescript
  const [activeTab, setActiveTab] = useState<'chains' | 'impact' | 'columns'>('chains')
```

- [ ] **Step 3: Reset activeTab when selected node changes**

Find the existing `useEffect` that resets zoom/pan/nodePositions when `selected` changes (around line 289):

```typescript
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(1); setPan({ x: 0, y: 0 }); setNodePositions(new Map())
  }, [selected])
```

Replace it with:

```typescript
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(1); setPan({ x: 0, y: 0 }); setNodePositions(new Map()); setActiveTab('chains')
  }, [selected])
```

- [ ] **Step 4: Add impactStats computation in the render body**

Find the three lines (around line 555–559) where `selectedNode`, `upstreamChain`, and `downstreamChain` are computed:

```typescript
  const selectedNode = selected ? nodeMap.get(selected) : null
  const upstreamChain = selected ? buildChain(selected, data.edges, nodeMap, 'up') : []
  const downstreamChain = selected ? buildChain(selected, data.edges, nodeMap, 'down') : []
  const totalUpstream = upstreamChain.reduce((s, h) => s + h.nodes.length, 0)
  const totalDownstream = downstreamChain.reduce((s, h) => s + h.nodes.length, 0)
```

Immediately after `totalDownstream`, add:

```typescript
  const impactStats = selected && selectedNode ? (() => {
    const allDownstream = downstreamChain.flatMap(h => h.nodes)
    const byType: Record<string, LineageNode[]> = {}
    for (const n of allDownstream) {
      if (!byType[n.type]) byType[n.type] = []
      byType[n.type].push(n)
    }
    const severity: 'none' | 'low' | 'medium' | 'high' | 'critical' =
      allDownstream.length === 0 ? 'none'
      : allDownstream.length <= 3 ? 'low'
      : allDownstream.length <= 10 ? 'medium'
      : allDownstream.length <= 20 ? 'high'
      : 'critical'
    return {
      total: allDownstream.length,
      byType,
      severity,
      businessConsumers: allDownstream.filter(n => n.type === 'output'),
      hopCount: downstreamChain.length,
      allDownstream,
    }
  })() : null
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `ownerName`, `techOwnerName`, `activeTab`, or `impactStats`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/lineage/page.tsx
git commit -m "feat(lineage): add activeTab state and impactStats computation to lineage page"
```

---

### Task 3: Frontend — Tab bar and content switching

**Files:**
- Modify: `frontend/src/app/lineage/page.tsx`

**Interfaces:**
- Consumes: `activeTab` state, `setActiveTab`, `columnData` (for Columns badge count)
- Produces: Tab bar rendered in the detail panel; existing chain and column content gated by `activeTab`

- [ ] **Step 1: Add the tab bar to the detail panel**

Find the panel header close tag — the `</div>` that ends the "Panel Header" section (line ~1055, closes the `{/* Panel Header */}` div). Immediately after it, insert the tab bar:

```tsx
          {/* Tab Bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
            {([
              { key: 'chains', label: 'Lineage Chain' },
              { key: 'impact', label: 'Impact Analysis' },
              { key: 'columns', label: `Columns${columnData ? ` (${columnData.length})` : ''}` },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '10px 18px',
                  fontSize: '11.5px',
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  color: activeTab === tab.key ? 'var(--foreground)' : 'var(--text-muted)',
                  background: activeTab === tab.key ? 'var(--surface)' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {tab.key === 'impact' && impactStats && impactStats.total > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 16, height: 16, borderRadius: '50%',
                    background: { none: '#e2e8f0', low: '#dcfce7', medium: '#fef3c7', high: '#fee2e2', critical: '#ede9fe' }[impactStats.severity],
                    color: { none: '#64748b', low: '#16a34a', medium: '#d97706', high: '#dc2626', critical: '#7c3aed' }[impactStats.severity],
                    fontSize: '8px', fontWeight: 700, marginRight: 4,
                  }}>{impactStats.total}</span>
                )}
                {tab.label}
              </button>
            ))}
          </div>
```

- [ ] **Step 2: Gate the Upstream/Downstream chains grid**

Find the opening of the upstream/downstream grid (around line 1058):

```tsx
          {/* Upstream / Downstream chains */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderBottom: '1px solid var(--border)' }}>
```

Wrap the entire grid div (from this opening tag to its closing `</div>` around line 1123) plus the column lineage detail div (around lines 1125–1182) in:

```tsx
          {activeTab === 'chains' && (
            <>
              {/* existing Upstream/Downstream grid unchanged */}
              {/* existing Column-level lineage detail unchanged */}
            </>
          )}
```

- [ ] **Step 3: Gate the Column Table section**

Find the column table div (around line 1185):

```tsx
          {/* Column Table */}
          <div style={{ padding: '12px 24px' }}>
```

Wrap the entire column table section (from that opening div to its closing `</div>`) in:

```tsx
          {activeTab === 'columns' && (
            <div style={{ padding: '12px 24px' }}>
              {/* existing column table content unchanged */}
            </div>
          )}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/lineage/page.tsx
git commit -m "feat(lineage): add 3-tab layout (Lineage Chain / Impact Analysis / Columns) to detail panel"
```

---

### Task 4: Frontend — Impact Analysis tab content

**Files:**
- Modify: `frontend/src/app/lineage/page.tsx`

**Interfaces:**
- Consumes: `impactStats` (from Task 2), `selectedNode`, `downstreamChain`, `typeConfig`, `DbTypeIcon`, `tableTypeLabel`
- Produces: Impact Analysis tab rendered between the tab bar and footer when `activeTab === 'impact'`

- [ ] **Step 1: Define the severityConfig constant**

Near the top of the file, after the existing `typeConfig` constant (around line 33), add:

```typescript
const severityConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  none:     { label: 'No Impact',       color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  low:      { label: 'Low Impact',      color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  medium:   { label: 'Medium Impact',   color: '#d97706', bg: '#fef3c7', border: '#fcd34d' },
  high:     { label: 'High Impact',     color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  critical: { label: 'Critical Impact', color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
}
```

- [ ] **Step 2: Add the Impact Analysis tab content**

Inside the detail panel, after the tab bar (from Task 3) and before the footer bar, add this block (alongside the `{activeTab === 'chains' && ...}` and `{activeTab === 'columns' && ...}` guards from Task 3):

```tsx
          {/* Impact Analysis Tab */}
          {activeTab === 'impact' && impactStats && (
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* ── Blast Radius Summary ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '24px',
                padding: '20px 24px', borderRadius: '12px',
                background: severityConfig[impactStats.severity].bg,
                border: `1px solid ${severityConfig[impactStats.severity].border}`,
              }}>
                <div style={{ textAlign: 'center', minWidth: 64 }}>
                  <div style={{ fontSize: '48px', fontWeight: 800, lineHeight: 1, color: severityConfig[impactStats.severity].color }}>
                    {impactStats.total}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>affected</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{
                      background: severityConfig[impactStats.severity].color,
                      color: '#fff', padding: '2px 10px', borderRadius: '20px',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
                    }}>{severityConfig[impactStats.severity].label.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                    Changing <strong>{selectedNode?.label}</strong> would affect{' '}
                    <strong>{impactStats.total}</strong> downstream object{impactStats.total !== 1 ? 's' : ''}{' '}
                    across <strong>{impactStats.hopCount}</strong> hop{impactStats.hopCount !== 1 ? 's' : ''}.
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>⬇ {impactStats.hopCount} hop{impactStats.hopCount !== 1 ? 's' : ''} to leaf</span>
                    <span>⬆ {totalUpstream} upstream dependenc{totalUpstream !== 1 ? 'ies' : 'y'}</span>
                    <span>📊 {impactStats.businessConsumers.length} business consumer{impactStats.businessConsumers.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>

              {/* ── Type Breakdown ── */}
              {impactStats.total > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    Breakdown by Type
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.entries(impactStats.byType).map(([type, nodes]) => {
                      const cfg = typeConfig[type] ?? typeConfig.warehouse
                      return (
                        <div key={type} style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: cfg.bg, border: `1px solid ${cfg.border}`,
                          padding: '5px 12px', borderRadius: '20px',
                        }}>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: cfg.color }}>{nodes.length}</span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Business Consumers ── */}
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Business Consumers ({impactStats.businessConsumers.length} view{impactStats.businessConsumers.length !== 1 ? 's' : ''})
                </div>
                {impactStats.businessConsumers.length === 0 ? (
                  <div style={{
                    padding: '16px', textAlign: 'center', fontSize: '12px',
                    color: 'var(--text-muted)', background: 'var(--surface-muted)',
                    borderRadius: '8px', border: '1px dashed var(--border)',
                  }}>
                    No business consumers identified downstream
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {impactStats.businessConsumers.map(n => {
                      const hopNum = downstreamChain.findIndex(h => h.nodes.some(hn => hn.id === n.id)) + 1
                      return (
                        <div key={n.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '12px',
                          padding: '10px 14px', borderRadius: '8px',
                          background: 'var(--surface-muted)', border: '1px solid var(--border)',
                        }}>
                          <div style={{ marginTop: 2 }}><DbTypeIcon tableType={n.tableType} size={16} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--foreground)', fontFamily: 'monospace' }}>{n.label}</span>
                              <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{n.schema}</span>
                              {hopNum > 0 && (
                                <span style={{ marginLeft: 'auto', background: '#e2e8f0', color: '#475569', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 600, flexShrink: 0 }}>
                                  HOP {hopNum}
                                </span>
                              )}
                            </div>
                            {n.comment && (
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.comment}</div>
                            )}
                            {(n.ownerName || n.techOwnerName) && (
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {n.ownerName && <span>Owner: {n.ownerName}</span>}
                                {n.ownerName && n.techOwnerName && <span> · </span>}
                                {n.techOwnerName && <span>Tech: {n.techOwnerName}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── Affected Objects Table ── */}
              {impactStats.total > 0 && (
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    All Affected Objects ({impactStats.total})
                  </div>
                  <div style={{ borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 100px 100px 120px 1fr', padding: '6px 14px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                      {['HOP', 'NAME', 'TYPE', 'SCHEMA', 'OWNER', 'DESCRIPTION'].map(h => (
                        <div key={h} style={{ fontSize: '7px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                      ))}
                    </div>
                    {downstreamChain.flatMap((hop) =>
                      hop.nodes.map(n => {
                        const cfg = typeConfig[n.type] ?? typeConfig.warehouse
                        return (
                          <div key={n.id}
                            onClick={() => selectNode(n.id)}
                            style={{
                              display: 'grid', gridTemplateColumns: '48px 1fr 100px 100px 120px 1fr',
                              padding: '6px 14px', borderBottom: '1px solid var(--surface-muted)',
                              cursor: 'pointer', transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{hop.hop}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <DbTypeIcon tableType={n.tableType} size={12} />
                              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--foreground)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                            </div>
                            <div>
                              <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, padding: '1px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: 600 }}>{cfg.label}</span>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.schema || '—'}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.ownerName || '—'}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.comment || '—'}</div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/laxmansrigiri/git_repo/DataGuard/frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/lineage/page.tsx
git commit -m "feat(lineage): add Impact Analysis tab with blast radius, business consumers, and affected objects table"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| ownerName / techOwnerName in node response | Task 1 |
| LineageNode interface update | Task 2 |
| activeTab state + reset on node change | Task 2 |
| impactStats computation | Task 2 |
| Tab bar (3 tabs with active styling) | Task 3 |
| Existing chain/columns content gated by tab | Task 3 |
| Impact severity badge with colour coding | Task 4 |
| Blast radius summary card with prose | Task 4 |
| Type breakdown row | Task 4 |
| Business consumers section + empty state | Task 4 |
| Affected objects table (Hop/Name/Type/Schema/Owner/Description) | Task 4 |
| severityConfig constant | Task 4 |
| No new API routes, no DB migrations | satisfied — all impact is client-side |

**Placeholder scan:** No TBD, TODO, or "similar to task N" patterns found.

**Type consistency:**
- `impactStats.byType` typed as `Record<string, LineageNode[]>` — consistent with Task 4 usage of `nodes.length` and individual `n` objects
- `impactStats.severity` typed as `'none' | 'low' | 'medium' | 'high' | 'critical'` — consistent with `severityConfig` keys in Task 4
- `impactStats.businessConsumers` is `LineageNode[]` — consistent with Task 4 rendering `n.ownerName`, `n.comment`, etc.
- `activeTab` type `'chains' | 'impact' | 'columns'` used as const in `as const` array in Task 3 tab bar — consistent
