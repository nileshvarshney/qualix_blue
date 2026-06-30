'use client'
import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from 'react'
import { Database, Layers, Table2, Eye, Server, FileText, List } from 'lucide-react'
import { SensitivityBadge } from '@/components/asset-registry/SensitivityBadge'
import { apiFetch } from '@/lib/apiFetch'

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

function getTypeIcon(assetType: string) {
  const s = { flexShrink: 0 as const, color: 'var(--text-secondary)' }
  const sm = { flexShrink: 0 as const, color: 'var(--text-muted)' }
  switch (assetType) {
    case 'source': return <Server size={13} style={s} />
    case 'database': return <Database size={13} style={s} />
    case 'schema': return <Layers size={12} style={sm} />
    case 'table': return <Table2 size={12} style={sm} />
    case 'view': return <Eye size={12} style={sm} />
    case 'file': return <FileText size={12} style={sm} />
    case 'column': return <List size={11} style={sm} />
    default: return <Database size={12} style={sm} />
  }
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

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const n of nodes) {
    if (n.asset_id === id) return n
    const found = findNode(n.children, id)
    if (found) return found
  }
  return null
}

function NodeRow({
  node, depth, onSelect, selectedId, onToggle, sensitivities,
}: {
  node: TreeNode; depth: number; onSelect: (id: string) => void
  selectedId: string | null; onToggle: (id: string) => void
  sensitivities: Record<string, { classification: string | null; count: number }>
}) {
  const isSelected = node.asset_id === selectedId
  const canExpand = node.asset_type !== 'column'
  const label = node.display_name || node.physical_name || node.asset_id
  const dot = STATUS_DOT[node.status] ?? '#94a3b8'
  const isSource = node.asset_type === 'source'
  const isDatabase = node.asset_type === 'database'
  const isSchema = node.asset_type === 'schema'
  const defaultBg = isSource ? 'var(--surface)' : 'transparent'

  return (
    <div>
      <div
        onClick={() => { onSelect(node.asset_id); if (canExpand) onToggle(node.asset_id) }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-muted)' }}
        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'var(--accent-bg)' : defaultBg }}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px',
          paddingTop: isSource ? '6px' : '4px',
          paddingBottom: isSource ? '6px' : '4px',
          cursor: 'pointer', userSelect: 'none',
          borderBottom: isSource ? '1px solid var(--border)' : '1px solid var(--surface-muted)',
          background: isSelected ? 'var(--accent-bg)' : defaultBg,
          color: isSelected ? 'var(--accent)' : 'var(--foreground)',
        }}
      >
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '10px', flexShrink: 0 }}>
          {canExpand ? (node._expanded ? '▼' : '▶') : ''}
        </span>
        {getTypeIcon(node.asset_type)}
        <span style={{
          fontFamily: (isSource || isDatabase || isSchema) ? 'monospace' : 'inherit',
          fontSize: isSource ? '12px' : isDatabase ? '11.5px' : '11px',
          fontWeight: isSource ? 700 : isDatabase ? 700 : isSchema ? 600 : 500,
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <SensitivityBadge classification={sensitivities[node.asset_id]?.classification} />
      </div>
      {node._expanded && node.children.map(child => (
        <NodeRow key={child.asset_id} node={child} depth={depth + 1}
          onSelect={onSelect} selectedId={selectedId} onToggle={onToggle}
          sensitivities={sensitivities} />
      ))}
    </div>
  )
}

const ACTIVE_CONN_KEY = 'qualix-active-conn'

function getStoredConnId(): string | null {
  try { return localStorage.getItem(ACTIVE_CONN_KEY) } catch { return null }
}

export interface AssetTreePanelHandle {
  refresh: () => void
}

