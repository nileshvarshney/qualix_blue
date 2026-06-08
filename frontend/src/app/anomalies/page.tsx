'use client'
import { useState, useEffect } from 'react'

type AnomalyStatus = 'open' | 'investigating' | 'resolved'
type Severity = 'critical' | 'high' | 'medium' | 'low'
type FilterType = 'all' | 'critical' | 'open' | 'resolved'

interface Anomaly {
  id: string; table: string; column: string; type: string
  severity: Severity; detected: string; delta: string; description: string
  status: AnomalyStatus; connection: string; domain: string
  rootCause: string; impact: string; recommendation: string
  affectedModels: string[]; baseline: string; observed: string
}

const SEV: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  high:     { bg: '#fff7ed', color: '#ea580c', border: '#fdba74' },
  medium:   { bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
  low:      { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
}
const ST: Record<string, { background: string; color: string }> = {
  open:          { background: '#fee2e2', color: '#dc2626' },
  investigating: { background: '#fff7ed', color: '#ea580c' },
  resolved:      { background: '#f0fdf4', color: '#16a34a' },
}
const TYPE_COLOR: Record<string, string> = {
  'Volume Spike': '#6366f1', 'Null Rate': '#ec4899', 'Value Drift': '#f59e0b',
  'Schema Change': '#ef4444', 'Distribution Shift': '#8b5cf6',
  'Freshness': '#0ea5e9', 'Cardinality': '#14b8a6',
}

function mapDetection(d: Record<string, unknown>): Anomaly {
  return {
    id:             String(d.detection_id ?? d.id ?? ''),
    table:          String(d.asset_name ?? d.table_name ?? d.sf_table_name ?? '—'),
    column:         String(d.column_name ?? d.target_column ?? '—'),
    type:           String(d.anomaly_type ?? d.detector_type ?? 'Unknown'),
    severity:       (d.severity as Severity) ?? 'medium',
    detected:       String(d.detected_at ?? d.created_at ?? '').replace('T', ' ').slice(0, 16),
    delta:          String(d.delta ?? d.deviation ?? ''),
    description:    String(d.description ?? d.summary ?? ''),
    status:         (d.status as AnomalyStatus) ?? 'open',
    connection:     String(d.connection_name ?? '—'),
    domain:         String(d.domain_name ?? '—'),
    rootCause:      String(d.root_cause ?? ''),
    impact:         String(d.impact ?? ''),
    recommendation: String(d.recommendation ?? ''),
    affectedModels: Array.isArray(d.affected_models) ? d.affected_models as string[] : [],
    baseline:       String(d.baseline ?? ''),
    observed:       String(d.observed ?? ''),
  }
}

export default function AnomaliesPage() {
  const [anomalies, setAnomalies]         = useState<Anomaly[]>([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState<FilterType>('all')
  const [expanded, setExpanded]           = useState<string | null>(null)
  const [search, setSearch]               = useState('')
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/anomalies', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => {
        const items = Array.isArray(data) ? data : ((data as Record<string, unknown>).items ?? []) as unknown[]
        setAnomalies((items as Record<string, unknown>[]).map(mapDetection))
      })
      .catch(() => setAnomalies([]))
      .finally(() => setLoading(false))
  }, [])

  const total    = anomalies.length
  const critical = anomalies.filter(a => a.severity === 'critical').length
  const open     = anomalies.filter(a => a.status === 'open').length
  const resolved = anomalies.filter(a => a.status === 'resolved').length

  const filtered = anomalies.filter(a => {
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'critical' ? a.severity === 'critical' :
      filter === 'open'     ? a.status === 'open' :
      filter === 'resolved' ? a.status === 'resolved' : true
    const matchSearch = search === '' ||
      a.table.toLowerCase().includes(search.toLowerCase()) ||
      a.type.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const byType = filtered.reduce<Record<string, Anomaly[]>>((acc, a) => {
    ;(acc[a.type] ??= []).push(a); return acc
  }, {})
  const types = Object.keys(byType).sort((a, b) => byType[b].length - byType[a].length)

  function toggleType(t: string) {
    setCollapsedTypes(prev => { const s = new Set(prev); s.has(t) ? s.delete(t) : s.add(t); return s })
  }

  const CARDS = [
    { key: 'all'      as FilterType, label: 'Total',   value: total,    color: 'var(--accent)'            },
    { key: 'critical' as FilterType, label: 'Critical', value: critical,  color: 'var(--status-error-text)' },
    { key: 'open'     as FilterType, label: 'Open',     value: open,      color: '#ea580c'                  },
    { key: 'resolved' as FilterType, label: 'Resolved', value: resolved,  color: 'var(--status-ok-text)'    },
  ]

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Anomalies</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${total} detected · ${critical} critical · ${open} open`}
          </div>
        </div>
        {critical > 0 && (
          <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            ⚡ {critical} critical · {open} open
          </span>
        )}
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', flexShrink: 0 }}>
        {CARDS.map(s => {
          const on = filter === s.key
          return (
            <div key={s.key} onClick={() => setFilter(p => p === s.key ? 'all' : s.key)}
              style={{ background: on ? s.color : 'var(--surface)', border: `1px solid ${on ? s.color : 'var(--border)'}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: on ? '#fff' : s.color, lineHeight: 1 }}>{loading ? '…' : s.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by table, type, or description…"
        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', flexShrink: 0, width: '100%', boxSizing: 'border-box' }} />

      {/* column header */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '4px 70px 1fr auto auto auto 24px', gap: '0 8px', padding: '0 24px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['', 'Severity', 'Table.Column · Description', 'Delta', 'Status', 'Detected', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list grouped by type */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading anomalies…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {anomalies.length === 0 ? 'No anomalies detected — add detectors to start monitoring' : 'No anomalies match your filters'}
          </div>
        )}

        {!loading && types.map(type => {
          const items    = byType[type]
          const tc       = TYPE_COLOR[type] || '#64748b'
          const collapsed = collapsedTypes.has(type)
          const typeCrit = items.filter(a => a.severity === 'critical').length

          return (
            <div key={type} style={{ marginBottom: '3px' }}>
              {/* type group header */}
              <div onClick={() => toggleType(type)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-block', transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s', lineHeight: 1, width: '8px', flexShrink: 0 }}>▶</span>
                <span style={{ background: `${tc}18`, color: tc, padding: '1px 7px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700, flexShrink: 0 }}>{type}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flex: 1 }}>{items.length} anomal{items.length !== 1 ? 'ies' : 'y'}</span>
                {typeCrit > 0 && (
                  <span style={{ fontSize: '10px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{typeCrit} critical</span>
                )}
              </div>

              {!collapsed && (
                <div style={{ marginLeft: '16px', marginBottom: '2px', borderLeft: '2px solid var(--border)' }}>
                  {items.map(a => {
                    const sc     = SEV[a.severity] ?? SEV.medium
                    const st     = ST[a.status] ?? ST.open
                    const isOpen = expanded === a.id

                    return (
                      <div key={a.id}>
                        {/* single-line row */}
                        <div onClick={() => setExpanded(isOpen ? null : a.id)}
                          style={{ display: 'grid', gridTemplateColumns: '4px 70px 1fr auto auto auto 24px', gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isOpen ? 'var(--surface-muted)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', minHeight: '28px' }}>
                          <div style={{ width: '4px', alignSelf: 'stretch', background: sc.color, borderRadius: '2px', minHeight: '16px' }} />
                          <span style={{ background: sc.bg, color: sc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{a.severity}</span>
                          <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={`${a.table}.${a.column} · ${a.domain} — ${a.description}`}>
                            {a.table}<span style={{ color: 'var(--text-muted)' }}>.{a.column}</span>
                            {a.description && <span style={{ color: 'var(--text-muted)', fontFamily: 'sans-serif', fontSize: '10px' }}> — {a.description}</span>}
                          </span>
                          {a.delta ? (
                            <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: a.delta.startsWith('+') || a.delta === 'REMOVED' ? '#dc2626' : '#ea580c', fontWeight: 700, whiteSpace: 'nowrap' }}>{a.delta}</span>
                          ) : <span />}
                          <span style={{ ...st, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.status}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.detected.slice(5)}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                        </div>

                        {/* expanded detail */}
                        {isOpen && (
                          <div style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                              {[
                                { label: 'Connection', value: a.connection },
                                { label: 'Domain',     value: a.domain },
                                { label: 'Baseline',   value: a.baseline || '—' },
                                { label: 'Observed',   value: a.observed || '—' },
                                { label: 'Detected',   value: a.detected },
                              ].map((m, i) => (
                                <div key={i} style={{ flex: 1, padding: '8px 12px', borderRight: i < 4 ? '1px solid var(--border)' : 'none' }}>
                                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{m.label}</div>
                                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)' }}>{m.value}</div>
                                </div>
                              ))}
                            </div>
                            {a.rootCause && (
                              <div style={{ background: 'var(--surface)', border: '1px solid #e0e7ff', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                <span style={{ color: '#4338ca', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>
                                {a.rootCause}
                              </div>
                            )}
                            {(a.impact || a.recommendation) && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {a.impact && (
                                  <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                    <span style={{ color: sc.color, fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>{a.impact}
                                  </div>
                                )}
                                {a.recommendation && (
                                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                    <span style={{ color: '#15803d', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fix · </span>{a.recommendation}
                                  </div>
                                )}
                              </div>
                            )}
                            {a.affectedModels.length > 0 && (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>Downstream:</span>
                                {a.affectedModels.map(m => (
                                  <code key={m} style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '10.5px', fontFamily: 'monospace', border: '1px solid var(--border)' }}>{m}</code>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
