'use client'
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

/* ─── Types ─── */
interface LineageNode {
  id: string; label: string; sub: string
  type: 'source' | 'raw' | 'transform' | 'warehouse' | 'output'
  icon: string; schema: string; database: string; tableType: string
  rowCount: number | null; columnCount: number
  lastAltered: string | null; comment: string | null
  x?: number; y?: number
}
interface LineageEdge { from: string; to: string; relationship: string }
interface ConnectionInfo { name: string; database: string; schema: string; warehouse: string; status: string }
interface LineageMeta { edgeMethods?: { fk: number; ddl: number; heuristic: number }; totalTables?: number; totalEdges?: number }
interface LineageData { nodes: LineageNode[]; edges: LineageEdge[]; connection: ConnectionInfo; meta?: LineageMeta }
interface ColumnInfo { COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string; ORDINAL_POSITION: number; CHARACTER_MAXIMUM_LENGTH?: number; NUMERIC_PRECISION?: number; COLUMN_DEFAULT?: string; COMMENT?: string }
interface ColumnLineageEdge { fromAssetId: string; fromColumn: string; toAssetId: string; toColumn: string }


/* ─── Node visual config ─── */
const NODE_W = 220, NODE_H = 70

const typeConfig: Record<string, { bg: string; border: string; color: string; label: string }> = {
  source:    { bg: '#eff6ff', border: '#93c5fd', color: '#1d4ed8', label: 'Source' },
  raw:       { bg: '#fdf4ff', border: '#e9d5ff', color: '#7e22ce', label: 'Raw' },
  transform: { bg: '#f0f9ff', border: '#bae6fd', color: '#0369a1', label: 'Transactions' },
  warehouse: { bg: '#ecfdf5', border: '#6ee7b7', color: '#065f46', label: 'Master Data' },
  output:    { bg: '#faf5ff', border: '#d8b4fe', color: '#7c3aed', label: 'Views' },
}

const nodeIcon: Record<string, string> = {
  CARRIERS: '🚛', CUSTOMERS: '👥', PRODUCTS: '🧳', PRODUCT_CATEGORIES: '📦',
  SUPPLIERS: '🏭', WAREHOUSES: '🏪', FINANCE_TRANSACTIONS: '⚙️', INVENTORY: '📊',
  PURCHASE_ORDERS: '📋', PURCHASE_ORDER_ITEMS: '📋', RETURNS: '↩️', SALES_ORDERS: '💰',
  CUSTOMER_CREDIT_VIEW: '👁', USA_CUSTOMERS_VIEW: '👁',
}

/* ─── Layout engine ─── */
function layoutNodes(nodes: LineageNode[], edges: LineageEdge[]): LineageNode[] {
  const adjOut = new Map<string, string[]>()
  const adjIn = new Map<string, string[]>()
  for (const n of nodes) { adjOut.set(n.id, []); adjIn.set(n.id, []) }
  for (const e of edges) {
    adjOut.get(e.from)?.push(e.to)
    adjIn.get(e.to)?.push(e.from)
  }

  const layers = new Map<string, number>()
  const roots = nodes.filter(n => (adjIn.get(n.id) ?? []).length === 0)
  const queue = roots.map(n => ({ id: n.id, layer: 0 }))
  const visited = new Set<string>()

  while (queue.length > 0) {
    const { id, layer } = queue.shift()!
    if (visited.has(id)) { layers.set(id, Math.max(layers.get(id) ?? 0, layer)); continue }
    visited.add(id)
    layers.set(id, layer)
    for (const child of adjOut.get(id) ?? []) queue.push({ id: child, layer: layer + 1 })
  }
  for (const n of nodes) { if (!layers.has(n.id)) layers.set(n.id, 0) }

  const layerGroups = new Map<number, string[]>()
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, [])
    layerGroups.get(layer)!.push(id)
  }

  const LAYER_X = 290
  const START_X = 60
  const START_Y = 80
  const GAP_Y = 90

  return nodes.map(n => {
    const layer = layers.get(n.id) ?? 0
    const group = layerGroups.get(layer) ?? [n.id]
    const idx = group.indexOf(n.id)
    return { ...n, x: START_X + layer * LAYER_X, y: START_Y + idx * GAP_Y }
  })
}

/* ─── Data type display helpers ─── */
function dtIcon(dt: string): { symbol: string; color: string } {
  const t = dt.toUpperCase()
  if (t.includes('NUMBER') || t.includes('INT') || t.includes('FLOAT') || t.includes('DECIMAL') || t.includes('NUMERIC'))
    return { symbol: '#', color: '#2563eb' }
  if (t.includes('DATE') || t.includes('TIME') || t.includes('TIMESTAMP'))
    return { symbol: '📅', color: '#7c3aed' }
  if (t.includes('BOOL'))
    return { symbol: '◉', color: '#16a34a' }
  if (t.includes('VARIANT') || t.includes('OBJECT') || t.includes('ARRAY'))
    return { symbol: '{ }', color: '#ea580c' }
  return { symbol: 'A', color: '#64748b' }
}

