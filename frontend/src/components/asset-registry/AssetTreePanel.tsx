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
  source: 'S', database: 'D', schema: 'Sc', table: 'T',
  column: 'C', file: 'F', dataset: 'Ds', logical_dataset: 'L',
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
  node, depth, onSelect, selectedId, onToggle,
}: {
  node: TreeNode; depth: number; onSelect: (id: string) => void
  selectedId: string | null; onToggle: (id: string) => void
}) {
  const isSelected = node.asset_id === selectedId
  const canExpand = node.asset_type !== 'column'
  const label = node.display_name || node.physical_name || node.asset_id
  const dot = STATUS_DOT[node.status] ?? '#94a3b8'
  const icon = TYPE_ICON[node.asset_type] ?? '?'

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
          {canExpand ? (node._expanded ? 'v' : '>') : ''}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0, fontWeight: 600, minWidth: '14px' }}>{icon}</span>
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
            onSelect={onSelect} selectedId={selectedId} onToggle={toggleNode} />
        ))}
        {!loading && !searching && displayNodes.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No assets found</div>
        )}
      </div>
    </div>
  )
}
