'use client'
import { useState, useEffect } from 'react'

type Asset = {
  asset_id: string
  asset_name: string
  sf_table_name?: string
  sf_schema_name?: string
  sf_database_name?: string
  domain_id?: string
  is_active?: boolean
  created_at?: string
}

type Tab = 'all' | 'active' | 'inactive'

export default function CatalogPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [popup, setPopup] = useState<Asset | null>(null)

  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(data => { setAssets(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const active = assets.filter(a => a.is_active !== false).length
  const inactive = assets.filter(a => a.is_active === false).length

  const filtered = assets.filter(a => {
    if (tab === 'active' && a.is_active === false) return false
    if (tab === 'inactive' && a.is_active !== false) return false
    if (search && !a.asset_name.toLowerCase().includes(search.toLowerCase()) &&
        !(a.sf_table_name || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Catalog</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{assets.length} assets</span>
        {active > 0 && <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{active} active</span>}
        <div style={{ marginLeft: 'auto' }}>
          <button style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>⊞ Import</button>
        </div>
      </div>

      {/* tabs + inline search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        {(['all', 'active', 'inactive'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: tab === t ? '#1a1a1a' : 'var(--surface-muted)',
            color: tab === t ? '#fff' : 'var(--text-secondary)',
            fontWeight: tab === t ? 600 : 400, fontSize: '11px', textTransform: 'capitalize',
          }}>
            {t === 'all' ? `All (${assets.length})` : t === 'active' ? `Active (${active})` : `Inactive (${inactive})`}
          </button>
        ))}
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search assets…"
          style={{ flex: 1, padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', minWidth: '120px' }} />
      </div>

      {/* column headers */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 60px 80px', gap: '0 8px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Asset', 'Location', 'Status', 'Added'].map(h => (
            <span key={h} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            {assets.length === 0 ? 'No assets yet' : 'No assets match filters'}
          </div>
        )}
        {!loading && filtered.map(a => {
          const isActive = a.is_active !== false
          const path = [a.sf_database_name, a.sf_schema_name].filter(Boolean).join('.')
          const added = a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'
          return (
            <div key={a.asset_id} onClick={() => setPopup(a)}
              style={{ display: 'grid', gridTemplateColumns: '1fr 140px 60px 80px', gap: '0 8px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${isActive ? 'var(--status-ok-text)' : 'var(--border)'}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{a.asset_name}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path || '—'}</span>
              <span style={{ background: isActive ? 'var(--status-ok-bg)' : 'var(--surface-muted)', color: isActive ? 'var(--status-ok-text)' : 'var(--text-muted)', padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600 }}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{added}</span>
            </div>
          )
        })}
      </div>

      {/* slide-in detail panel */}
      {popup && (
        <>
          <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1, fontFamily: 'monospace' }}>{popup.asset_name}</span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
              {[['Database', popup.sf_database_name], ['Schema', popup.sf_schema_name], ['Table', popup.sf_table_name]].map(([l, v], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: 'monospace' }}>{v || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
              {[['Status', popup.is_active !== false ? '✅ Active' : '⏸ Inactive'], ['Added', popup.created_at ? new Date(popup.created_at).toLocaleDateString() : '—']].map(([l, v], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v}</div>
                </div>
              ))}
            </div>
            {popup.domain_id && (
              <div style={{ margin: '6px 14px 0', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>Domain</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{popup.domain_id}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
