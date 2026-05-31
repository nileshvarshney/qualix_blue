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

const sevCfg: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  high:     { bg: '#fff7ed', color: '#ea580c', border: '#fdba74' },
  medium:   { bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
  low:      { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
}
const stCfg: Record<string, { bg: string; color: string }> = {
  open:          { bg: '#fee2e2', color: '#dc2626' },
  investigating: { bg: '#fff7ed', color: '#ea580c' },
  resolved:      { bg: '#f0fdf4', color: '#16a34a' },
}
const typeColor: Record<string, string> = {
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
  const [anomalies, setAnomalies]   = useState<Anomaly[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<FilterType>('all')
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [search, setSearch]         = useState('')

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

  const statCards = [
    { key: 'all'      as FilterType, label: 'Total Detected', value: total,    icon: '📡', color: '#6366f1', activeBg: '#6366f1' },
    { key: 'critical' as FilterType, label: 'Critical',       value: critical,  icon: '🔴', color: '#dc2626', activeBg: '#dc2626' },
    { key: 'open'     as FilterType, label: 'Open',           value: open,      icon: '⚠️', color: '#ea580c', activeBg: '#ea580c' },
    { key: 'resolved' as FilterType, label: 'Resolved (7d)',  value: resolved,  icon: '✅', color: '#16a34a', activeBg: '#16a34a' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Anomalies</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>AI-detected data anomalies across all monitored datasets</p>
        </div>
        {critical > 0 && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', color: '#dc2626', fontWeight: 600 }}>
            ⚡ {critical} critical · {open} open
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map(card => {
          const isActive = filter === card.key
          return (
            <div key={card.key} onClick={() => setFilter(isActive && card.key !== 'all' ? 'all' : card.key)}
              style={{
                background: isActive ? card.activeBg : '#fff',
                border: `2px solid ${isActive ? card.activeBg : '#ebe8df'}`,
                borderRadius: '12px', padding: '16px 20px', cursor: 'pointer',
                boxShadow: isActive ? `0 4px 16px ${card.activeBg}40` : 'none',
                transition: 'all 0.18s',
              }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: isActive ? '#fff' : card.color }}>{card.value}</div>
              <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.8)' : '#64748b', marginTop: '2px' }}>{card.label}</div>
              {isActive && card.key !== 'all' && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', marginTop: '3px' }}>Click to clear filter</div>}
            </div>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '16px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by table, type, or description…"
          style={{ width: '100%', padding: '9px 14px', borderRadius: '9px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', boxSizing: 'border-box', outline: 'none' }} />
      </div>

      {filter !== 'all' && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b' }}>Showing:</span>
          <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{filter}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setFilter('all')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>✕ Clear</button>
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '14px', border: '2px dashed #e2e8f0' }}>
            Loading anomalies…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '14px', border: '2px dashed #e2e8f0' }}>
            {anomalies.length === 0 ? 'No anomalies detected — add detectors to start monitoring' : 'No anomalies match your filters'}
          </div>
        ) : filtered.map(a => {
          const sc = sevCfg[a.severity] ?? sevCfg.medium
          const st = stCfg[a.status] ?? stCfg.open
          const tc = typeColor[a.type] || '#64748b'
          const isOpen = expanded === a.id

          return (
            <div key={a.id} style={{
              background: '#fff',
              border: `1.5px solid ${isOpen ? '#6366f1' : a.status === 'resolved' ? '#d1fae5' : sc.border}`,
              borderRadius: '14px', overflow: 'hidden',
              boxShadow: isOpen ? '0 6px 24px rgba(99,102,241,0.13)' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.2s',
            }}>
              <div onClick={() => setExpanded(isOpen ? null : a.id)}
                style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ width: '4px', alignSelf: 'stretch', background: sc.color, borderRadius: '2px', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0, minWidth: '90px' }}>
                  <span style={{ background: sc.bg, color: sc.color, padding: '2px 9px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700 }}>{a.severity}</span>
                  <span style={{ background: `${tc}18`, color: tc, padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 600 }}>{a.type}</span>
                </div>
                <div style={{ minWidth: '160px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#1a1a1a' }}>{a.table}</div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>{a.column} · {a.domain}</div>
                </div>
                <div style={{ flex: 1, fontSize: '13px', color: '#475569', minWidth: 0 }}>{a.description}</div>
                {a.delta && (
                  <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '13px', color: a.delta.startsWith('+') || a.delta === 'REMOVED' ? '#dc2626' : '#ea580c', flexShrink: 0, minWidth: '70px', textAlign: 'center' }}>{a.delta}</div>
                )}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ ...st, padding: '3px 10px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700, display: 'block', marginBottom: '3px' }}>{a.status}</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{a.detected}</span>
                </div>
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0, background: isOpen ? '#6366f1' : '#f1f5f9', color: isOpen ? '#fff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', transition: 'all 0.18s' }}>
                  {isOpen ? '▲' : '▼'}
                </div>
              </div>

              {isOpen && (
                <div style={{ borderTop: '2px solid #f1f5f9', background: '#f8fafd' }}>
                  <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                    {[
                      { label: 'Connection', value: a.connection },
                      { label: 'Domain',     value: a.domain },
                      { label: 'Baseline',   value: a.baseline || '—' },
                      { label: 'Observed',   value: a.observed || '—' },
                      { label: 'Detected',   value: a.detected },
                    ].map((m, i) => (
                      <div key={i} style={{ flex: 1, padding: '10px 16px', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {a.rootCause && (
                      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e0e7ff', overflow: 'hidden' }}>
                        <div style={{ background: 'linear-gradient(90deg, #eef2ff, #f5f3ff)', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>🔍</span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Root Cause</span>
                        </div>
                        <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{a.rootCause}</div>
                      </div>
                    )}
                    {(a.impact || a.recommendation) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        {a.impact && (
                          <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${sc.border}`, overflow: 'hidden' }}>
                            <div style={{ background: sc.bg, padding: '10px 16px', borderBottom: `1px solid ${sc.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px' }}>💥</span>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: sc.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Business Impact</span>
                            </div>
                            <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{a.impact}</div>
                          </div>
                        )}
                        {a.recommendation && (
                          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #bbf7d0', overflow: 'hidden' }}>
                            <div style={{ background: '#f0fdf4', padding: '10px 16px', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '16px' }}>✅</span>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recommended Fix</span>
                            </div>
                            <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{a.recommendation}</div>
                          </div>
                        )}
                      </div>
                    )}
                    {a.affectedModels.length > 0 && (
                      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9eef5', padding: '14px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>🔗 Affected Downstream Models</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {a.affectedModels.map(m => (
                            <code key={m} style={{ background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid #e2e8f0' }}>{m}</code>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <button onClick={() => setExpanded(null)} style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                        ▲ Collapse
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