const AssetTreePanel = forwardRef<AssetTreePanelHandle, {
  onSelect: (id: string) => void; selectedId: string | null; initialSearch?: string; onSearchChange?: (q: string) => void
}>(function AssetTreePanel({ onSelect, selectedId, initialSearch, onSearchChange }, ref) {
  const [roots, setRoots] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialSearch ?? '')
  const [searchResults, setSearchResults] = useState<TreeNode[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [sourceId, setSourceId] = useState<string | null>(() => getStoredConnId())
  const [sensitivities, setSensitivities] = useState<Record<string, { classification: string | null; count: number }>>({})
  const sensLoaded = useRef(false)

  const fetchTree = useCallback((connId: string | null) => {
    setLoading(true)
    const url = connId
      ? `/api/asset-registry/tree?depth=2&source_id=${encodeURIComponent(connId)}`
      : '/api/asset-registry/tree?depth=2'
    apiFetch(url)
      .then(r => r.json())
      .then(data => { setRoots(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchTree(sourceId)
  }, [sourceId, fetchTree])

  useEffect(() => {
    function onConnChanged(e: Event) {
      const id = (e as CustomEvent).detail as string | null ?? getStoredConnId()
      setSourceId(id)
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    sensLoaded.current = false
    if (sensLoaded.current) return
    function collectLeafIds(nodes: TreeNode[]): string[] {
      const ids: string[] = []
      for (const n of nodes) {
        if (n.asset_type === 'table' || n.asset_type === 'view') ids.push(n.asset_id)
        if (n.children?.length > 0) ids.push(...collectLeafIds(n.children))
      }
      return ids
    }
    const ids = collectLeafIds(roots)
    if (ids.length === 0) return
    sensLoaded.current = true
    apiFetch('/api/catalog/sensitivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_ids: ids }),
    })
      .then(r => r.json())
      .then(data => {
        if (data && typeof data === 'object') {
          setSensitivities(data as Record<string, { classification: string | null; count: number }>)
        }
      })
      .catch(() => {})
  }, [roots])

  const toggleNode = useCallback((assetId: string) => {
    setRoots(prev => {
      const node = findNode(prev, assetId)
      if (!node) return prev
      if (!node._loaded && !node._expanded) {
        apiFetch(`/api/asset-registry/${assetId}/children`)
          .then(r => r.json())
          .then(children => {
            // Leaf nodes (e.g. columns) come back from the API without a `children`
            // field at all — normalize so every node in the tree always has an array.
            const normalized: TreeNode[] = (Array.isArray(children) ? children : [])
              .map((c: TreeNode) => ({ ...c, children: c.children ?? [] }))
            setRoots(p => updateNodeInTree(p, assetId, {
              _loaded: true, _expanded: true,
              children: normalized,
            }))
          })
        return updateNodeInTree(prev, assetId, { _expanded: true })
      }
      return updateNodeInTree(prev, assetId, { _expanded: !node._expanded })
    })
  }, [])

  async function doSearch(q: string, autoSelectIfSingle = false) {
    if (!q.trim()) { setSearchResults(null); return }
    setSearching(true)
    try {
      const res = await apiFetch(`/api/asset-registry/search?q=${encodeURIComponent(q)}&limit=30`)
      const data = await res.json()
      const results: TreeNode[] = Array.isArray(data) ? data : []
      setSearchResults(results)
      if (autoSelectIfSingle && results.length === 1) onSelect(results[0].asset_id)
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (initialSearch) doSearch(initialSearch, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch])

  useImperativeHandle(ref, () => ({
    refresh: () => fetchTree(sourceId),
  }), [fetchTree, sourceId])

  const displayNodes = searchResults ?? roots

  return (
    <div style={{ width: '280px', minWidth: '180px', flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); doSearch(e.target.value); onSearchChange?.(e.target.value) }}
          placeholder="Search assets..."
          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '5px', fontSize: 'var(--text-sm)', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        {(loading || searching) && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {loading ? 'Loading...' : 'Searching...'}
          </div>
        )}
        {!loading && !searching && displayNodes.map(node => (
          <NodeRow key={node.asset_id} node={node} depth={0}
            onSelect={onSelect} selectedId={selectedId} onToggle={toggleNode}
            sensitivities={sensitivities} />
        ))}
        {!loading && !searching && displayNodes.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No assets found</div>
        )}
      </div>
    </div>
  )
})

export default AssetTreePanel
