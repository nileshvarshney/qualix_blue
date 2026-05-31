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

type Filter = 'all' | 'healthy' | 'at-risk' | 'critical'

export default function CatalogPage() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    fetch('/api/catalog')
      .then(r => r.json())
      .then(data => { setAssets(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = assets.filter(a => {
    if (search && !a.asset_name.toLowerCase().includes(search.toLowerCase()) &&
        !(a.sf_table_name || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const statCards = [
    { key: 'all' as Filter, label: 'Total Assets', value: assets.length, icon: '📦', color: '#475569', border: '#e2e8f0', activeBg: '#f8fafc' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Analytics platform</span></div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Data Catalog</h1>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
          {filtered.length} of {assets.length} assets
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map(s => (
          <div key={s.key} style={{ background: '#fff', border: `2px solid ${s.border}`, borderRadius: '12px', padding: '16px 20px' }}>
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{s.icon}</div>
            <div style={{ fontSize: '26px', fontWeight: 800, color: '#1a1a1a' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a' }} />
      </div>

      {/* Asset list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            No assets yet
          </div>
        ) : filtered.map(a => (
          <div key={a.asset_id} style={{
            background: '#fff', border: '1.5px solid #e2e8f0',
            borderRadius: '14px', padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 700, color: '#1a1a1a', fontSize: '14px', fontFamily: 'monospace' }}>{a.asset_name}</span>
                  {a.is_active !== false && (
                    <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>Active</span>
                  )}
                </div>
                {(a.sf_schema_name || a.sf_database_name) && (
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                    {[a.sf_database_name, a.sf_schema_name, a.sf_table_name].filter(Boolean).join('.')}
                  </div>
                )}
              </div>
            </div>
            {a.created_at && (
              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '8px' }}>
                Added: {new Date(a.created_at).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
