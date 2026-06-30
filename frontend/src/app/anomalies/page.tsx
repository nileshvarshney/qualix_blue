'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import EntityComments from '@/components/EntityComments'
import { apiFetch } from '@/lib/apiFetch'

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
  critical: { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)', border: '#fca5a5' },
  high:     { bg: 'var(--status-warn-bg)',  color: '#ea580c',                  border: '#fdba74' },
  medium:   { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  border: '#fde68a' },
  low:      { bg: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)',    border: '#86efac' },
}
const ST: Record<string, { background: string; color: string }> = {
  open:     { background: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
  resolved: { background: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)'    },
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

function fmtObserved(raw: string): string {
  if (!raw || raw === '—') return raw
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>
      return Object.entries(obj).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ')
    } catch { /* fall through */ }
  }
  const n = Number(raw)
  if (!isNaN(n)) return n % 1 === 0 ? String(n) : String(parseFloat(n.toFixed(4)))
  return raw
}

interface AiExplanation {
  root_cause?: string
  analysis?: string
  summary?: string
  recommendations?: string[]
  business_impact?: string
  [key: string]: unknown
}

function AnomalyContextPanel({ assetId, currentId }: { assetId: string; currentId: string }) {
  const [related, setRelated] = useState<Record<string, unknown>[]>([])
  const [slas, setSlas] = useState<Record<string, unknown>[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!assetId || assetId === '') { setLoaded(true); return }
    Promise.allSettled([
      apiFetch(`/api/anomalies?asset_id=${assetId}&limit=6`).then(r => r.json()),
      apiFetch(`/api/monitoring/sla-predictions?asset_id=${assetId}&limit=4`).then(r => r.json()),
    ]).then(([anomaliesRes, slasRes]) => {
      const anomalies = anomaliesRes.status === 'fulfilled'
        ? (Array.isArray(anomaliesRes.value) ? anomaliesRes.value : (anomaliesRes.value?.items ?? [])) as Record<string, unknown>[]
        : []
      const slaItems = slasRes.status === 'fulfilled'
        ? (Array.isArray(slasRes.value) ? slasRes.value : (slasRes.value?.items ?? [])) as Record<string, unknown>[]
        : []
      setRelated(anomalies.filter((a: Record<string, unknown>) => String(a.detection_id ?? a.id) !== currentId).slice(0, 5))
      setSlas(slaItems.slice(0, 3))
      setLoaded(true)
    })
  }, [assetId, currentId])

  if (!loaded || (related.length === 0 && slas.length === 0)) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {related.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            Historical anomalies on same asset
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {related.map((a, i) => {
              const sev = String(a.severity ?? 'medium')
              const sevColor = sev === 'critical' ? 'var(--status-error-text)' : sev === 'high' ? '#ea580c' : 'var(--status-warn-text)'
              const dt = String(a.detected_at ?? a.created_at ?? '').replace('T', ' ').slice(0, 16)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', padding: '3px 0', borderBottom: '1px solid var(--surface-muted)' }}>
                  <span style={{ color: sevColor, fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', minWidth: '50px' }}>{sev}</span>
                  <span style={{ flex: 1, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(a.anomaly_type ?? a.detector_type ?? '').replace(/_/g, ' ')}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px', whiteSpace: 'nowrap' }}>{dt}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {slas.length > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            At-risk SLAs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {slas.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px' }}>
                <span style={{ color: '#ea580c', fontSize: '12px' }}>⚠</span>
                <span style={{ flex: 1, color: '#7c2d12', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {String(s.sla_name ?? s.name ?? s.asset_name ?? '—')}
                </span>
                <span style={{ color: '#c2410c', fontSize: '10px', fontWeight: 600 }}>
                  {s.breach_probability != null ? `${Math.round(Number(s.breach_probability) * 100)}% risk` : String(s.status ?? '')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AnomalyAiExplanation({ anomalyId }: { anomalyId: string }) {
  const [data, setData] = useState<AiExplanation | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setErr(null)
    apiFetch('/api/ai/explain-anomaly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detection_id: anomalyId }),
      cache: 'no-store',
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('AI analysis unavailable')))
      .then(d => setData(d as AiExplanation))
      .catch(e => setErr(e instanceof Error ? e.message : 'AI analysis unavailable'))
      .finally(() => setLoading(false))
  }, [anomalyId])

  useEffect(() => { load() }, [load])

  const body = data?.root_cause || data?.analysis || data?.summary

  return (
    <div style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #93c5fd', borderRadius: '8px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px' }}>🤖</span>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Failure Explanation</span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #93c5fd', background: 'transparent', color: '#1d4ed8', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? '…' : '↺ Regenerate'}
        </button>
      </div>
      {loading && <div style={{ fontSize: '12px', color: '#3b82f6' }}>Generating AI explanation…</div>}
      {err && <div style={{ fontSize: '12px', color: 'var(--status-error-text)' }}>{err}</div>}
      {!loading && !err && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {body && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Root Cause</div>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#1e3a5f', lineHeight: '1.6' }}>{body}</p>
            </div>
          )}
          {data.business_impact && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Business Impact</div>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#1e3a5f', lineHeight: '1.6' }}>{data.business_impact}</p>
            </div>
          )}
          {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>Recommendations</div>
              <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {data.recommendations.map((r, i) => (
                  <li key={i} style={{ fontSize: '12.5px', color: '#1e3a5f', lineHeight: '1.6' }}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {!body && !data.business_impact && !Array.isArray(data.recommendations) && (
            <div style={{ fontSize: '12px', color: '#3b82f6' }}>Explanation generated — no specific root cause identified.</div>
          )}
        </div>
      )}
    </div>
  )
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
    observedValue: fmtObserved(String(d.observed_value ?? d.observed ?? '—')),
    expectedRange: fmtObserved(String(d.expected_range ?? d.baseline ?? '—')),
    confidence:    typeof d.confidence === 'number' ? d.confidence : 0,
    status:        d.is_acknowledged ? 'resolved' : ((d.status as AnomalyStatus) ?? 'open'),
    connection:    asset?.connection_name ?? String(d.connection_name ?? '—'),
    domain:        asset?.domain_name ?? String(d.domain_name ?? '—'),
  }
}

function AnomaliesInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<FilterType>(() => (searchParams.get('filter') as FilterType) ?? 'all')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [search, setSearch]       = useState(() => searchParams.get('q') ?? '')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  const loadAnomalies = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (activeConnectionId) params.set('connection_id', activeConnectionId)
      const qs = params.toString()
      const [raw, catalog] = await Promise.all([
        apiFetch(qs ? `/api/anomalies?${qs}` : '/api/anomalies', { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
        apiFetch(qs ? `/api/catalog?${qs}` : '/api/catalog',     { cache: 'no-store' }).then(r => r.ok ? r.json() : []),
      ])
      const items  = (Array.isArray(raw) ? raw : ((raw as Record<string, unknown>).items ?? [])) as Record<string, unknown>[]
      const assets = (Array.isArray(catalog) ? catalog : ((catalog as Record<string, unknown>).items ?? [])) as AssetInfo[]
      const assetMap = Object.fromEntries(assets.map(a => [a.asset_id, a]))
      const mapped = items.map(d => mapDetection(d, assetMap))
      const seen = new Set<string>()
      setAnomalies(mapped.filter(a => { if (!a.id || seen.has(a.id)) return false; seen.add(a.id); return true }))
      setLastRefresh(new Date())
    } catch {
      setAnomalies([])
    } finally {
      setLoading(false)
    }
  }, [activeConnectionId])

  useEffect(() => {
    loadAnomalies()
    const interval = setInterval(loadAnomalies, 60_000)
    return () => clearInterval(interval)
  }, [loadAnomalies])

  // Sync filter state to URL so browser back restores it
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (filter !== 'all') params.set('filter', filter)
    const qs = params.toString()
    router.replace(qs ? `/anomalies?${qs}` : '/anomalies', { scroll: false })
  }, [search, filter]) // eslint-disable-line react-hooks/exhaustive-deps

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
            {lastRefresh && !loading && (
              <span style={{ marginLeft: '6px' }}>
                · auto-refresh every 60s · last: {lastRefresh.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => { setLoading(true); loadAnomalies() }} style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            ↺ Refresh
          </button>
          {!loading && critical > 0 && (
            <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              ⚡ {critical} critical · {open} open
            </span>
          )}
        </div>
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
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? sc.color : pct >= 50 ? '#ea580c' : 'var(--text-secondary)', borderRadius: '2px' }} />
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

                  <AnomalyContextPanel assetId={a.assetId} currentId={a.id} />

                  <AnomalyAiExplanation anomalyId={a.id} />

                  <EntityComments entityType="anomaly" entityId={a.id} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AnomaliesPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <AnomaliesInner />
    </Suspense>
  )
}
