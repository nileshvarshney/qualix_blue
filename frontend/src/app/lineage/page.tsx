'use client'
import { useState, useRef, useEffect, useCallback, useMemo, Suspense, type MouseEvent as ReactMouseEvent, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import EntityComments from '@/components/EntityComments'
import { apiFetch } from '@/lib/apiFetch'

/* ─── Types ─── */
interface LineageNode {
  id: string; label: string; sub: string
  type: 'source' | 'raw' | 'transform' | 'warehouse' | 'output'
  icon: string; schema: string; database: string; tableType: string
  rowCount: number | null; columnCount: number
  lastAltered: string | null; comment: string | null
  ownerName?: string | null; techOwnerName?: string | null
  x?: number; y?: number
}
interface LineageEdge { from: string; to: string; relationship: string }
interface ConnectionInfo { name: string; database: string; schema: string; warehouse: string; status: string }
interface LineageMeta { edgeMethods?: { fk: number; ddl: number; heuristic: number }; totalTables?: number; totalEdges?: number }
interface LineageData { nodes: LineageNode[]; edges: LineageEdge[]; connection: ConnectionInfo; meta?: LineageMeta }
interface ColumnInfo { COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string; ORDINAL_POSITION: number; CHARACTER_MAXIMUM_LENGTH?: number; NUMERIC_PRECISION?: number; COLUMN_DEFAULT?: string; COMMENT?: string }
interface ColumnLineageEdge { fromAssetId: string; fromColumn: string; toAssetId: string; toColumn: string }


/* ─── Node visual config ─── */
const NODE_W = 160, NODE_H = 46

/* ─── Graph zoom/pan config ─── */
const ZOOM_MIN = 0.3, ZOOM_MAX = 3, ZOOM_STEP = 0.2

const toolbarBtnStyle: CSSProperties = {
  width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, padding: 0,
}

const typeConfig: Record<string, { bg: string; border: string; color: string; label: string }> = {
  source:    { bg: '#eff6ff', border: '#93c5fd', color: '#1d4ed8', label: 'Source' },
  raw:       { bg: '#fdf4ff', border: '#e9d5ff', color: '#7e22ce', label: 'Raw' },
  transform: { bg: '#f0f9ff', border: '#bae6fd', color: '#0369a1', label: 'Transactions' },
  warehouse: { bg: '#ecfdf5', border: '#6ee7b7', color: '#065f46', label: 'Master Data' },
  output:    { bg: '#faf5ff', border: '#d8b4fe', color: '#7c3aed', label: 'Views' },
}

const severityConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  none:     { label: 'No Impact',       color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  low:      { label: 'Low Impact',      color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  medium:   { label: 'Medium Impact',   color: '#d97706', bg: '#fef3c7', border: '#fcd34d' },
  high:     { label: 'High Impact',     color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  critical: { label: 'Critical Impact', color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' },
}

/* ─── Object-type icon: a distinct database table/view glyph per object type ─── */
function DbTypeIcon({ tableType, size = 16, x, y }: { tableType?: string | null; size?: number; x?: number; y?: number }) {
  const t = (tableType ?? '').toUpperCase()
  const isMaterialized = t.includes('MATERIALIZED')
  const isExternal = t.includes('EXTERNAL')
  const isSecure = t.includes('SECURE')
  const isView = t.includes('VIEW')
  const color = isMaterialized ? '#d97706' : isView ? '#7c3aed' : isExternal ? '#64748b' : '#2563eb'

  const common = {
    x, y, width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color,
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    style: { display: 'block', flexShrink: 0 },
  }

  // Materialized view: a cached/stacked copy of a data table
  if (isMaterialized) {
    return (
      <svg {...common}>
        <rect x="7" y="7" width="14" height="14" rx="2" />
        <rect x="3" y="3" width="14" height="14" rx="2" fill="#fff" />
        <path d="M3 9h14M9 3v14" />
      </svg>
    )
  }

  // Secure view: a view (eye) with a lock badge
  if (isSecure) {
    return (
      <svg {...common}>
        <path d="M2 12s3.2-6 10-6 10 6 10 6-3.2 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="2.2" />
        <rect x="15.5" y="15.5" width="6.5" height="5.5" rx="1" fill="#fff" />
        <path d="M17 15.5v-1.1a1.6 1.6 0 0 1 3.2 0v1.1" />
      </svg>
    )
  }

  // External table: a data table with a dashed border (lives outside the warehouse)
  if (isExternal) {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" />
        <path d="M3 10h18M3 16h18M10 3v18" strokeDasharray="3 2" />
      </svg>
    )
  }

  // View: an eye — a computed/virtual table
  if (isView) {
    return (
      <svg {...common}>
        <path d="M2 12s3.2-6 10-6 10 6 10 6-3.2 6-10 6-10-6-10-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  }

  // Base table: a data grid
  return (
    <svg {...common}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 10h18M3 16h18M10 3v18" />
    </svg>
  )
}

function tableTypeLabel(tableType?: string | null): string {
  const t = (tableType ?? '').toUpperCase()
  if (t.includes('MATERIALIZED')) return 'Materialized View'
  if (t.includes('SECURE') && t.includes('VIEW')) return 'Secure View'
  if (t.includes('EXTERNAL')) return 'External Table'
  if (t.includes('VIEW')) return 'View'
  return 'Table'
}

/* ─── Build the query string for /api/snowflake/columns, which requires database+schema+table ─── */
function columnsQuery(node: LineageNode): string {
  return new URLSearchParams({
    table: node.label,
    database: node.database ?? '',
    schema: node.schema ?? '',
  }).toString()
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

  const LAYER_X = 200
  const START_X = 40
  const START_Y = 50
  const GAP_Y = 56

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

/* ─── Main ─── */
function LineageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<LineageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const targetSchema = useRef(searchParams.get('schema') ?? '')
  const targetDatabase = useRef(searchParams.get('database') ?? '')
  const [showDropdown, setShowDropdown] = useState(false)
  const [columnData, setColumnData] = useState<ColumnInfo[] | null>(null)
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [columnPopupOpen, setColumnPopupOpen] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null)
  const [columnEdges, setColumnEdges] = useState<ColumnLineageEdge[]>([])
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [connections, setConnections] = useState<{ id: string; name: string }[]>([])
  const [containerWidth, setContainerWidth] = useState(0)
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    const fromUrl = searchParams.get('connection_id')
    if (fromUrl) return fromUrl
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const prevConnectionIdRef = useRef(activeConnectionId)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasLoadedRef = useRef(false)
  const graphContainerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const dragNodeRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const nodeDraggedRef = useRef(false)
  const preserveTabRef = useRef(false)
  const isInitialMountRef = useRef(true)
  const [activeTab, setActiveTab] = useState<'chains' | 'impact' | 'columns'>('chains')

  // Fetch connections for the selector — all types, lineage now supports Postgres too
  useEffect(() => {
    apiFetch('/api/connections')
      .then(r => r.json())
      .then((conns: { id: string; name: string; type: string }[]) => {
        setConnections(conns.map(c => ({ id: c.id, name: c.name })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    function onConnChanged(e: Event) {
      const id = (e as CustomEvent<string | null>).detail
      setActiveConnectionId((id && id !== '__all__') ? id : '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  // Reset graph state when the connection actually changes (not on initial mount —
  // clearing `search` then would wipe a `q` param pre-filled from a catalog navigation).
  // Compares against the previous value rather than a one-shot flag so this stays
  // correct under React Strict Mode's double-invoked mount effects in dev.
  useEffect(() => {
    if (prevConnectionIdRef.current === activeConnectionId) return
    prevConnectionIdRef.current = activeConnectionId
    hasLoadedRef.current = false
    setSelected(null)
    setSearch('')
    setColumnEdges([])
    setColumnData(null)
  }, [activeConnectionId])

  const fetchLineage = useCallback(async () => {
    setLoading(true)
    try {
      const url = activeConnectionId
        ? `/api/snowflake/lineage?connection_id=${activeConnectionId}`
        : '/api/snowflake/lineage'
      const res = await apiFetch(url)
      if (res.ok) {
        const json = await res.json()
        if (json.nodes && json.nodes.length > 0) {
          hasLoadedRef.current = true
          setData(json); setIsLive(true); setLastRefresh(new Date())
          setLoading(false)
          return
        }
      }
    } catch { /* transient network error — fall through */ }
    if (!hasLoadedRef.current) {
      setData({
        nodes: [], edges: [],
        connection: { name: '', database: '', schema: '', warehouse: '', status: 'empty' },
      })
      setIsLive(false)
    }
    setLastRefresh(new Date())
    setLoading(false)
  }, [activeConnectionId])

  // Reload lineage whenever the active connection changes
  useEffect(() => { fetchLineage() }, [fetchLineage])

  // Sync search to URL so browser back restores it.
  // Skip on initial mount: `search` was initialized from the URL, so it already matches.
  // Calling router.replace on mount triggers a Suspense re-render cycle in Next.js App Router
  // that resets component state before lineage data can load (e.g. when navigating from catalog).
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      return
    }
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const qs = params.toString()
    router.replace(qs ? `/lineage?${qs}` : '/lineage', { scroll: false })
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  // When data loads with a pre-filled search from URL, auto-select exact match or show dropdown
  useEffect(() => {
    if (!loading && data && search.trim()) {
      const q = search.trim()
      const candidates = data.nodes.filter(n => n.label.toLowerCase() === q.toLowerCase())
      // Same table/view name can exist in multiple schemas/databases — when the
      // catalog passed schema/database context, use it to pick the right one.
      const schema = targetSchema.current.toLowerCase()
      const database = targetDatabase.current.toLowerCase()
      const exactMatch = (schema || database)
        ? candidates.find(n =>
            (!schema || n.schema.toLowerCase() === schema) &&
            (!database || n.database.toLowerCase() === database))
          ?? candidates[0]
        : candidates[0]
      if (exactMatch) {
        setSelected(exactMatch.id)
        setColumnPopupOpen(true)
        setShowDropdown(false)
      } else {
        // No exact match — show dropdown so the user can pick from partial matches
        setShowDropdown(true)
      }
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear selected column when table selection changes
  useEffect(() => { setSelectedColumn(null) }, [selected])

  // Reset zoom/pan/manual node positions whenever a new table is selected (the graph is re-laid-out)
  useEffect(() => {
    if (preserveTabRef.current) {
      preserveTabRef.current = false
      setZoom(1); setPan({ x: 0, y: 0 }); setNodePositions(new Map())
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom(1); setPan({ x: 0, y: 0 }); setNodePositions(new Map()); setActiveTab('chains')
  }, [selected])

  // Track native fullscreen state (also changes if the user presses Esc)
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === graphContainerRef.current)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Track the graph container's rendered width so the SVG (and its dotted
  // background) can fill it even when the laid-out graph content is narrower.
  useEffect(() => {
    const el = graphContainerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width
      if (width) setContainerWidth(width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [selected])

  // Fetch columns when a node is selected
  useEffect(() => {
    if (!selected) { setColumnData(null); return }
    const node = data?.nodes.find(n => n.id === selected)
    if (!node) { setColumnData(null); return }
    setColumnData(null)  // clear stale count immediately
    setColumnsLoading(true); setColumnSearch('')
    apiFetch(`/api/snowflake/columns?${columnsQuery(node)}`)
      .then(r => r.json())
      .then(d => setColumnData(d.columns ?? []))
      .catch(() => { setColumnData([]) })
      .finally(() => setColumnsLoading(false))
  }, [selected, isLive, data])

  // ─── Chain selection: only the selected table's full upstream+downstream closure is shown ───
  const rawNodeMap = useMemo(() => new Map((data?.nodes ?? []).map(n => [n.id, n])), [data])

  const chainIds = useMemo(() => {
    if (!selected || !data) return null
    const ids = new Set<string>([selected])
    for (const direction of ['up', 'down'] as const) {
      const hops = buildChain(selected, data.edges, rawNodeMap, direction)
      for (const hop of hops) for (const n of hop.nodes) ids.add(n.id)
    }
    return ids
  }, [selected, data, rawNodeMap])

  const visibleNodes = useMemo(
    () => (chainIds && data) ? data.nodes.filter(n => chainIds.has(n.id)) : [],
    [chainIds, data]
  )
  const visibleEdges = useMemo(
    () => (chainIds && data) ? data.edges.filter(e => chainIds.has(e.from) && chainIds.has(e.to)) : [],
    [chainIds, data]
  )

  // Fetch column-to-column lineage edges once a table is selected — a single
  // connection-wide request, not a per-table loop. Columns for OTHER chain tables
  // are never fetched up front; each table's own columns load only when it's clicked.
  useEffect(() => {
    if (!selected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setColumnEdges([])
      return
    }
    const url = activeConnectionId
      ? `/api/snowflake/column-lineage?connection_id=${activeConnectionId}`
      : '/api/snowflake/column-lineage'
    apiFetch(url)
      .then(r => r.json())
      .then(d => setColumnEdges(Array.isArray(d.edges) ? d.edges : []))
      .catch(() => setColumnEdges([]))
  }, [selected, activeConnectionId])

  // ─── Derived layout (always computed, hooks-safe) ───
  const laidOut = useMemo(() => {
    const base = layoutNodes(visibleNodes, visibleEdges)
    if (nodePositions.size === 0) return base
    return base.map(n => {
      const override = nodePositions.get(n.id)
      return override ? { ...n, x: override.x, y: override.y } : n
    })
  }, [visibleNodes, visibleEdges, nodePositions])
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
      const node = rawNodeMap.get(selected)
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
      const node = rawNodeMap.get(cur.tableId)
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
        const node = rawNodeMap.get(n.tableId)
        if (node) path.push({ tableId: n.tableId, label: node.label, column: n.column, role: 'reference' })
      }
    }

    return {
      tables: new Set(nodes.map(n => n.tableId)),
      edges: visitedEdges.map(e => ({ from: e.fromAssetId, to: e.toAssetId })),
      path,
    }
  }, [selectedColumn, selected, columnEdges, data, rawNodeMap])

  // ─── Impact stats (must live before early returns to satisfy Rules of Hooks) ───
  const selectedNode = selected ? nodeMap.get(selected) : null

  const { upstreamChain, downstreamChain } = useMemo(() => {
    if (!selected || !data) return { upstreamChain: [], downstreamChain: [] }
    return {
      upstreamChain: buildChain(selected, data.edges, nodeMap, 'up'),
      downstreamChain: buildChain(selected, data.edges, nodeMap, 'down'),
    }
  }, [selected, data, nodeMap])

  const totalUpstream = upstreamChain.reduce((s, h) => s + h.nodes.length, 0)
  const totalDownstream = downstreamChain.reduce((s, h) => s + h.nodes.length, 0)

  const impactStats = useMemo(() => {
    if (!selected || !selectedNode) return null
    const allDownstream = downstreamChain.flatMap(h => h.nodes)
    const byType: Record<string, LineageNode[]> = {}
    for (const n of allDownstream) {
      if (!byType[n.type]) byType[n.type] = []
      byType[n.type].push(n)
    }
    const hopNodeMap = new Map<string, number>()
    downstreamChain.forEach(hop => hop.nodes.forEach(n => hopNodeMap.set(n.id, hop.hop)))
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
      hopNodeMap,
    }
  }, [selected, selectedNode, downstreamChain, upstreamChain])

  function zoomIn() { setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2))) }
  function zoomOut() { setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2))) }
  function zoomReset() { setZoom(1); setPan({ x: 0, y: 0 }) }

  // Wheel zoom — registered as non-passive so preventDefault() actually works
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
      setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  function handleSvgMouseDown(e: ReactMouseEvent<SVGSVGElement>) {
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
    setIsPanning(true)
  }
  function handleSvgMouseMove(e: ReactMouseEvent<SVGSVGElement>) {
    if (dragNodeRef.current) {
      const drag = dragNodeRef.current
      const dx = (e.clientX - drag.startX) / zoom
      const dy = (e.clientY - drag.startY) / zoom
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) nodeDraggedRef.current = true
      setNodePositions(prev => {
        const next = new Map(prev)
        next.set(drag.id, { x: drag.origX + dx, y: drag.origY + dy })
        return next
      })
      return
    }
    if (!isPanning) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy })
  }
  function handleSvgMouseUp() { setIsPanning(false); dragNodeRef.current = null }

  // Drag a node freely on the canvas — separate from canvas panning (stopPropagation
  // keeps the svg's own mousedown pan handler from also firing on the node).
  function handleNodeMouseDown(e: ReactMouseEvent<SVGGElement>, node: LineageNode) {
    e.stopPropagation()
    nodeDraggedRef.current = false
    dragNodeRef.current = { id: node.id, startX: e.clientX, startY: e.clientY, origX: node.x ?? 0, origY: node.y ?? 0 }
  }

  async function toggleFullscreen() {
    if (!graphContainerRef.current) return
    if (document.fullscreenElement) await document.exitFullscreen()
    else await graphContainerRef.current.requestFullscreen()
  }

  if (loading) {
    return (
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
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
      <div style={{ padding: '10px 16px' }}>
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

  // Floor of 1000/500 keeps small graphs from looking cramped; the container-width
  // floor makes the SVG (and its dotted background) fill the available viewport
  // even when the laid-out graph content is narrower than the screen.
  const maxX = Math.max(...laidOut.map(n => (n.x ?? 0) + NODE_W), 1000, containerWidth - 32) + 80
  const maxY = Math.max(...laidOut.map(n => (n.y ?? 0) + NODE_H), 500) + 80

  const matches = search.trim().length > 0
    ? data.nodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()) || n.sub.toLowerCase().includes(search.toLowerCase()))
    : []

  function selectNode(id: string, preserveTab = false) {
    preserveTabRef.current = preserveTab
    if (selected === id) {
      setColumnPopupOpen(open => !open)
    } else {
      setSelected(id)
      setColumnPopupOpen(true)
    }
    setShowDropdown(false)
  }

  function clearSearch() {
    setSearch(''); setSelected(null); setShowDropdown(false)
    inputRef.current?.focus()
  }

  function captureGraph() {
    const svgEl = svgRef.current
    if (!svgEl) return
    const width = svgEl.viewBox.baseVal.width || svgEl.clientWidth
    const height = svgEl.viewBox.baseVal.height || svgEl.clientHeight
    const svgString = new XMLSerializer().serializeToString(svgEl)
    const svgUrl = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width * 2
      canvas.height = height * 2
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(2, 2)
        ctx.fillStyle = '#fafaf9'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          if (!blob) return
          const link = document.createElement('a')
          link.href = URL.createObjectURL(blob)
          link.download = `lineage-${selectedNode?.label ?? 'graph'}.png`
          link.click()
          URL.revokeObjectURL(link.href)
        })
      }
      URL.revokeObjectURL(svgUrl)
    }
    img.src = svgUrl
  }

  const filteredColumns = columnData?.filter(c =>
    !columnSearch || c.COLUMN_NAME.toLowerCase().includes(columnSearch.toLowerCase())
  )
  const nullableCount = columnData?.filter(c => c.IS_NULLABLE === 'YES').length ?? 0
  const notNullCount = columnData?.filter(c => c.IS_NULLABLE === 'NO').length ?? 0

  const timeSinceRefresh = Math.round((Date.now() - lastRefresh.getTime()) / 1000)

  return (
    <div style={{ padding: '10px 16px' }}>

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
        {isLive && selected && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {laidOut.length} objects in chain · {visibleEdges.length} edges
            {data.meta?.edgeMethods && <> · {[
              data.meta.edgeMethods.fk > 0 && `${data.meta.edgeMethods.fk} FK`,
              data.meta.edgeMethods.ddl > 0 && `${data.meta.edgeMethods.ddl} DDL`,
              data.meta.edgeMethods.heuristic > 0 && `${data.meta.edgeMethods.heuristic} inferred`,
            ].filter(Boolean).join(', ')}</>}
          </span>
        )}
        {isLive && !selected && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{data.nodes.length} objects available · search to view lineage</span>
        )}
        {!isLive && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Demo mode · connect Snowflake for live lineage</span>}
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{timeSinceRefresh > 5 ? `Updated ${timeSinceRefresh}s ago` : 'Updated just now'}</span>
        {connections.length > 1 && (
          <select
            value={activeConnectionId}
            onChange={e => setActiveConnectionId(e.target.value)}
            style={{
              fontSize: '11px', padding: '3px 6px', borderRadius: '6px',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: 'var(--foreground)', cursor: 'pointer',
            }}
          >
            <option value="">Auto (primary)</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button onClick={() => fetchLineage()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: connections.length > 1 ? undefined : 'auto' }}>🔄 Refresh</button>
        <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } } @keyframes dashFlow { to { stroke-dashoffset: -24 } }`}</style>
      </div>

      {/* compact search + legend — only shown once a table is selected */}
      {selected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap', position: 'relative' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', opacity: 0.5, pointerEvents: 'none' }}>🔍</span>
            <input ref={inputRef} value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => { if (search) setShowDropdown(true) }}
              onKeyDown={e => {
                if (e.key === 'Enter' && matches.length > 0) {
                  const exact = matches.find(m => m.label.toLowerCase() === search.toLowerCase())
                  const target = exact ?? matches[0]
                  selectNode(target.id); setSearch(target.label)
                }
              }}
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
                      <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><DbTypeIcon tableType={m.tableType} size={15} /></div>
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

          {Object.entries(typeConfig).map(([type, cfg]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>
              <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: cfg.border }} />
              <span style={{ fontSize: '9.5px', color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Prominent search card — shown when no table is selected */}
      {!selected && (
        <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>🔍</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '4px' }}>Find a table or view</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>
            {data.nodes.length} object{data.nodes.length !== 1 ? 's' : ''} available — type to search, press Enter to select
          </div>
          <div style={{ position: 'relative', maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', opacity: 0.5, pointerEvents: 'none', zIndex: 1 }}>🔍</span>
            <input
              ref={inputRef}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => { if (search) setShowDropdown(true) }}
              onKeyDown={e => {
                if (e.key === 'Enter' && matches.length > 0) {
                  const exact = matches.find(m => m.label.toLowerCase() === search.toLowerCase())
                  const target = exact ?? matches[0]
                  selectNode(target.id); setSearch(target.label)
                }
              }}
              placeholder="Search tables, views, schemas..."
              style={{
                width: '100%', padding: '10px 40px 10px 38px', borderRadius: '10px',
                border: `1.5px solid ${showDropdown && matches.length > 0 ? '#93c5fd' : 'var(--border)'}`,
                fontSize: '13px', background: 'var(--surface)', color: 'var(--foreground)',
                boxSizing: 'border-box', outline: 'none',
                boxShadow: showDropdown && matches.length > 0 ? '0 0 0 3px #dbeafe' : '0 2px 8px rgba(0,0,0,0.06)',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            />
            {search && (
              <button onClick={clearSearch} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', zIndex: 1 }}>✕</button>
            )}

            {showDropdown && matches.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', maxHeight: '320px', overflowY: 'auto' }}>
                <div style={{ padding: '6px 12px', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{matches.length} found</div>
                {matches.map(m => {
                  const cfg = typeConfig[m.type] ?? typeConfig.warehouse
                  return (
                    <div key={m.id} onMouseDown={() => { selectNode(m.id); setSearch(m.label) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-muted)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: cfg.bg, border: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><DbTypeIcon tableType={m.tableType} size={15} /></div>
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '20px', flexWrap: 'wrap' }}>
            {Object.entries(typeConfig).map(([type, cfg]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '2px 8px', borderRadius: '4px' }}>
                <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: cfg.border }} />
                <span style={{ fontSize: '9.5px', color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected && (
        /* SVG Graph */
        <div ref={graphContainerRef} style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px',
          overflow: 'auto', position: 'relative',
          height: isFullscreen ? '100vh' : undefined,
        }}>
          {/* Zoom / fullscreen / capture toolbar */}
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 60, display: 'flex', gap: '4px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px',
            boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
          }}>
            <button onClick={zoomOut} title="Zoom out" style={toolbarBtnStyle}>−</button>
            <button onClick={zoomReset} title="Reset zoom" style={{ ...toolbarBtnStyle, width: 'auto', padding: '0 6px', fontSize: '9px' }}>{Math.round(zoom * 100)}%</button>
            <button onClick={zoomIn} title="Zoom in" style={toolbarBtnStyle}>+</button>
            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit full screen' : 'Full screen'} style={toolbarBtnStyle}>{isFullscreen ? '⤡' : '⛶'}</button>
            <button onClick={captureGraph} title="Capture as PNG" style={toolbarBtnStyle}>📷</button>
          </div>

          {/* ── Floating Column Popup on graph ── */}
          {selectedNode && columnPopupOpen && (
            <div style={{
              position: 'absolute',
              left: pan.x + ((selectedNode.x ?? 0) + NODE_W + 28) * zoom,
              top: pan.y + ((selectedNode.y ?? 0) + 16) * zoom,
              width: 320, maxHeight: 480,
              background: 'var(--surface-muted)', borderRadius: '10px',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 24px rgba(15,23,42,0.10)',
              zIndex: 50,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Popup Header */}
              <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border)' }}>
                <DbTypeIcon tableType={selectedNode.tableType} size={13} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '10px', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedNode.label}</div>
                  <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>
                    {selectedNode.schema} / {selectedNode.label}
                    {selectedNode.rowCount != null ? ` · ${selectedNode.rowCount.toLocaleString()} rows` : ''}
                  </div>
                </div>
                {/* Search toggle */}
                <button onClick={() => setColumnSearch(columnSearch ? '' : ' ')}
                  style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border)', background: columnSearch ? 'var(--surface-muted)' : 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'var(--text-secondary)' }}>🔍</button>
                {/* Status */}
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px' }}>✓</span>
                {/* Close */}
                <button onClick={() => setColumnPopupOpen(false)}
                  style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>✕</button>
              </div>

              {/* Search input (shown when active) */}
              {columnSearch !== '' && (
                <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)' }}>
                  <input
                    autoFocus
                    value={columnSearch.trim() === '' ? '' : columnSearch}
                    onChange={e => setColumnSearch(e.target.value)}
                    placeholder="Search columns..."
                    style={{ width: '100%', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '9px', outline: 'none', background: 'var(--surface)', color: 'var(--foreground)', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              {/* Column list */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {columnsLoading ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '9px' }}>Loading columns...</div>
                ) : filteredColumns && filteredColumns.length > 0 ? filteredColumns.map((col, i) => {
                  const dt = dtIcon(col.DATA_TYPE)
                  const isColSelected = selectedColumn === col.COLUMN_NAME
                  // Only known once this column is actively selected — its lineage is
                  // resolved via columnEdges, not by pre-fetching every other table's columns.
                  const colTableCount = isColSelected ? columnLineage.tables.size : 0
                  return (
                    <div key={i}
                      onClick={() => setSelectedColumn(isColSelected ? null : col.COLUMN_NAME)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '7px',
                        padding: '5px 10px',
                        borderBottom: '1px solid #f1efe9',
                        background: isColSelected ? 'var(--surface-muted)' : (i % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)'),
                        borderLeft: isColSelected ? '3px solid #94a3b8' : '3px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isColSelected) e.currentTarget.style.background = 'var(--surface-muted)' }}
                      onMouseLeave={e => { if (!isColSelected) e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)' }}
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: 4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '9px', fontWeight: 700, color: isColSelected ? '#475569' : dt.color,
                        background: isColSelected ? '#47556914' : dt.color + '12', flexShrink: 0,
                      }}>{dt.symbol}</span>
                      <span style={{
                        flex: 1, fontSize: '10px', fontWeight: isColSelected ? 700 : 500, color: isColSelected ? 'var(--text-secondary)' : 'var(--foreground)', fontFamily: 'monospace',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{col.COLUMN_NAME}</span>
                      {colTableCount > 1 && (
                        <span style={{
                          background: isColSelected ? '#475569' : '#e2e8f0',
                          color: isColSelected ? '#fff' : '#64748b',
                          padding: '1px 5px', borderRadius: '8px', fontSize: '8px', fontWeight: 600, flexShrink: 0,
                        }}>{colTableCount}</span>
                      )}
                      <span style={{ fontSize: '8px', color: col.IS_NULLABLE === 'NO' ? '#16a34a' : '#cbd5e1', flexShrink: 0 }}>
                        {col.IS_NULLABLE === 'NO' ? '●' : '○'}
                      </span>
                    </div>
                  )
                }) : (
                  <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '9px' }}>
                    {columnSearch ? 'No matching columns' : 'No columns available'}
                  </div>
                )}
              </div>

              {/* Column Lineage Panel (when a column is selected) */}
              {selectedColumn && columnLineage.path.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-muted)', padding: '7px 10px', maxHeight: '120px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '9px' }}>🔗</span>
                    <span style={{ fontSize: '8.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      COLUMN LINEAGE: {selectedColumn}
                    </span>
                    <span style={{ fontSize: '8px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      {columnLineage.path.length} table{columnLineage.path.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {columnLineage.path.map((item, i) => {
                      const roleColors: Record<string, { bg: string; color: string; label: string }> = {
                        origin: { bg: '#dcfce7', color: '#16a34a', label: 'ORIGIN' },
                        passthrough: { bg: '#dbeafe', color: '#2563eb', label: 'PASS' },
                        consumer: { bg: '#fef3c7', color: '#d97706', label: 'CONSUMER' },
                        reference: { bg: '#e2e8f0', color: '#475569', label: 'REF' },
                      }
                      const rc = roleColors[item.role] ?? roleColors.reference
                      return (
                        <div key={item.tableId} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {i > 0 && <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>→</span>}
                          {i === 0 && <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>◆</span>}
                          <button
                            onClick={(e) => { e.stopPropagation(); selectNode(item.tableId) }}
                            style={{
                              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '5px',
                              padding: '2px 6px', fontSize: '8.5px', fontWeight: 600, color: 'var(--text-secondary)',
                              cursor: 'pointer', fontFamily: 'monospace',
                            }}
                          >{item.label}</button>
                          <span style={{
                            background: rc.bg, color: rc.color, padding: '1px 4px',
                            borderRadius: '4px', fontSize: '7px', fontWeight: 700,
                          }}>{rc.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Popup Footer */}
              <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
                <div style={{ fontSize: '8px', color: selectedColumn ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  {selectedColumn
                    ? `🔗 ${selectedColumn} flows through ${columnLineage.path.length} tables`
                    : `${columnData?.length ?? 0} columns · click any column for lineage`}
                </div>
              </div>
            </div>
          )}

          <svg
            ref={svgRef}
            width={maxX} height={maxY} viewBox={`0 0 ${maxX} ${maxY}`}
            style={{ display: 'block', minWidth: `${maxX}px`, cursor: isPanning ? 'grabbing' : 'grab' }}
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
          >
            <defs>
              <marker id="arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#cbd5e1" /></marker>
              <marker id="arrow-hl" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#2563eb" /></marker>
              <marker id="arrow-up" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#16a34a" /></marker>
              <marker id="arrow-dn" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#ea580c" /></marker>
              <marker id="arrow-col" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#64748b" /></marker>
              <pattern id="dotted-bg" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                <circle cx="2" cy="2" r="1.1" fill="#d8dce3" />
              </pattern>
            </defs>

            <rect x="0" y="0" width="100%" height="100%" fill="url(#dotted-bg)" />

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* Layer labels at top */}
            {Object.entries(layerLabels).map(([layerStr, label]) => {
              const layer = Number(layerStr)
              const x = 40 + layer * 200 + NODE_W / 2
              return (
                <g key={layerStr}>
                  <text x={x} y={20} textAnchor="middle" fontSize="8" fontWeight="600" fill="#94a3b8" letterSpacing="1.2" fontFamily="system-ui,sans-serif">{label}</text>
                  <line x1={x - 45} y1={28} x2={x + 45} y2={28} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3" />
                </g>
              )
            })}

            {/* Edges */}
            {visibleEdges.map((edge, i) => {
              const from = nodeMap.get(edge.from)
              const to = nodeMap.get(edge.to)
              if (!from || !to) return null
              const fx = (from.x ?? 0) + NODE_W - 4
              const fy = (from.y ?? 0) + NODE_H / 2
              const tx = (to.x ?? 0) + 4
              const ty = (to.y ?? 0) + NODE_H / 2
              const midX = (fx + tx) / 2

              const isUpstream = selected && data.edges.some(e => e.to === selected && e.from === edge.from)
              const isDownstream = selected && data.edges.some(e => e.from === selected && e.to === edge.to)

              return (
                <path key={i}
                  d={`M${fx},${fy} C${midX},${fy} ${midX},${ty} ${tx},${ty}`}
                  fill="none"
                  stroke={isUpstream ? '#16a34a' : isDownstream ? '#ea580c' : '#2563eb'}
                  strokeWidth={2}
                  markerEnd={isUpstream ? 'url(#arrow-up)' : isDownstream ? 'url(#arrow-dn)' : 'url(#arrow-hl)'}
                  opacity={1}
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
              const fy = (from.y ?? 0) + NODE_H / 2 + 7
              const tx = (to.x ?? 0) + 4
              const ty = (to.y ?? 0) + NODE_H / 2 + 7
              const midX = (fx + tx) / 2
              return (
                <g key={`col-edge-${i}`}>
                  {/* Glow effect */}
                  <path
                    d={`M${fx},${fy} C${midX},${fy} ${midX},${ty} ${tx},${ty}`}
                    fill="none" stroke="#64748b" strokeWidth={6} opacity={0.15}
                  />
                  {/* Main line */}
                  <path
                    d={`M${fx},${fy} C${midX},${fy} ${midX},${ty} ${tx},${ty}`}
                    fill="none" stroke="#64748b" strokeWidth={2.5}
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
              const isInColLineage = selectedColumn ? columnLineage.tables.has(node.id) : false
              const nx = node.x ?? 0
              const ny = node.y ?? 0
              return (
                <g key={node.id} style={{ cursor: 'move' }}
                  onMouseDown={e => handleNodeMouseDown(e, node)}
                  onClick={() => { if (nodeDraggedRef.current) { nodeDraggedRef.current = false; return } selectNode(node.id) }}
                >
                  {/* Column lineage glow ring */}
                  {isInColLineage && (
                    <rect x={nx - 2} y={ny - 2} width={NODE_W + 4} height={NODE_H + 4} rx={8}
                      fill="none" stroke="#64748b" strokeWidth={1.5} opacity={0.5}
                      strokeDasharray="6 3"
                      style={{ animation: 'dashFlow 2s linear infinite' }}
                    />
                  )}
                  <rect x={nx} y={ny} width={NODE_W} height={NODE_H} rx={7}
                    fill={isInColLineage ? '#f1f5f9' : cfg.bg}
                    stroke={isInColLineage ? '#64748b' : isSel ? '#2563eb' : cfg.border}
                    strokeWidth={isInColLineage ? 2 : isSel ? 2 : 1}
                    opacity={1}
                    filter={isInColLineage ? 'drop-shadow(0 0 8px rgba(100,116,139,0.3))' : isSel ? 'drop-shadow(0 0 8px rgba(37,99,235,0.3))' : undefined}
                    style={{ transition: 'all 0.2s' }}
                  />
                  <g opacity={1}>
                    <DbTypeIcon tableType={node.tableType} size={12} x={nx + 8} y={ny + 11} />
                  </g>
                  <text x={nx + 24} y={ny + 18} fontSize="7" fontWeight={isSel || isInColLineage ? 700 : 600} fill={isInColLineage ? '#475569' : cfg.color} opacity={1} fontFamily="system-ui,sans-serif">
                    {node.label.length > 18 ? node.label.slice(0, 16) + '…' : node.label}
                  </text>
                  <text x={nx + 24} y={ny + 31} fontSize="6" fill={isInColLineage ? '#64748b' : cfg.color} opacity={0.55} fontFamily="system-ui,sans-serif">
                    {node.rowCount ? `${node.rowCount.toLocaleString()} rows · ` : ''}{node.sub}
                  </text>
                  {/* Column lineage badge on node */}
                  {isInColLineage && (
                    <g>
                      <rect x={nx + NODE_W - 30} y={ny + NODE_H - 13} width={26} height={10} rx={5} fill="#64748b" />
                      <text x={nx + NODE_W - 17} y={ny + NODE_H - 6} textAnchor="middle" fontSize="6" fill="#fff" fontWeight="700" fontFamily="system-ui,sans-serif">COL</text>
                    </g>
                  )}
                  {node.rowCount != null && !isInColLineage && (
                    <circle cx={nx + NODE_W - 8} cy={ny + 10} r={3.5} fill="#16a34a" opacity={0.8} />
                  )}
                </g>
              )
            })}
            </g>
          </svg>
        </div>
      )}

      {/* ── Full-width Detail Panel (below graph, matching Data-Quality reference) ── */}
      {selectedNode && (
        <div style={{
          marginTop: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
          overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}>
          {/* Panel Header */}
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: (typeConfig[selectedNode.type] ?? typeConfig.warehouse).bg,
                border: `2px solid ${(typeConfig[selectedNode.type] ?? typeConfig.warehouse).border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px',
              }}><DbTypeIcon tableType={selectedNode.tableType} size={22} /></div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--foreground)' }}>{selectedNode.label}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{selectedNode.schema} · {tableTypeLabel(selectedNode.tableType)}</div>
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
                background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '32px', height: '32px',
                borderRadius: '8px', cursor: 'pointer', fontSize: '16px', color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>
          </div>

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
                    background: severityConfig[impactStats.severity].bg,
                    color: severityConfig[impactStats.severity].color,
                    fontSize: '8px', fontWeight: 700, marginRight: 4,
                  }}>{impactStats.total}</span>
                )}
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'chains' && (
            <>
          {/* Upstream / Downstream chains */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderBottom: '1px solid var(--border)' }}>
            {/* Upstream */}
            <div style={{ padding: '16px 24px', borderRight: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>⬆ UPSTREAM CHAIN ({totalUpstream})</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{upstreamChain.length} hop{upstreamChain.length !== 1 ? 's' : ''} to source</div>
              </div>
              {upstreamChain.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Root node — no upstream dependencies</div>
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
                          <DbTypeIcon tableType={n.tableType} size={13} />
                          {n.label}
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{cfg.label}</span>
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
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{downstreamChain.length} hop{downstreamChain.length !== 1 ? 's' : ''} to leaf</div>
              </div>
              {downstreamChain.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Terminal node — no downstream consumers</div>
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
                          <DbTypeIcon tableType={n.tableType} size={13} />
                          {n.label}
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{cfg.label}</span>
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
            <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface-muted)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <span style={{ fontSize: '9px' }}>🔗</span>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)' }}>COLUMN LINEAGE: {selectedColumn}</span>
                  <span style={{
                    background: '#64748b', color: '#fff', padding: '1px 7px',
                    borderRadius: '20px', fontSize: '8px', fontWeight: 600,
                  }}>{columnLineage.path.length} tables</span>
                </div>
                <button onClick={() => setSelectedColumn(null)} style={{
                  background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '3px 8px',
                  borderRadius: '5px', fontSize: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500,
                }}>✕ Clear</button>
              </div>

              {/* Column flow visualization */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
                padding: '8px 10px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)',
              }}>
                {columnLineage.path.map((item, i) => {
                  const roleColors: Record<string, { bg: string; color: string; border: string; label: string }> = {
                    origin: { bg: '#dcfce7', color: '#16a34a', border: '#86efac', label: '🟢 ORIGIN' },
                    passthrough: { bg: '#dbeafe', color: '#2563eb', border: '#93c5fd', label: '🔵 PASS-THROUGH' },
                    consumer: { bg: '#fef3c7', color: '#d97706', border: '#fcd34d', label: '🟡 CONSUMER' },
                    reference: { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0', label: '⚪ REFERENCE' },
                  }
                  const rc = roleColors[item.role] ?? roleColors.reference
                  const isCurrentTable = item.tableId === selected
                  return (
                    <div key={item.tableId} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {i > 0 && (
                        <svg width="18" height="9"><path d="M0,4.5 L13,4.5 M10,1.5 L13,4.5 L10,7.5" fill="none" stroke="#94a3b8" strokeWidth="1.5" /></svg>
                      )}
                      <button
                        onClick={() => selectNode(item.tableId)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                          padding: '5px 10px', borderRadius: '8px',
                          border: isCurrentTable ? '2px solid #64748b' : `1px solid ${rc.border}`,
                          background: isCurrentTable ? '#e2e8f0' : rc.bg,
                          cursor: 'pointer',
                          boxShadow: isCurrentTable ? '0 0 0 2px #cbd5e1' : 'none',
                        }}
                      >
                        <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--foreground)', fontFamily: 'monospace' }}>{item.label}</span>
                        <span style={{ fontSize: '7px', fontWeight: 600, color: rc.color }}>{rc.label}</span>
                        <span style={{ fontSize: '7px', color: '#64748b', fontFamily: 'monospace' }}>{selectedColumn}</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
            {selected && (
              <div style={{ padding: '0 24px 16px' }}>
                <EntityComments entityType="asset" entityId={selected} />
              </div>
            )}
            </>
          )}

          {activeTab === 'columns' && (
          <div style={{ padding: '12px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ fontSize: '9px' }}>📋</span>
                <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--foreground)' }}>COLUMNS ({columnData?.length ?? 0})</span>
                <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{nullableCount} nullable · {notNullCount} NOT NULL</span>
              </div>
              <input value={columnSearch} onChange={e => setColumnSearch(e.target.value)}
                placeholder={`Search columns in ${selectedNode.label}...`}
                style={{
                  padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)',
                  fontSize: '9px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none', width: '220px',
                }} />
            </div>

            {columnsLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '9px' }}>Loading columns...</div>
            ) : (
              <div style={{ borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 90px 80px 60px 1fr', gap: '0', padding: '5px 12px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                  {['#', 'COLUMN', 'TYPE', 'NULLABLE', 'LINEAGE', 'PATH'].map(h => (
                    <div key={h} style={{ fontSize: '7px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</div>
                  ))}
                </div>
                {/* Rows */}
                {filteredColumns && filteredColumns.length > 0 ? filteredColumns.map((col, i) => {
                  const dt = dtIcon(col.DATA_TYPE)
                  const isPK = col.ORDINAL_POSITION === 1 && col.IS_NULLABLE === 'NO'
                  const isColSel = selectedColumn === col.COLUMN_NAME
                  const colTableCount = isColSel ? columnLineage.tables.size : 0
                  return (
                    <div key={i}
                      onClick={() => setSelectedColumn(isColSel ? null : col.COLUMN_NAME)}
                      style={{
                        display: 'grid', gridTemplateColumns: '34px 1fr 90px 80px 60px 1fr', gap: '0',
                        padding: '5px 12px', borderBottom: '1px solid #f8f6f0',
                        background: isColSel ? 'var(--surface-muted)' : (i % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)'),
                        borderLeft: isColSel ? '3px solid #94a3b8' : '3px solid transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isColSel) e.currentTarget.style.background = 'var(--surface-muted)' }}
                      onMouseLeave={e => { if (!isColSel) e.currentTarget.style.background = isColSel ? 'var(--surface-muted)' : (i % 2 === 0 ? 'var(--surface)' : 'var(--surface-muted)') }}
                    >
                      <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{col.ORDINAL_POSITION}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        {isPK && <span style={{ fontSize: '8px' }}>🔑</span>}
                        <span style={{ fontWeight: isPK || isColSel ? 700 : 500, fontSize: '9px', color: isColSel ? 'var(--text-secondary)' : isPK ? '#1d4ed8' : 'var(--foreground)', fontFamily: 'monospace' }}>{col.COLUMN_NAME}</span>
                      </div>
                      <div>
                        <span style={{
                          background: dt.color + '14', color: dt.color, padding: '1px 6px',
                          borderRadius: '4px', fontSize: '8px', fontWeight: 600,
                        }}>{dtLabel(col.DATA_TYPE)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        {col.IS_NULLABLE === 'NO' ? (
                          <span style={{ color: '#16a34a', fontSize: '8px', fontWeight: 600 }}>✓ Not Null</span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '8px' }}>○ Nullable</span>
                        )}
                      </div>
                      <div>
                        {colTableCount > 1 ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                            background: isColSel ? '#64748b' : '#f1f5f9',
                            color: isColSel ? '#fff' : '#475569',
                            padding: '1px 6px', borderRadius: '8px', fontSize: '8px', fontWeight: 600,
                          }}>🔗 {colTableCount}</span>
                        ) : (
                          <span style={{ fontSize: '8px', color: '#cbd5e1' }}>—</span>
                        )}
                      </div>
                      <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {selectedNode.schema}.{selectedNode.label}.{col.COLUMN_NAME}
                      </div>
                    </div>
                  )
                }) : (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '9px' }}>
                    {columnSearch ? 'No matching columns' : 'No columns available'}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

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
                      const hopNum = impactStats.hopNodeMap.get(n.id) ?? 0
                      return (
                        <div key={n.id} onClick={() => selectNode(n.id, true)} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '12px',
                          padding: '10px 14px', borderRadius: '8px',
                          background: 'var(--surface-muted)', border: '1px solid var(--border)',
                          cursor: 'pointer',
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
                            onClick={() => selectNode(n.id, true)}
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

          {/* Footer bar */}
          <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '20px', fontSize: '12px' }}>
              <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>📊 {totalUpstream} total upstream</span>
              <span style={{ color: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px' }}>📉 {totalDownstream} total downstream</span>
              <span style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>⬆ {upstreamChain.length}-hop path to source</span>
            </div>
            <div style={{ fontSize: '8px', color: selectedColumn ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
              {selectedColumn ? `🔗 Showing lineage for ${selectedColumn}` : 'Click any column to see its lineage'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LineagePage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <LineageInner />
    </Suspense>
  )
}
