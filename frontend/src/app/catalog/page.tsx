'use client'
import { useState, useEffect, useMemo } from 'react'
import { Database, Layers, Table2, Eye } from 'lucide-react'
import AssetDetailDrawer, { Asset } from '@/components/asset-registry/AssetDetailDrawer'
import { connectionIcons } from '@/lib/utils'

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
      <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {asset.table_type?.toLowerCase() === 'view'
          ? <Eye size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
          : <Table2 size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
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
  const [connTypeMap, setConnTypeMap] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then((conns: { name: string; type: string }[]) => {
        if (Array.isArray(conns)) {
          const map: Record<string, string> = {}
          for (const c of conns) if (c.name && c.type) map[c.name] = c.type.toLowerCase()
          setConnTypeMap(map)
        }
      })
      .catch(() => {})
  }, [])

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
