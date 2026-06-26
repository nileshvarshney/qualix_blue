'use client'
import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { Database, Layers, Table2, Eye } from 'lucide-react'
import AssetDetailDrawer, { Asset as BaseAsset } from '@/components/asset-registry/AssetDetailDrawer'
import { SensitivityBadge } from '@/components/asset-registry/SensitivityBadge'
import { connectionIcons } from '@/lib/utils'
import { apiFetch } from '@/lib/apiFetch'

type Asset = BaseAsset & {
  quality_score?: number | null
  tag_names?: string[]
}

const critColor = (c?: string) =>
  c === 'high' ? 'var(--status-error-text)' : c === 'medium' ? 'var(--status-warn-text)' : 'var(--text-muted)'
const critBg = (c?: string) =>
  c === 'high' ? 'var(--status-error-bg)' : c === 'medium' ? 'var(--status-warn-bg)' : 'var(--surface-muted)'
const certColor = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-text)' : s === 'deprecated' ? 'var(--status-error-text)' : 'var(--text-muted)'
const certBg = (s?: string) =>
  s === 'certified' ? 'var(--status-ok-bg)' : s === 'deprecated' ? 'var(--status-error-bg)' : 'var(--surface-muted)'
const qualColor = (q?: number | null) =>
  q == null ? 'var(--text-muted)' : q >= 80 ? 'var(--status-ok-text)' : q >= 60 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
const qualBg = (q?: number | null) =>
  q == null ? 'var(--surface-muted)' : q >= 80 ? 'var(--status-ok-bg)' : q >= 60 ? 'var(--status-warn-bg)' : 'var(--status-error-bg)'

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ background: bg, color, padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
      {label}
    </span>
  )
}