function dtLabel(dt: string): string {
  const t = dt.toUpperCase()
  if (t.includes('VARCHAR') || t.includes('STRING') || t.includes('TEXT') || t.includes('CHAR')) return 'TEXT'
  if (t.includes('NUMBER') || t.includes('NUMERIC') || t.includes('DECIMAL')) return 'NUMBER'
  if (t.includes('INT')) return 'INTEGER'
  if (t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('REAL')) return 'FLOAT'
  if (t.includes('TIMESTAMP')) return 'TIMESTAMP'
  if (t.includes('DATE')) return 'DATE'
  if (t.includes('TIME')) return 'TIME'
  if (t.includes('BOOLEAN') || t.includes('BOOL')) return 'BOOLEAN'
  if (t.includes('VARIANT')) return 'VARIANT'
  if (t.includes('ARRAY')) return 'ARRAY'
  if (t.includes('OBJECT')) return 'OBJECT'
  return dt.split('(')[0] || dt
}

/* ─── Upstream chain builder ─── */
function buildChain(startId: string, edges: LineageEdge[], nodeMap: Map<string, LineageNode>, direction: 'up' | 'down'): { hop: number; nodes: LineageNode[] }[] {
  const hops: { hop: number; nodes: LineageNode[] }[] = []
  const visited = new Set<string>([startId])
  let current = [startId]
  let hopNum = 1

  while (current.length > 0) {
    const next: string[] = []
    const hopNodes: LineageNode[] = []
    for (const id of current) {
      const related = direction === 'up'
        ? edges.filter(e => e.to === id).map(e => e.from)
        : edges.filter(e => e.from === id).map(e => e.to)
      for (const rid of related) {
        if (!visited.has(rid)) {
          visited.add(rid)
          const node = nodeMap.get(rid)
          if (node) { hopNodes.push(node); next.push(rid) }
        }
      }
    }
    if (hopNodes.length > 0) {
      hops.push({ hop: hopNum, nodes: hopNodes })
      hopNum++
    }
    current = next
  }
  return hops
}

/* ─── Auto-refresh interval ─── */
const REFRESH_INTERVAL = 30000

