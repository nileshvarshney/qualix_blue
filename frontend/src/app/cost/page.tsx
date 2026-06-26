'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface CostOverview {
  total_cost_impact: number
  total_failed_rows: number
  asset_count: number
  currency: string
}

interface DomainCost {
  domain_id?: string
  domain_name?: string
  name?: string
  total_cost_impact: number
  total_failed_rows: number
  asset_count?: number
}

interface TopTable {
  asset_id: string
  asset_name?: string
  physical_name?: string
  total_cost_impact: number
  total_failed_rows: number
}

function fmt(n: number | null | undefined, currency = 'USD'): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

export default function CostPage() {
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [overview, setOverview] = useState<CostOverview | null>(null)
  const [byDomain, setByDomain] = useState<DomainCost[]>([])
  const [topTables, setTopTables] = useState<TopTable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    setLoading(true)
    const connSuffix = activeConnectionId ? `&connection_id=${activeConnectionId}` : ''
    Promise.allSettled([
      apiFetch(`/api/cost?endpoint=overview${connSuffix}`).then(r => r.json()),
      apiFetch(`/api/cost?endpoint=by-domain${connSuffix}`).then(r => r.json()),
      apiFetch(`/api/cost?endpoint=top-tables${connSuffix}`).then(r => r.json()),
    ]).then(([ov, dom, top]) => {
      if (ov.status === 'fulfilled' && ov.value) setOverview(ov.value)
      if (dom.status === 'fulfilled') {
        const items = Array.isArray(dom.value) ? dom.value : (dom.value?.items ?? [])
        setByDomain(items)
      }
      if (top.status === 'fulfilled') {
        const items = Array.isArray(top.value) ? top.value : (top.value?.items ?? [])
        setTopTables(items)
      }
    }).finally(() => setLoading(false))
  }, [activeConnectionId])

  const currency = overview?.currency ?? 'USD'
  const maxDomainCost = byDomain.length > 0 ? Math.max(...byDomain.map(d => d.total_cost_impact ?? 0)) : 1

  return (
    <div style={{ paddingLeft: 88, paddingTop: 72, minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Cost & Resources</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Quality cost impact — financial value of data quality failures across domains and assets
          </p>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* Overview KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
              {[
                { label: 'Total Cost Impact', value: fmt(overview?.total_cost_impact, currency), sub: 'from data quality failures', color: '#dc2626' },
                { label: 'Failed Rows', value: fmtNum(overview?.total_failed_rows), sub: 'rows failing quality checks', color: '#f97316' },
                { label: 'Affected Assets', value: fmtNum(overview?.asset_count), sub: 'assets with quality issues', color: '#6b7280' },
              ].map(k => (
                <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginTop: 2 }}>{k.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

              {/* Cost by Domain */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>Cost Impact by Domain</span>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  {byDomain.length === 0 ? (
                    <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', padding: '24px 0' }}>
                      No domain cost data. Configure cost-per-failed-row in asset settings.
                    </div>
                  ) : byDomain.sort((a, b) => (b.total_cost_impact ?? 0) - (a.total_cost_impact ?? 0)).map((d, i) => {
                    const pct = maxDomainCost > 0 ? ((d.total_cost_impact ?? 0) / maxDomainCost) * 100 : 0
                    return (
                      <div key={d.domain_id ?? i} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
                            {d.domain_name ?? d.name ?? 'Unknown Domain'}
                          </span>
                          <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>
                            {fmt(d.total_cost_impact, currency)}
                          </span>
                        </div>
                        <div style={{ height: 6, background: 'var(--surface-muted)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--brand-primary)', borderRadius: 3, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {fmtNum(d.total_failed_rows)} failed rows
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Top Tables by Cost */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>Top Assets by Cost Impact</span>
                </div>
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {topTables.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                      No asset cost data available
                    </div>
                  ) : topTables.slice(0, 15).map((t, i) => (
                    <div key={t.asset_id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--surface-muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.asset_name ?? t.physical_name ?? t.asset_id}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          {fmtNum(t.total_failed_rows)} failed rows
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', flexShrink: 0 }}>
                        {fmt(t.total_cost_impact, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {byDomain.length === 0 && topTables.length === 0 && (
              <div style={{ marginTop: 24, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '32px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>
                  No cost data configured yet
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 400, margin: '0 auto' }}>
                  Set a cost_per_failed_row on individual assets in the catalog to start tracking financial impact of data quality failures.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