function TableRow({ asset, sensitivity, termLinks, selected, onToggleSelect, onClick }: {
  asset: Asset
  sensitivity?: { classification: string | null; count: number }
  termLinks?: { term_id: string; name: string }[]
  selected: boolean
  onToggleSelect: (e: React.MouseEvent) => void
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const isActive = asset.is_active !== false
  const tags = asset.tag_names ?? []

  useEffect(() => {
    if (!popoverOpen) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [popoverOpen])

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 220px 1fr 110px 80px 70px 55px 60px 65px 60px',
        gap: '0 8px',
        alignItems: 'center',
        padding: '4px 8px 4px 8px',
        borderLeft: `2px solid ${selected ? 'var(--accent)' : isActive ? 'var(--status-ok-text)' : 'var(--border)'}`,
        borderBottom: '1px solid var(--surface-muted)',
        background: selected ? 'var(--accent-bg)' : hover ? 'var(--surface-muted)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onClick={onToggleSelect}
        onChange={() => {}}
        style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '14px', height: '14px', flexShrink: 0 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {asset.table_type?.toLowerCase() === 'view'
            ? <Eye size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
            : <Table2 size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
          {asset.sf_table_name ?? '—'}
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: '3px', marginTop: '2px', flexWrap: 'nowrap', overflow: 'hidden' }}>
            {tags.slice(0, 2).map(tag => (
              <span key={tag} style={{ fontSize: '8px', fontWeight: 600, padding: '0 4px', borderRadius: '3px', background: 'var(--accent-bg)', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{tag}</span>
            ))}
            {tags.length > 2 && (
              <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>+{tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {[asset.domain_name, asset.subdomain_name].filter(Boolean).join(' › ') || '—'}
      </span>
      <span style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {asset.owner_name ?? '—'}
      </span>
      <Badge label={asset.certification_status ?? 'uncertified'} bg={certBg(asset.certification_status)} color={certColor(asset.certification_status)} />
      <Badge label={asset.criticality ?? 'low'} bg={critBg(asset.criticality)} color={critColor(asset.criticality)} />
      <span style={{ background: qualBg(asset.quality_score), color: qualColor(asset.quality_score), padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block', textAlign: 'center' }}>
        {asset.quality_score != null ? `${Math.round(asset.quality_score)}%` : '—'}
      </span>
      <Badge label={isActive ? 'Active' : 'Inactive'} bg={isActive ? 'var(--status-ok-bg)' : 'var(--surface-muted)'} color={isActive ? 'var(--status-ok-text)' : 'var(--text-muted)'} />
      <SensitivityBadge classification={sensitivity?.classification} />
      {/* Terms column */}
      <div style={{ position: 'relative' }} ref={popoverRef}>
        {termLinks && termLinks.length > 0 ? (
          <button
            onClick={e => { e.stopPropagation(); setPopoverOpen(o => !o) }}
            style={{
              background: 'var(--accent-bg)', color: 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: '10px',
              fontSize: '9px', fontWeight: 700, padding: '1px 6px',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {termLinks.length} term{termLinks.length > 1 ? 's' : ''}
          </button>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
        )}
        {popoverOpen && termLinks && termLinks.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, zIndex: 200,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            padding: '8px 0', minWidth: '160px',
          }}>
            {termLinks.map(t => (
              <a
                key={t.term_id}
                href={`/glossary?term=${t.term_id}`}
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'block', padding: '5px 12px',
                  fontSize: '11px', color: 'var(--foreground)',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {t.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CatalogInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [popup, setPopup] = useState<Asset | null>(null)
  const [connTypeMap, setConnTypeMap] = useState<Record<string, string>>({})
  const [connections, setConnections] = useState<{ id: string; name: string }[]>([])
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPatch, setBulkPatch] = useState<{
    criticality?: string
    certification_status?: string
    owner_name?: string
    domain_name?: string
    sensitivity?: string
  }>({})
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [aiSearchMode, setAiSearchMode] = useState(false)
  const [aiSearchResults, setAiSearchResults] = useState<Asset[] | null>(null)
  const [aiSearchLoading, setAiSearchLoading] = useState(false)
  const [aiSearchError, setAiSearchError] = useState<string | null>(null)
  const aiDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sensitivities, setSensitivities] = useState<Record<string, { classification: string | null; count: number }>>({})
  const sensLoaded = useRef(false)
  const [termLinks, setTermLinks] = useState<Record<string, { term_id: string; name: string }[]>>({})
  const termLinksLoaded = useRef(false)
  const [domains, setDomains] = useState<string[]>([])

  const runAiSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setAiSearchResults(null); return }
    setAiSearchLoading(true)
    setAiSearchError(null)
    try {
      const res = await fetch('/api/ai/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, entity_types: ['asset', 'table', 'view'], limit: 20 }),
        cache: 'no-store',
      })
      const data = await res.json() as Record<string, unknown>
      const results = Array.isArray(data.results) ? data.results as Record<string, unknown>[] : Array.isArray(data) ? data as Record<string, unknown>[] : []
      const matched = assets.filter(a => results.some(r =>
        String(r.asset_id ?? r.id ?? '') === a.asset_id ||
        String(r.table_name ?? r.sf_table_name ?? '') === (a.sf_table_name ?? '')
      ))
      setAiSearchResults(matched.length > 0 ? matched : null)
    } catch {
      setAiSearchError('AI search unavailable — falling back to keyword search')
      setAiSearchResults(null)
    } finally {
      setAiSearchLoading(false)
    }
  }, [assets])

  function toggleSelect(e: React.MouseEvent, assetId: string) {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }

  async function applyBulk() {
    const patch: Record<string, string> = {}
    if (bulkPatch.criticality) patch.criticality = bulkPatch.criticality
    if (bulkPatch.certification_status) patch.certification_status = bulkPatch.certification_status
    if (bulkPatch.owner_name) patch.owner_name = bulkPatch.owner_name
    if (bulkPatch.domain_name) patch.domain_name = bulkPatch.domain_name
    if (bulkPatch.sensitivity)  patch.sensitivity  = bulkPatch.sensitivity
    if (!Object.keys(patch).length) return
    setBulkApplying(true)
    setBulkError(null)
    try {
      const res = await apiFetch('/api/asset-registry/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_ids: Array.from(selected), patch }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setAssets(prev => prev.map(a =>
        selected.has(a.asset_id) ? { ...a, ...patch } : a
      ))
      setSelected(new Set())
      setBulkPatch({})
    } catch (e: unknown) {
      setBulkError((e as Error).message)
    } finally {
      setBulkApplying(false)
    }
  }

  useEffect(() => {
    apiFetch('/api/connections')
      .then(r => r.json())
      .then((conns: { id: string; name: string; type: string }[]) => {
        if (Array.isArray(conns)) {
          const map: Record<string, string> = {}
          for (const c of conns) if (c.name && c.type) map[c.name] = c.type.toLowerCase()
          setConnTypeMap(map)
          setConnections(conns.map(c => ({ id: c.id, name: c.name })))
        }
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

  useEffect(() => {
    apiFetch('/api/domains')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : []
        setDomains(list.map((d: Record<string, unknown>) => String(d.name ?? d.domain_name ?? '')).filter(Boolean))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const url = activeConnectionId ? `/api/catalog?connection_id=${activeConnectionId}` : '/api/catalog'
    apiFetch(url)
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
        // Fetch sensitivity classifications for all assets (background)
        if (!sensLoaded.current && list.length > 0) {
          sensLoaded.current = true
          const ids = list.map((a: Asset) => a.asset_id)
          apiFetch('/api/catalog/sensitivity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asset_ids: ids }),
          })
            .then(r => r.json())
            .then(data => { if (data && typeof data === 'object') setSensitivities(data as Record<string, { classification: string | null; count: number }>) })
            .catch(() => {})
        }
        // Fetch glossary term links for all assets (background)
        if (!termLinksLoaded.current && list.length > 0) {
          termLinksLoaded.current = true
          const ids = list.map((a: Asset) => a.asset_id).join(',')
          apiFetch(`/api/glossary/bulk-asset-links?asset_ids=${ids}`)
            .then(r => r.json())
            .then(data => {
              if (data && typeof data === 'object') {
                setTermLinks(data as Record<string, { term_id: string; name: string }[]>)
              }
            })
            .catch(() => {})
        }
      })
      .catch(() => setLoading(false))
  }, [activeConnectionId])

  // Sync search to URL so browser back restores it
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    const qs = params.toString()
    router.replace(qs ? `/catalog?${qs}` : '/catalog', { scroll: false })
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (aiSearchMode && aiSearchResults !== null) return aiSearchResults
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
  }, [assets, search, aiSearchMode, aiSearchResults])

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

  function toggleSelectAll() {
    const visibleIds = filtered.map(a => a.asset_id)
    setSelected(prev => {
      if (visibleIds.every(id => prev.has(id))) return new Set()
      return new Set(visibleIds)
    })
  }

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--foreground)' }}>Data Catalog</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>
          {totalTables} tables
        </span>
        <div style={{ flex: 1 }} />
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
            <option value="">All connections</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => { setAiSearchMode(m => !m); setAiSearchResults(null); setAiSearchError(null) }}
            style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', border: `1px solid ${aiSearchMode ? '#7c3aed' : 'var(--border)'}`, background: aiSearchMode ? '#f5f3ff' : 'var(--surface)', color: aiSearchMode ? '#7c3aed' : 'var(--text-muted)', cursor: 'pointer', fontWeight: aiSearchMode ? 700 : 400 }}>
            ✨ AI Search {aiSearchMode ? 'ON' : 'OFF'}
          </button>
          <input
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              if (aiSearchMode) {
                if (aiDebounce.current) clearTimeout(aiDebounce.current)
                aiDebounce.current = setTimeout(() => runAiSearch(e.target.value), 450)
              }
            }}
            placeholder={aiSearchMode ? 'Describe what you\'re looking for…' : 'Search tables, schemas, domains, owners…'}
            style={{ width: '280px', padding: '4px 8px', borderRadius: '5px', border: `1px solid ${aiSearchMode ? '#7c3aed' : 'var(--border)'}`, fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
          />
          {aiSearchLoading && <span style={{ fontSize: '10px', color: '#7c3aed' }}>…</span>}
          {aiSearchError && <span style={{ fontSize: '10px', color: 'var(--status-warn-text)' }}>AI unavailable</span>}
        </div>
      </div>

      {/* column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '28px 220px 1fr 110px 80px 70px 55px 60px 65px 60px', gap: '0 8px', padding: '0 8px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <input
          type="checkbox"
          onChange={toggleSelectAll}
          checked={filtered.length > 0 && filtered.every(a => selected.has(a.asset_id))}
          style={{ cursor: 'pointer', accentColor: 'var(--accent)', width: '14px', height: '14px' }}
        />
        {['Table', 'Domain › Subdomain', 'Owner', 'Certification', 'Criticality', 'Quality', 'Status', 'Sensitivity', 'Terms'].map(h => (
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
                <span style={{ fontSize: '13px' }}>{connectionIcons[connTypeMap[conn]] ?? '🔌'}</span>
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
                      <Database size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
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
                            <Layers size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>{schema}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>{tables.length} tables</span>
                          </div>

                          {schemaOpen && tables.map(a => (
                            <TableRow
                              key={a.asset_id}
                              asset={a}
                              sensitivity={sensitivities[a.asset_id]}
                              termLinks={termLinks[a.asset_id]}
                              selected={selected.has(a.asset_id)}
                              onToggleSelect={e => toggleSelect(e, a.asset_id)}
                              onClick={() => setPopup(a)}
                            />
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

      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: '10px', zIndex: 100,
          minWidth: '560px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
            {selected.size} selected
          </span>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          <select
            value={bulkPatch.criticality ?? ''}
            onChange={e => setBulkPatch(p => ({ ...p, criticality: e.target.value || undefined }))}
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
          >
            <option value="">Criticality…</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={bulkPatch.certification_status ?? ''}
            onChange={e => setBulkPatch(p => ({ ...p, certification_status: e.target.value || undefined }))}
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
          >
            <option value="">Certification…</option>
            <option value="certified">Certified</option>
            <option value="warning">Warning</option>
            <option value="failed">Failed</option>
            <option value="uncertified">Uncertified</option>
          </select>
          <input
            value={bulkPatch.owner_name ?? ''}
            onChange={e => setBulkPatch(p => ({ ...p, owner_name: e.target.value || undefined }))}
            placeholder="Set owner…"
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', width: '120px' }}
          />
          <select
            value={bulkPatch.domain_name ?? ''}
            onChange={e => setBulkPatch(p => ({ ...p, domain_name: e.target.value || undefined }))}
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
          >
            <option value="">Domain…</option>
            {domains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={bulkPatch.sensitivity ?? ''}
            onChange={e => setBulkPatch(p => ({ ...p, sensitivity: e.target.value || undefined }))}
            style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }}
          >
            <option value="">Sensitivity…</option>
            {['PHI', 'PII', 'RESTRICTED', 'CONFIDENTIAL', 'SENSITIVE', 'PUBLIC'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {bulkError && <span style={{ fontSize: '10px', color: 'var(--status-error-text)' }}>{bulkError}</span>}
          <button
            onClick={applyBulk}
            disabled={bulkApplying || !Object.values(bulkPatch).some(Boolean)}
            style={{
              fontSize: '11px', padding: '5px 14px', borderRadius: '6px', border: 'none',
              background: 'var(--accent)', color: '#fff', fontWeight: 700,
              cursor: (bulkApplying || !Object.values(bulkPatch).some(Boolean)) ? 'not-allowed' : 'pointer',
              opacity: (bulkApplying || !Object.values(bulkPatch).some(Boolean)) ? 0.6 : 1,
            }}
          >
            {bulkApplying ? 'Applying…' : 'Apply'}
          </button>
          <button
            onClick={() => { setSelected(new Set()); setBulkPatch({}); setBulkError(null) }}
            style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      )}

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

export default function CatalogPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <CatalogInner />
    </Suspense>
  )
}
