'use client'
import { useState, useEffect, useMemo } from 'react'

type Asset = {
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
  created_at?: string
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
        // auto-expand all connections and databases by default
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

  // Group: connection → database → schema → [assets]
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
              {/* Connection row */}
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
                    {/* Database row */}
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
                          {/* Schema row */}
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

                          {/* Table rows */}
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

      {/* detail panel */}
      {popup && (
        <>
          <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px,52vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1, fontFamily: 'monospace' }}>{popup.sf_table_name ?? '—'}</span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>

            {/* Location */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
              {([['Connection', popup.connection_name], ['Database', popup.sf_database_name], ['Schema', popup.sf_schema_name]] as [string, string | undefined][]).map(([l, v], i) => (
                <div key={l} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: 'monospace' }}>{v || '—'}</div>
                </div>
              ))}
            </div>

            {/* Governance badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
              <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Status</div>
                <Badge label={popup.is_active !== false ? 'Active' : 'Inactive'} bg={popup.is_active !== false ? 'var(--status-ok-bg)' : 'var(--surface-muted)'} color={popup.is_active !== false ? 'var(--status-ok-text)' : 'var(--text-muted)'} />
              </div>
              <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Criticality</div>
                <Badge label={popup.criticality ?? 'low'} bg={critBg(popup.criticality)} color={critColor(popup.criticality)} />
              </div>
              <div style={{ padding: '6px 8px' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Certification</div>
                <Badge label={popup.certification_status ?? 'uncertified'} bg={certBg(popup.certification_status)} color={certColor(popup.certification_status)} />
              </div>
            </div>

            {/* Domain / Subdomain */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
              <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Domain</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{popup.domain_name ?? '—'}</div>
              </div>
              <div style={{ padding: '6px 8px' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Subdomain</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{popup.subdomain_name ?? '—'}</div>
              </div>
            </div>

            {/* Owners */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
              <div style={{ padding: '6px 8px', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Owner</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{popup.owner_name ?? '—'}</div>
              </div>
              <div style={{ padding: '6px 8px' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Technical Owner</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{popup.technical_owner_name ?? '—'}</div>
              </div>
            </div>

            {/* Description */}
            {popup.table_description && (
              <div style={{ margin: '6px 14px 0', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)', marginBottom: '4px' }}>Description</div>
                <div style={{ fontSize: '11.5px', color: 'var(--foreground)', lineHeight: 1.6 }}>{popup.table_description}</div>
              </div>
            )}

            <div style={{ height: '12px' }} />
          </div>
        </>
      )}
    </div>
  )
}