/* ─── Main ─── */
export default function LineagePage() {
  const [data, setData] = useState<LineageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [columnData, setColumnData] = useState<ColumnInfo[] | null>(null)
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)
  const [allTableColumns, setAllTableColumns] = useState<Map<string, string[]>>(new Map())
  const [columnEdges, setColumnEdges] = useState<ColumnLineageEdge[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchLineage = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/snowflake/lineage')
      if (res.ok) {
        const json = await res.json()
        if (json.nodes && json.nodes.length > 0) {
          json.nodes = json.nodes.map((n: LineageNode) => ({
            ...n,
            icon: nodeIcon[n.label] || n.icon,
          }))
          setData(json); setIsLive(true); setLastRefresh(new Date())
          if (!silent) setLoading(false)
          return
        }
      }
    } catch { /* no lineage yet */ }
    setData({
      nodes: [], edges: [],
      connection: { name: '', database: '', schema: '', warehouse: '', status: 'empty' },
    })
    setIsLive(false); setLastRefresh(new Date())
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => { fetchLineage() }, [fetchLineage])

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(() => { fetchLineage(true) }, REFRESH_INTERVAL)
    return () => clearInterval(timer)
  }, [fetchLineage])

  // Load all table columns for column-level lineage
  useEffect(() => {
    if (!data) return
    const loadAllCols = async () => {
      const map = new Map<string, string[]>()
      for (const node of data.nodes) {
        if (node.type === 'source') continue
        try {
          const res = await fetch(`/api/snowflake/columns?table=${encodeURIComponent(node.label)}`)
          const json = await res.json()
          if (json.columns && json.columns.length > 0) {
            map.set(node.id, json.columns.map((c: ColumnInfo) => c.COLUMN_NAME))
          }
        } catch { /* no columns yet */ }
      }
      setAllTableColumns(map)
    }
    loadAllCols()

    fetch('/api/snowflake/column-lineage')
      .then(r => r.json())
      .then(d => setColumnEdges(Array.isArray(d.edges) ? d.edges : []))
      .catch(() => setColumnEdges([]))
  }, [data])

  // Clear selected column when table selection changes
  useEffect(() => { setSelectedColumn(null) }, [selected])

  // Fetch columns when a node is selected
  useEffect(() => {
    if (!selected) { setColumnData(null); return }
    const node = data?.nodes.find(n => n.id === selected)
    if (!node || node.type === 'source') { setColumnData(null); return }
    setColumnsLoading(true); setColumnSearch('')
    fetch(`/api/snowflake/columns?table=${encodeURIComponent(node.label)}`)
      .then(r => r.json())
      .then(d => setColumnData(d.columns ?? []))
      .catch(() => { setColumnData([]) })
      .finally(() => setColumnsLoading(false))
  }, [selected, isLive, data])

  // ─── Derived layout (always computed, hooks-safe) ───
  const laidOut = useMemo(() => data ? layoutNodes(data.nodes, data.edges) : [], [data])
  const nodeMap = useMemo(() => new Map(laidOut.map(n => [n.id, n])), [laidOut])

  // ─── Column-level lineage computation (backend-derived column-to-column edges) ───
  const columnLineage = useMemo(() => {
    type ColPath = { tableId: string; label: string; column: string; role: string }
    const empty = { tables: new Set<string>(), edges: [] as { from: string; to: string }[], path: [] as ColPath[] }
    if (!selectedColumn || !selected || !data) return empty

    type Pair = { tableId: string; column: string }
    const pairKey = (p: Pair) => `${p.tableId}::${p.column}`

    // BFS outward (both directions) from the selected table/column through column edges
    const visited = new Map<string, Pair>()
    const visitedEdges: ColumnLineageEdge[] = []
    const start: Pair = { tableId: selected, column: selectedColumn }
    visited.set(pairKey(start), start)
    const queue: Pair[] = [start]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const e of columnEdges) {
        if (e.fromAssetId === cur.tableId && e.fromColumn === cur.column) {
          visitedEdges.push(e)
          const next = { tableId: e.toAssetId, column: e.toColumn }
          if (!visited.has(pairKey(next))) { visited.set(pairKey(next), next); queue.push(next) }
        }
        if (e.toAssetId === cur.tableId && e.toColumn === cur.column) {
          visitedEdges.push(e)
          const next = { tableId: e.fromAssetId, column: e.fromColumn }
          if (!visited.has(pairKey(next))) { visited.set(pairKey(next), next); queue.push(next) }
        }
      }
    }

    const nodes = [...visited.values()]
    if (nodes.length <= 1) {
      // No resolved backend lineage for this column — graceful single-node fallback
      const node = nodeMap.get(selected)
      return {
        tables: new Set([selected]),
        edges: [],
        path: node ? [{ tableId: selected, label: node.label, column: selectedColumn, role: 'reference' as const }] : [],
      }
    }

    const hasOutgoing = (p: Pair) => visitedEdges.some(e => e.fromAssetId === p.tableId && e.fromColumn === p.column)
    const hasIncoming = (p: Pair) => visitedEdges.some(e => e.toAssetId === p.tableId && e.toColumn === p.column)

    const path: ColPath[] = []
    const pathVisited = new Set<string>()
    const roots = nodes.filter(n => !hasIncoming(n))
    const queue2 = [...roots]
    while (queue2.length > 0) {
      const cur = queue2.shift()!
      const k = pairKey(cur)
      if (pathVisited.has(k)) continue
      pathVisited.add(k)
      const node = nodeMap.get(cur.tableId)
      if (node) {
        const role = !hasIncoming(cur) ? 'origin' : hasOutgoing(cur) ? 'passthrough' : 'consumer'
        path.push({ tableId: cur.tableId, label: node.label, column: cur.column, role })
      }
      for (const e of visitedEdges) {
        if (e.fromAssetId === cur.tableId && e.fromColumn === cur.column) {
          const next = { tableId: e.toAssetId, column: e.toColumn }
          if (!pathVisited.has(pairKey(next))) queue2.push(next)
        }
      }
    }
    for (const n of nodes) {
      if (!pathVisited.has(pairKey(n))) {
        const node = nodeMap.get(n.tableId)
        if (node) path.push({ tableId: n.tableId, label: node.label, column: n.column, role: 'reference' })
      }
    }

    return {
      tables: new Set(nodes.map(n => n.tableId)),
      edges: visitedEdges.map(e => ({ from: e.fromAssetId, to: e.toAssetId })),
      path,
    }
  }, [selectedColumn, selected, columnEdges, data, nodeMap])

  if (loading) {
    return (
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>⚙️</div>
          <div>Loading lineage data...</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }
  if (!data) return null

  if (data.nodes.length === 0) {
    return (
      <div style={{ padding: '10px 16px', maxWidth: '1500px' }}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
          No lineage data yet — add connections and register datasets to see lineage
        </div>
      </div>
    )
  }

  // Layer labels — pick the dominant type in each layer column
  const layerLabels: Record<number, string> = {}
  const layerTypeCounts = new Map<number, Map<string, number>>()
  laidOut.forEach(n => {
    const layer = Math.round(((n.x ?? 0) - 60) / 290)
    if (!layerTypeCounts.has(layer)) layerTypeCounts.set(layer, new Map())
    const counts = layerTypeCounts.get(layer)!
    counts.set(n.type, (counts.get(n.type) ?? 0) + 1)
  })
  for (const [layer, counts] of layerTypeCounts) {
    let dominant = 'warehouse'
    let maxCount = 0
    for (const [type, count] of counts) {
      if (count > maxCount) { dominant = type; maxCount = count }
    }
    const labelMap: Record<string, string> = { source: 'SOURCE', warehouse: 'MASTER DATA', transform: 'TRANSACTIONS', output: 'VIEWS', raw: 'RAW' }
    layerLabels[layer] = labelMap[dominant] || dominant.toUpperCase()
  }

  const maxX = Math.max(...laidOut.map(n => (n.x ?? 0) + NODE_W)) + 80
  const maxY = Math.max(...laidOut.map(n => (n.y ?? 0) + NODE_H)) + 80

  const matches = search.trim().length > 0
    ? laidOut.filter(n => n.label.toLowerCase().includes(search.toLowerCase()) || n.sub.toLowerCase().includes(search.toLowerCase()))
    : []

  function selectNode(id: string) {
    setSelected(prev => prev === id ? null : id)
    setShowDropdown(false)
  }

  function clearSearch() {
    setSearch(''); setSelected(null); setShowDropdown(false)
    inputRef.current?.focus()
  }

  const highlighted = selected
    ? new Set([selected, ...data.edges.filter(e => e.from === selected || e.to === selected).flatMap(e => [e.from, e.to])])
    : null

  const selectedNode = selected ? nodeMap.get(selected) : null
  const upstreamChain = selected ? buildChain(selected, data.edges, nodeMap, 'up') : []
  const downstreamChain = selected ? buildChain(selected, data.edges, nodeMap, 'down') : []
  const totalUpstream = upstreamChain.reduce((s, h) => s + h.nodes.length, 0)
  const totalDownstream = downstreamChain.reduce((s, h) => s + h.nodes.length, 0)

  const filteredColumns = columnData?.filter(c =>
    !columnSearch || c.COLUMN_NAME.toLowerCase().includes(columnSearch.toLowerCase())
  )
  const nullableCount = columnData?.filter(c => c.IS_NULLABLE === 'YES').length ?? 0
  const notNullCount = columnData?.filter(c => c.IS_NULLABLE === 'NO').length ?? 0

  const timeSinceRefresh = Math.round((Date.now() - lastRefresh.getTime()) / 1000)

  return (
    <div style={{ padding: '10px 16px', maxWidth: '1500px' }}>

      {/* compact top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Lineage</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: isLive ? 'var(--status-ok-bg)' : 'var(--status-warn-bg)',
          color: isLive ? 'var(--status-ok-text)' : 'var(--status-warn-text)',
          padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
        }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isLive ? 'var(--status-ok-text)' : 'var(--status-warn-text)', display: 'inline-block', animation: isLive ? 'pulse 2s infinite' : 'none' }} />
          {isLive ? 'LIVE' : 'DEMO'}
        </span>
        {isLive && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {laidOut.length} objects · {data.edges.length} edges
            {data.meta?.edgeMethods && <> · {[
              data.meta.edgeMethods.fk > 0 && `${data.meta.edgeMethods.fk} FK`,
              data.meta.edgeMethods.ddl > 0 && `${data.meta.edgeMethods.ddl} DDL`,
              data.meta.edgeMethods.heuristic > 0 && `${data.meta.edgeMethods.heuristic} inferred`,
            ].filter(Boolean).join(', ')}</>}
          </span>
        )}
        {!isLive && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Demo mode · connect Snowflake for live lineage</span>}
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Auto-refresh 30s{timeSinceRefresh > 5 ? ` · ${timeSinceRefresh}s ago` : ''}</span>
        <button onClick={() => fetchLineage()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: 'auto' }}>🔄 Refresh</button>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } } @keyframes dashFlow { to { stroke-dashoffset: -24 } }`}</style>
      </div>

      {/* search + legend on same row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', position: 'relative' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
          <input ref={inputRef} value={search}
            onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
            onFocus={() => { if (search) setShowDropdown(true) }}
            placeholder="Search tables, views, schemas..."
            style={{
              width: '100%', padding: '4px 32px 4px 28px', borderRadius: '6px',
              border: `1px solid ${showDropdown && matches.length > 0 ? '#93c5fd' : 'var(--border)'}`,
              fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)',
              boxSizing: 'border-box', outline: 'none',
              boxShadow: showDropdown && matches.length > 0 ? '0 0 0 2px #dbeafe' : 'none',
            }}
          />
          {search && <button onClick={clearSearch} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}>✕</button>}

          {showDropdown && matches.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', maxHeight: '280px', overflowY: 'auto' }}>
              <div style={{ padding: '6px 12px', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{matches.length} found</div>
              {matches.map(m => {
                const cfg = typeConfig[m.type] ?? typeConfig.warehouse
                return (
                  <div key={m.id} onMouseDown={() => { selectNode(m.id); setSearch(m.label) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>{m.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '11.5px', color: 'var(--foreground)' }}>{m.label}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{m.sub}</div>
                    </div>
                    <span style={{ background: cfg.bg, color: cfg.color, padding: '1px 6px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 600 }}>{cfg.label}</span>
                  </div>
                )
              })}
            </div>
          )}
          {showDropdown && search.trim().length > 0 && matches.length === 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
              No objects found
            </div>
          )}
        </div>

        {/* legend pills — same row as search */}
        {Object.entries(typeConfig).map(([type, cfg]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: cfg.border }} />
            <span style={{ fontSize: '9.5px', color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* SVG Graph */}
      <div style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '14px', padding: '16px', overflowX: 'auto', position: 'relative' }}>
        {/* ── Floating Column Popup on graph ── */}
        {selectedNode && selectedNode.type !== 'source' && (
          <div style={{
            position: 'absolute',
            left: (selectedNode.x ?? 0) + NODE_W + 28,
            top: (selectedNode.y ?? 0) + 16,
            width: 320, maxHeight: 480,
            background: '#fff', borderRadius: '14px',
            border: '2px solid #93c5fd',
            boxShadow: '0 12px 40px rgba(37,99,235,0.18)',
            zIndex: 50,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Popup Header */}
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '18px' }}>{selectedNode.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedNode.label}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {selectedNode.schema} / {selectedNode.label}
                  {selectedNode.rowCount != null ? ` · ${selectedNode.rowCount.toLocaleString()} rows` : ''}
                </div>
              </div>
              {/* Search toggle */}
              <button onClick={() => setColumnSearch(columnSearch ? '' : ' ')}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: columnSearch ? '#eef4ff' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', color: '#64748b' }}>🔍</button>
              {/* Status */}
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>✓</span>
              {/* Close */}
              <button onClick={() => setSelected(null)}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#94a3b8' }}>✕</button>
            </div>

            {/* Search input (shown when active) */}
            {columnSearch !== '' && (
              <div style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9' }}>
                <input
                  autoFocus
                  value={columnSearch.trim() === '' ? '' : columnSearch}
                  onChange={e => setColumnSearch(e.target.value)}
                  placeholder="Search columns..."
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', outline: 'none', background: '#fafaf9', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Column list */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {columnsLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Loading columns...</div>
              ) : filteredColumns && filteredColumns.length > 0 ? filteredColumns.map((col, i) => {
                const dt = dtIcon(col.DATA_TYPE)
                const isColSelected = selectedColumn === col.COLUMN_NAME
                // Count how many other tables have this column
                const colTableCount = selectedColumn === col.COLUMN_NAME
                  ? columnLineage.tables.size
                  : [...allTableColumns.values()].filter(cols => cols.includes(col.COLUMN_NAME)).length
                return (
                  <div key={i}
                    onClick={() => setSelectedColumn(isColSelected ? null : col.COLUMN_NAME)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '9px 14px',
                      borderBottom: '1px solid #f8f6f0',
                      background: isColSelected ? '#eff6ff' : (i % 2 === 0 ? '#fff' : '#fafaf9'),
                      borderLeft: isColSelected ? '3px solid #8b5cf6' : '3px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!isColSelected) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (!isColSelected) e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafaf9' }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 700, color: isColSelected ? '#8b5cf6' : dt.color,
                      background: isColSelected ? '#8b5cf612' : dt.color + '12', flexShrink: 0,
                    }}>{dt.symbol}</span>
                    <span style={{
                      flex: 1, fontSize: '13px', fontWeight: isColSelected ? 700 : 500, color: isColSelected ? '#4c1d95' : '#1a1a1a', fontFamily: 'monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{col.COLUMN_NAME}</span>
                    {colTableCount > 1 && (
                      <span style={{
                        background: isColSelected ? '#8b5cf6' : '#e2e8f0',
                        color: isColSelected ? '#fff' : '#64748b',
                        padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, flexShrink: 0,
                      }}>{colTableCount}</span>
                    )}
                    <span style={{ fontSize: '11px', color: col.IS_NULLABLE === 'NO' ? '#16a34a' : '#cbd5e1', flexShrink: 0 }}>
                      {col.IS_NULLABLE === 'NO' ? '●' : '○'}
                    </span>
                  </div>
                )
              }) : (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                  {columnSearch ? 'No matching columns' : 'No columns available'}
                </div>
              )}
            </div>

            {/* Column Lineage Panel (when a column is selected) */}
            {selectedColumn && columnLineage.path.length > 0 && (
              <div style={{ borderTop: '2px solid #8b5cf6', background: '#faf5ff', padding: '10px 14px', maxHeight: '160px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px' }}>🔗</span>
                  <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#6d28d9' }}>
                    COLUMN LINEAGE: {selectedColumn}
                  </span>
                  <span style={{ fontSize: '10px', color: '#a78bfa', marginLeft: 'auto' }}>
                    {columnLineage.path.length} table{columnLineage.path.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {columnLineage.path.map((item, i) => {
                    const roleColors: Record<string, { bg: string; color: string; label: string }> = {
                      origin: { bg: '#dcfce7', color: '#16a34a', label: 'ORIGIN' },
                      passthrough: { bg: '#dbeafe', color: '#2563eb', label: 'PASS' },
                      consumer: { bg: '#fef3c7', color: '#d97706', label: 'CONSUMER' },
                      reference: { bg: '#f3e8ff', color: '#7c3aed', label: 'REF' },
                    }
                    const rc = roleColors[item.role] ?? roleColors.reference
                    return (
                      <div key={item.tableId} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {i > 0 && <span style={{ fontSize: '10px', color: '#a78bfa' }}>→</span>}
                        {i === 0 && <span style={{ fontSize: '10px', color: '#a78bfa' }}>◆</span>}
                        <button
                          onClick={(e) => { e.stopPropagation(); selectNode(item.tableId) }}
                          style={{
                            background: '#fff', border: '1px solid #e9d5ff', borderRadius: '6px',
                            padding: '3px 8px', fontSize: '11.5px', fontWeight: 600, color: '#4c1d95',
                            cursor: 'pointer', fontFamily: 'monospace',
                          }}
                        >{item.label}</button>
                        <span style={{
                          background: rc.bg, color: rc.color, padding: '1px 5px',
                          borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                        }}>{rc.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Popup Footer */}
            <div style={{ padding: '8px 14px', borderTop: '1px solid #ebe8df', background: '#fafaf9' }}>
              <div style={{ fontSize: '11px', color: selectedColumn ? '#6d28d9' : '#94a3b8' }}>
                {selectedColumn
                  ? `🔗 ${selectedColumn} flows through ${columnLineage.path.length} tables`
                  : `${columnData?.length ?? 0} columns · click any column for lineage`}
              </div>
            </div>
          </div>
        )}

        <svg width={Math.max(maxX, 1000)} height={Math.max(maxY, 500)} viewBox={`0 0 ${Math.max(maxX, 1000)} ${Math.max(maxY, 500)}`} style={{ display: 'block', minWidth: `${Math.max(maxX, 1000)}px` }}>
          <defs>
            <marker id="arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#cbd5e1" /></marker>
            <marker id="arrow-hl" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#2563eb" /></marker>
            <marker id="arrow-up" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#16a34a" /></marker>
            <marker id="arrow-dn" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#ea580c" /></marker>
            <marker id="arrow-col" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#8b5cf6" /></marker>
          </defs>

          {/* Layer labels at top */}
          {Object.entries(layerLabels).map(([layerStr, label]) => {
            const layer = Number(layerStr)
            const x = 60 + layer * 290 + NODE_W / 2
            return (
              <g key={layerStr}>
                <text x={x} y={30} textAnchor="middle" fontSize="11" fontWeight="600" fill="#94a3b8" letterSpacing="1.5" fontFamily="system-ui,sans-serif">{label}</text>
                <line x1={x - 60} y1={42} x2={x + 60} y2={42} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
              </g>
            )
          })}

          {/* Edges */}
          {data.edges.map((edge, i) => {
            const from = nodeMap.get(edge.from)
            const to = nodeMap.get(edge.to)
            if (!from || !to) return null
            const fx = (from.x ?? 0) + NODE_W - 4
            const fy = (from.y ?? 0) + NODE_H / 2
            const tx = (to.x ?? 0) + 4
            const ty = (to.y ?? 0) + NODE_H / 2
            const midX = (fx + tx) / 2

            const isUpstream = selected && highlighted?.has(edge.from) && highlighted?.has(edge.to) && data.edges.some(e => e.to === selected && e.from === edge.from)
            const isDownstream = selected && highlighted?.has(edge.from) && highlighted?.has(edge.to) && data.edges.some(e => e.from === selected && e.to === edge.to)
            const isHL = highlighted?.has(edge.from) && highlighted?.has(edge.to)

            return (
              <path key={i}
                d={`M${fx},${fy} C${midX},${fy} ${midX},${ty} ${tx},${ty}`}
                fill="none"
                stroke={isUpstream ? '#16a34a' : isDownstream ? '#ea580c' : isHL ? '#2563eb' : '#e2e8f0'}
                strokeWidth={isHL ? 2 : 1}
                markerEnd={isUpstream ? 'url(#arrow-up)' : isDownstream ? 'url(#arrow-dn)' : isHL ? 'url(#arrow-hl)' : 'url(#arrow)'}
                opacity={highlighted && !isHL ? 0.15 : 1}
                style={{ transition: 'stroke 0.2s, opacity 0.2s' }}
              />
            )
          })}

          {/* Column-level lineage edges (drawn on top of table edges) */}
          {selectedColumn && columnLineage.edges.map((edge, i) => {
            const from = nodeMap.get(edge.from)
            const to = nodeMap.get(edge.to)
            if (!from || !to) return null
            const fx = (from.x ?? 0) + NODE_W - 4
            const fy = (from.y ?? 0) + NODE_H / 2 + 10
            const tx = (to.x ?? 0) + 4
            const ty = (to.y ?? 0) + NODE_H / 2 + 10
            const midX = (fx + tx) / 2
            return (
              <g key={`col-edge-${i}`}>
                {/* Glow effect */}
                <path
                  d={`M${fx},${fy} C${midX},${fy} ${midX},${ty} ${tx},${ty}`}
                  fill="none" stroke="#8b5cf6" strokeWidth={6} opacity={0.15}
                />
                {/* Main line */}
                <path
                  d={`M${fx},${fy} C${midX},${fy} ${midX},${ty} ${tx},${ty}`}
                  fill="none" stroke="#8b5cf6" strokeWidth={2.5}
                  strokeDasharray="8 4"
                  markerEnd="url(#arrow-col)" opacity={0.9}
                  style={{ animation: 'dashFlow 1.5s linear infinite' }}
                />
              </g>
            )
          })}

          {/* Nodes */}
          {laidOut.map(node => {
            const cfg = typeConfig[node.type] ?? typeConfig.warehouse
            const isSel = selected === node.id
            const isDimmed = highlighted && !highlighted.has(node.id)
            const isInColLineage = selectedColumn ? columnLineage.tables.has(node.id) : false
            const nx = node.x ?? 0
            const ny = node.y ?? 0
            return (
              <g key={node.id} style={{ cursor: 'pointer' }} onClick={() => selectNode(node.id)}>
                {/* Column lineage glow ring */}
                {isInColLineage && (
                  <rect x={nx - 3} y={ny - 3} width={NODE_W + 6} height={NODE_H + 6} rx={12}
                    fill="none" stroke="#8b5cf6" strokeWidth={2} opacity={0.5}
                    strokeDasharray="6 3"
                    style={{ animation: 'dashFlow 2s linear infinite' }}
                  />
                )}
                <rect x={nx} y={ny} width={NODE_W} height={NODE_H} rx={10}
                  fill={isInColLineage ? '#faf5ff' : cfg.bg}
                  stroke={isInColLineage ? '#8b5cf6' : isSel ? '#2563eb' : cfg.border}
                  strokeWidth={isInColLineage ? 2.5 : isSel ? 2.5 : 1.5}
                  opacity={isDimmed && !isInColLineage ? 0.2 : 1}
                  filter={isInColLineage ? 'drop-shadow(0 0 8px rgba(139,92,246,0.3))' : isSel ? 'drop-shadow(0 0 8px rgba(37,99,235,0.3))' : undefined}
                  style={{ transition: 'all 0.2s' }}
                />
                <text x={nx + 14} y={ny + 28} fontSize="16" opacity={isDimmed && !isInColLineage ? 0.2 : 1}>{node.icon}</text>
                <text x={nx + 36} y={ny + 28} fontSize="12" fontWeight={isSel || isInColLineage ? 700 : 600} fill={isInColLineage ? '#6d28d9' : cfg.color} opacity={isDimmed && !isInColLineage ? 0.2 : 1} fontFamily="system-ui,sans-serif">
                  {node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label}
                </text>
                <text x={nx + 36} y={ny + 46} fontSize="10" fill={isInColLineage ? '#8b5cf6' : cfg.color} opacity={isDimmed && !isInColLineage ? 0.1 : 0.55} fontFamily="system-ui,sans-serif">
                  {node.rowCount ? `${node.rowCount.toLocaleString()} rows · ` : ''}{node.sub}
                </text>
                {/* Column lineage badge on node */}
                {isInColLineage && (
                  <g>
                    <rect x={nx + NODE_W - 42} y={ny + NODE_H - 18} width={36} height={14} rx={7} fill="#8b5cf6" />
                    <text x={nx + NODE_W - 24} y={ny + NODE_H - 9} textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700" fontFamily="system-ui,sans-serif">COL</text>
                  </g>
                )}
                {node.rowCount != null && !isInColLineage && (
                  <circle cx={nx + NODE_W - 12} cy={ny + 16} r={5} fill="#16a34a" opacity={isDimmed ? 0.1 : 0.8} />
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* ── Full-width Detail Panel (below graph, matching Data-Quality reference) ── */}
      {selectedNode && (
        <div style={{
          marginTop: '16px', background: '#fff', border: '1px solid #ebe8df', borderRadius: '14px',
          overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}>
          {/* Panel Header */}
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: (typeConfig[selectedNode.type] ?? typeConfig.warehouse).bg,
                border: `2px solid ${(typeConfig[selectedNode.type] ?? typeConfig.warehouse).border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
              }}>{selectedNode.icon}</div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>{selectedNode.label}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>{selectedNode.schema} · {selectedNode.tableType === 'VIEW' ? 'View' : selectedNode.tableType === 'MATERIALIZED VIEW' ? 'Materialized View' : 'Table'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                background: (typeConfig[selectedNode.type] ?? typeConfig.warehouse).bg,
                color: (typeConfig[selectedNode.type] ?? typeConfig.warehouse).color,
                padding: '4px 12px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 600,
                border: `1px solid ${(typeConfig[selectedNode.type] ?? typeConfig.warehouse).border}`,
              }}>{(typeConfig[selectedNode.type] ?? typeConfig.warehouse).label}</span>
              <button onClick={() => setSelected(null)} style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', width: '32px', height: '32px',
                borderRadius: '8px', cursor: 'pointer', fontSize: '16px', color: '#64748b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>
          </div>

          {/* Upstream / Downstream chains */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderBottom: '1px solid #f1f5f9' }}>
            {/* Upstream */}
            <div style={{ padding: '16px 24px', borderRight: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>⬆ UPSTREAM CHAIN ({totalUpstream})</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{upstreamChain.length} hop{upstreamChain.length !== 1 ? 's' : ''} to source</div>
              </div>
              {upstreamChain.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>Root node — no upstream dependencies</div>
              ) : upstreamChain.map(hop => (
                <div key={hop.hop} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    ⬆ HOP {hop.hop} {hop.hop === upstreamChain.length ? '(SOURCE / ROOT)' : ''}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {hop.nodes.map(n => {
                      const cfg = typeConfig[n.type] ?? typeConfig.warehouse
                      return (
                        <button key={n.id} onClick={() => selectNode(n.id)} style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '5px 10px', borderRadius: '8px', border: `1px solid ${cfg.border}`,
                          background: cfg.bg, cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: cfg.color,
                        }}>
                          <span style={{ fontSize: '13px' }}>{n.icon}</span>
                          {n.label}
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{cfg.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* Downstream */}
            <div style={{ padding: '16px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#ea580c' }}>⬇ DOWNSTREAM CHAIN ({totalDownstream})</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{downstreamChain.length} hop{downstreamChain.length !== 1 ? 's' : ''} to leaf</div>
              </div>
              {downstreamChain.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>Terminal node — no downstream consumers</div>
              ) : downstreamChain.map(hop => (
                <div key={hop.hop} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                    ⬇ HOP {hop.hop}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {hop.nodes.map(n => {
                      const cfg = typeConfig[n.type] ?? typeConfig.warehouse
                      return (
                        <button key={n.id} onClick={() => selectNode(n.id)} style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '5px 10px', borderRadius: '8px', border: `1px solid ${cfg.border}`,
                          background: cfg.bg, cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: cfg.color,
                        }}>
                          <span style={{ fontSize: '13px' }}>{n.icon}</span>
                          {n.label}
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{cfg.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column-level lineage detail (when column is selected) */}
          {selectedColumn && columnLineage.path.length > 1 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#faf5ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px' }}>🔗</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#6d28d9' }}>COLUMN LINEAGE: {selectedColumn}</span>
                  <span style={{
                    background: '#8b5cf6', color: '#fff', padding: '2px 10px',
                    borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                  }}>{columnLineage.path.length} tables</span>
                </div>
                <button onClick={() => setSelectedColumn(null)} style={{
                  background: '#f3e8ff', border: '1px solid #d8b4fe', padding: '4px 12px',
                  borderRadius: '6px', fontSize: '11.5px', color: '#6d28d9', cursor: 'pointer', fontWeight: 500,
                }}>✕ Clear</button>
              </div>

              {/* Column flow visualization */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                padding: '12px 16px', background: '#fff', borderRadius: '10px', border: '1px solid #e9d5ff',
              }}>
                {columnLineage.path.map((item, i) => {
                  const roleColors: Record<string, { bg: string; color: string; border: string; label: string }> = {
                    origin: { bg: '#dcfce7', color: '#16a34a', border: '#86efac', label: '🟢 ORIGIN' },
                    passthrough: { bg: '#dbeafe', color: '#2563eb', border: '#93c5fd', label: '🔵 PASS-THROUGH' },
                    consumer: { bg: '#fef3c7', color: '#d97706', border: '#fcd34d', label: '🟡 CONSUMER' },
                    reference: { bg: '#f3e8ff', color: '#7c3aed', border: '#d8b4fe', label: '🟣 REFERENCE' },
                  }
                  const rc = roleColors[item.role] ?? roleColors.reference
                  const isCurrentTable = item.tableId === selected
                  return (
                    <div key={item.tableId} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {i > 0 && (
                        <svg width="24" height="12"><path d="M0,6 L18,6 M14,2 L18,6 L14,10" fill="none" stroke="#8b5cf6" strokeWidth="2" /></svg>
                      )}
                      <button
                        onClick={() => selectNode(item.tableId)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                          padding: '8px 14px', borderRadius: '10px',
                          border: isCurrentTable ? '2px solid #8b5cf6' : `1px solid ${rc.border}`,
                          background: isCurrentTable ? '#ede9fe' : rc.bg,
                          cursor: 'pointer',
                          boxShadow: isCurrentTable ? '0 0 0 3px #c4b5fd' : 'none',
                        }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a1a1a', fontFamily: 'monospace' }}>{item.label}</span>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: rc.color }}>{rc.label}</span>
                        <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>{selectedColumn}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Column Table */}
          <div style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '14px' }}>📋</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1a1a1a' }}>COLUMNS ({columnData?.length ?? 0})</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{nullableCount} nullable · {notNullCount} NOT NULL</span>
              </div>
              <input value={columnSearch} onChange={e => setColumnSearch(e.target.value)}
                placeholder={`Search columns in ${selectedNode.label}...`}
                style={{
                  padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                  fontSize: '12px', background: '#fafaf9', outline: 'none', width: '280px',
                }} />
            </div>

            {columnsLoading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Loading columns...</div>
            ) : (
              <div style={{ borderRadius: '10px', border: '1px solid #ebe8df', overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 120px 100px 80px 1fr', gap: '0', padding: '8px 16px', background: '#fafaf9', borderBottom: '1px solid #ebe8df' }}>
                  {['#', 'COLUMN', 'TYPE', 'NULLABLE', 'LINEAGE', 'PATH'].map(h => (
                    <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                  ))}
                </div>
                {/* Rows */}
                {filteredColumns && filteredColumns.length > 0 ? filteredColumns.map((col, i) => {
                  const dt = dtIcon(col.DATA_TYPE)
                  const isPK = col.ORDINAL_POSITION === 1 && col.IS_NULLABLE === 'NO'
                  const isColSel = selectedColumn === col.COLUMN_NAME
                  const colTableCount = selectedColumn === col.COLUMN_NAME
                  ? columnLineage.tables.size
                  : [...allTableColumns.values()].filter(cols => cols.includes(col.COLUMN_NAME)).length
                  return (
                    <div key={i}
                      onClick={() => setSelectedColumn(isColSel ? null : col.COLUMN_NAME)}
                      style={{
                        display: 'grid', gridTemplateColumns: '50px 1fr 120px 100px 80px 1fr', gap: '0',
                        padding: '9px 16px', borderBottom: '1px solid #f8f6f0',
                        background: isColSel ? '#ede9fe' : (i % 2 === 0 ? '#fff' : '#fafaf9'),
                        borderLeft: isColSel ? '3px solid #8b5cf6' : '3px solid transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isColSel) e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={e => { if (!isColSel) e.currentTarget.style.background = isColSel ? '#ede9fe' : (i % 2 === 0 ? '#fff' : '#fafaf9') }}
                    >
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{col.ORDINAL_POSITION}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isPK && <span style={{ fontSize: '12px' }}>🔑</span>}
                        <span style={{ fontWeight: isPK || isColSel ? 700 : 500, fontSize: '13px', color: isColSel ? '#4c1d95' : isPK ? '#1d4ed8' : '#1a1a1a', fontFamily: 'monospace' }}>{col.COLUMN_NAME}</span>
                      </div>
                      <div>
                        <span style={{
                          background: dt.color + '14', color: dt.color, padding: '2px 8px',
                          borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                        }}>{dtLabel(col.DATA_TYPE)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {col.IS_NULLABLE === 'NO' ? (
                          <span style={{ color: '#16a34a', fontSize: '12px', fontWeight: 600 }}>✓ Not Null</span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>○ Nullable</span>
                        )}
                      </div>
                      <div>
                        {colTableCount > 1 ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                            background: isColSel ? '#8b5cf6' : '#f3e8ff',
                            color: isColSel ? '#fff' : '#7c3aed',
                            padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                          }}>🔗 {colTableCount}</span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#cbd5e1' }}>—</span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                        {selectedNode.schema}.{selectedNode.label}.{col.COLUMN_NAME}
                      </div>
                    </div>
                  )
                }) : (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    {columnSearch ? 'No matching columns' : 'No columns available'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer bar */}
          <div style={{ padding: '10px 24px', borderTop: '1px solid #f1f5f9', background: '#fafaf9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
              <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>📊 {totalUpstream} total upstream</span>
              <span style={{ color: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px' }}>📉 {totalDownstream} total downstream</span>
              <span style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>⬆ {upstreamChain.length}-hop path to source</span>
            </div>
            <div style={{ fontSize: '11.5px', color: selectedColumn ? '#6d28d9' : '#94a3b8' }}>
              {selectedColumn ? `🔗 Showing lineage for ${selectedColumn}` : 'Click any column to see its lineage'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
