'use client'
import { useState, useEffect } from 'react'

type AnomalyStatus = 'open' | 'resolved'
type Severity = 'critical' | 'high' | 'medium' | 'low'
type FilterType = 'all' | 'critical' | 'open' | 'resolved'

interface AssetInfo {
  asset_id: string
  connection_name: string
  sf_database_name: string
  sf_schema_name: string
  sf_table_name: string
  domain_name: string
}

interface Anomaly {
  id: string
  assetId: string
  table: string
  schema: string
  database: string
  column: string
  type: string
  severity: Severity
  detected: string
  observedValue: string
  expectedRange: string
  confidence: number
  status: AnomalyStatus
  connection: string
  domain: string
}

const SEV: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  high:     { bg: '#fff7ed', color: '#ea580c', border: '#fdba74' },
  medium:   { bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
  low:      { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
}
const ST: Record<string, { background: string; color: string }> = {
  open:     { background: '#fee2e2', color: '#dc2626' },
  resolved: { background: '#f0fdf4', color: '#16a34a' },
}
const TYPE_LABEL: Record<string, string> = {
  quality_forecast:     'Quality Forecast',
  quality_score_anomaly:'Score Anomaly',
  zscore:               'Z-Score',
  volume_spike:         'Volume Spike',
  null_rate:            'Null Rate',
  value_drift:          'Value Drift',
  schema_change:        'Schema Change',
  distribution_shift:   'Distribution Shift',
  freshness:            'Freshness',
  cardinality:          'Cardinality',
}

function fmtType(t: string) {
  return TYPE_LABEL[t] ?? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function mapDetection(d: Record<string, unknown>, assetMap: Record<string, AssetInfo>): Anomaly {
  const asset = assetMap[String(d.asset_id ?? '')] ?? null
  return {
    id:            String(d.detection_id ?? d.id ?? ''),
    assetId:       String(d.asset_id ?? ''),
    table:         asset?.sf_table_name ?? String(d.asset_name ?? d.table_name ?? d.sf_table_name ?? '—'),
    schema:        asset?.sf_schema_name ?? '',
    database:      asset?.sf_database_name ?? '',
    column:        String(d.column_name ?? '—'),
    type:          String(d.anomaly_type ?? d.detector_type ?? 'Unknown'),
    severity:      (d.severity as Severity) ?? 'medium',
    detected:      String(d.detected_at ?? d.created_at ?? '').replace('T', ' ').slice(0, 16),
    observedValue: String(d.observed_value ?? d.observed ?? '—'),
    expectedRange: String(d.expected_range ?? d.baseline ?? '—'),
    confidence:    typeof d.confidence === 'number' ? d.confidence : 0,
    status:        d.is_acknowledged ? 'resolved' : ((d.status as AnomalyStatus) ?? 'open'),
    connection:    asset?.connection_name ?? String(d.connection_name ?? '—'),
    domain:        asset?.domain_name ?? String(d.domain_name ?? '—'),
  }
}

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<FilterType>('all')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [search, setSearch]       = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/anomalies', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      fetch('/api/catalog',   { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
    ])
      .then(([raw, catalog]) => {
        const items  = (Array.isArray(raw) ? raw : ((raw as Record<string, unknown>).items ?? [])) as Record<string, unknown>[]
        const assets = (Array.isArray(catalog) ? catalog : ((catalog as Record<string, unknown>).items ?? [])) as AssetInfo[]
        const assetMap = Object.fromEntries(assets.map(a => [a.asset_id, a]))
        setAnomalies(items.map(d => mapDetection(d, assetMap)))
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
    const q = search.toLowerCase()
    const matchSearch = q === '' ||
      a.table.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q) ||
      a.observedValue.toLowerCase().includes(q) ||
      a.connection.toLowerCase().includes(q) ||
      a.domain.toLowerCase().includes(q)
    return matchFilter && matchSearch
  })

  const CARDS = [
    { key: 'all'      as FilterType, label: 'Total',    value: total,    color: 'var(--accent)'            },
    { key: 'critical' as FilterType, label: 'Critical',  value: critical,  color: 'var(--status-error-text)' },
    { key: 'open'     as FilterType, label: 'Open',      value: open,      color: '#ea580c'                  },
    { key: 'resolved' as FilterType, label: 'Resolved',  value: resolved,  color: 'var(--status-ok-text)'    },
  ]

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Anomalies</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${total} detected · ${critical} critical · ${open} open`}
          </div>
        </div>
        {!loading && critical > 0 && (
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
              <div style={{ fontSize: '20px', fontWeight: 700, color: on ? '#fff' : s.color, lineHeight: 1 }}>{loading ? '…' : s.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by table, type, observed value, connection, or domain…"
        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none', flexShrink: 0, width: '100%', boxSizing: 'border-box' }} />

      {/* column headers */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '4px 72px 180px 110px 1fr 1fr 80px 72px 24px', gap: '0 8px', padding: '0 8px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['', 'Severity', 'Table', 'Type', 'Observed', 'Expected', 'Confidence', 'Status', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading anomalies…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            {anomalies.length === 0 ? 'No anomalies detected — run detectors to start monitoring' : 'No anomalies match your filters'}
          </div>
        )}

        {!loading && filtered.map(a => {
          const sc     = SEV[a.severity] ?? SEV.medium
          const st     = ST[a.status]    ?? ST.open
          const isOpen = expanded === a.id
          const pct    = Math.round(a.confidence * 100)
          const tablePath = [a.database, a.schema, a.table].filter(Boolean).join('.')

          return (
            <div key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
              {/* row */}
              <div
                onClick={() => setExpanded(isOpen ? null : a.id)}
                title={tablePath || a.assetId}
                style={{ display: 'grid', gridTemplateColumns: '4px 72px 180px 110px 1fr 1fr 80px 72px 24px', gap: '0 8px', alignItems: 'center', padding: '6px 8px', background: isOpen ? 'var(--surface-muted)' : 'transparent', cursor: 'pointer', minHeight: '32px' }}
              >
                {/* severity bar */}
                <div style={{ width: '4px', alignSelf: 'stretch', background: sc.color, borderRadius: '2px', minHeight: '18px' }} />

                {/* severity badge */}
                <span style={{ background: sc.bg, color: sc.color, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                  {a.severity}
                </span>

                {/* table name */}
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.table !== '—' ? a.table : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontFamily: 'sans-serif' }}>unknown asset</span>}
                  </div>
                  {(a.schema || a.connection !== '—') && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[a.connection, a.schema].filter(s => s && s !== '—').join(' · ')}
                    </div>
                  )}
                </div>

                {/* type */}
                <span style={{ fontSize: '11px', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fmtType(a.type)}
                </span>

                {/* observed */}
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.observedValue}>
                  {a.observedValue}
                </span>

                {/* expected */}
                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.expectedRange}>
                  {a.expectedRange}
                </span>

                {/* confidence */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? sc.color : pct >= 50 ? '#ea580c' : '#64748b', borderRadius: '2px' }} />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '28px', textAlign: 'right' }}>{pct}%</span>
                </div>

                {/* status */}
                <span style={{ ...st, padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'center' }}>
                  {a.status}
                </span>

                {/* expand */}
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
              </div>

              {/* expanded detail */}
              {isOpen && (
                <div style={{ background: 'var(--surface-muted)', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* meta strip */}
                  <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {[
                      { label: 'Connection', value: a.connection },
                      { label: 'Domain',     value: a.domain },
                      { label: 'Column',     value: a.column !== '—' ? a.column : '—' },
                      { label: 'Confidence', value: `${pct}%` },
                      { label: 'Detected',   value: a.detected },
                    ].map((m, i) => (
                      <div key={i} style={{ flex: 1, padding: '8px 12px', borderRight: i < 4 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{m.label}</div>
                        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* observed vs expected */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: '8px', padding: '10px 14px' }}>
                      <div style={{ fontSize: '10px', color: sc.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Observed</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', wordBreak: 'break-all' }}>{a.observedValue}</div>
                    </div>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Expected Range</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', wordBreak: 'break-all' }}>{a.expectedRange}</div>
                    </div>
                  </div>

                  {/* asset path */}
                  {tablePath && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>Path: </span>{tablePath}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
