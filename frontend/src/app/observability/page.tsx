'use client'
import { useState, useEffect, useCallback } from 'react'
import { useInterval } from '@/hooks/useInterval'
import { apiFetch } from '@/lib/apiFetch'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FreshnessEntry {
  rule_id: string
  rule_name: string
  asset_id: string
  last_run_time: string | null
  hours_since_last_run: number | null
  sla_threshold_hours: number
  status: 'on_time' | 'at_risk' | 'breached' | 'unknown'
}

interface SLAPrediction {
  prediction_id: string
  asset_id: string
  predicted_at: string
  breach_day: number | null
  breach_probability: number
  is_at_risk: boolean
  forecast_scores: number[] | null
}

interface HeatmapData {
  domains: { domain_id: string; domain_name: string }[]
  dates: string[]
  matrix: (number | null)[][]
}

interface CorrelatedIncident {
  incident_id: string
  detected_at: string
  window_start: string
  window_end: string
  asset_ids: string[]
  asset_count: number
  severity: string
  status: string
  resolved_at: string | null
}

interface ForecastDay {
  date: string
  projected_score: number
  lower_bound: number
  upper_bound: number
}

interface QualityForecast {
  connection_id: string
  forecast: ForecastDay[]
}

interface RemediateConfig {
  enabled: boolean
  threshold: number
  rule_types: string[]
  last_updated: string | null
}

interface ContinuousConfig {
  connection_id: string; name: string; interval_minutes: number; is_enabled: boolean
  freshness_enabled: boolean; volume_enabled: boolean
  schema_drift_enabled: boolean; distribution_enabled: boolean
  next_check_at: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const POLL_MS = 30_000

function statusColor(status: FreshnessEntry['status']) {
  if (status === 'on_time')  return { bg: 'var(--status-ok-bg)',    text: 'var(--status-ok-text)',    border: '#86efac' }
  if (status === 'at_risk')  return { bg: 'var(--status-warn-bg)',  text: 'var(--status-warn-text)',  border: '#fde68a' }
  if (status === 'breached') return { bg: 'var(--status-error-bg)', text: 'var(--status-error-text)', border: '#fca5a5' }
  return { bg: 'var(--surface)', text: 'var(--text-muted)', border: 'var(--border)' }
}

function heatColor(score: number | null): string {
  if (score === null) return 'var(--surface-muted)'
  if (score >= 90) return '#bbf7d0'
  if (score >= 75) return '#fef08a'
  if (score >= 60) return '#fed7aa'
  return '#fecaca'
}

function severityStyle(s: string) {
  if (s === 'high' || s === 'critical')
    return { bg: 'var(--status-error-bg)', text: 'var(--status-error-text)' }
  return { bg: 'var(--status-warn-bg)', text: 'var(--status-warn-text)' }
}

function fmtTime(iso: string) {
  return iso.replace('T', ' ').slice(0, 16)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StalenessLabel({ updatedAt }: { updatedAt: Date | null }) {
  const [, forceUpdate] = useState(0)
  useInterval(() => forceUpdate(n => n + 1), updatedAt ? 1000 : null)
  if (!updatedAt) return null
  const secs = Math.round((Date.now() - updatedAt.getTime()) / 1000)
  const label = secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`
  return <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>Last updated {label}</span>
}

function SectionHeader({
  title,
  subtitle,
  lastUpdated,
}: {
  title: string
  subtitle?: string
  lastUpdated: Date | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: '10px',
      }}
    >
      <div>
        <span
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--foreground)',
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              marginLeft: '8px',
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      <StalenessLabel updatedAt={lastUpdated} />
    </div>
  )
}

function Skeleton() {
  return (
    <div
      style={{
        height: '64px',
        borderRadius: '8px',
        background: 'var(--surface-muted)',
        border: '1px solid var(--border)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ObservabilityPage() {
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })

  // Freshness Board
  const [freshness, setFreshness] = useState<FreshnessEntry[]>([])
  const [freshnessLoading, setFreshnessLoading] = useState(true)
  const [freshnessUpdated, setFreshnessUpdated] = useState<Date | null>(null)

  // SLA Predictions
  const [predictions, setPredictions] = useState<SLAPrediction[]>([])
  const [predictionsLoading, setPredictionsLoading] = useState(true)
  const [predictionsUpdated, setPredictionsUpdated] = useState<Date | null>(null)

  // Quality Heatmap
  const [heatmap, setHeatmap] = useState<HeatmapData>({ domains: [], dates: [], matrix: [] })
  const [heatmapLoading, setHeatmapLoading] = useState(true)
  const [heatmapUpdated, setHeatmapUpdated] = useState<Date | null>(null)

  // Correlated Incidents
  const [incidents, setIncidents] = useState<CorrelatedIncident[]>([])
  const [incidentsLoading, setIncidentsLoading] = useState(true)
  const [incidentsUpdated, setIncidentsUpdated] = useState<Date | null>(null)

  // Resolve button state
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  // Quality Forecast
  const [forecast, setForecast] = useState<QualityForecast | null>(null)
  const [forecastLoading, setForecastLoading] = useState(true)

  // Auto-remediation config
  const [remConfig, setRemConfig] = useState<RemediateConfig>({ enabled: false, threshold: 80, rule_types: ['null_check', 'freshness', 'volume'], last_updated: null })
  const [remSaving, setRemSaving] = useState(false)
  const [remSaved, setRemSaved] = useState(false)

  // Continuous monitoring config
  const [contConfigs, setContConfigs] = useState<ContinuousConfig[]>([])
  const [contDraft, setContDraft] = useState({
    connection_id: '', interval_minutes: 15, is_enabled: true,
    freshness_enabled: true, volume_enabled: true,
    schema_drift_enabled: true, distribution_enabled: true,
  })
  const [contSaving, setContSaving] = useState(false)
  const [contSaved, setContSaved] = useState(false)

  // ── Connection filter ──────────────────────────────────────────────────────

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  // ── Loaders (each independent) ─────────────────────────────────────────────

  const loadFreshness = useCallback(() => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    apiFetch(`/api/observability/freshness-board${activeConnectionId ? `?${params}` : ''}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: FreshnessEntry[]) => {
        setFreshness(d)
        setFreshnessUpdated(new Date())
        setFreshnessLoading(false)
      })
      .catch(() => {
        setFreshnessLoading(false)
      })
  }, [activeConnectionId])

  const loadPredictions = useCallback(() => {
    apiFetch(`/api/monitoring/sla-predictions?is_at_risk=true${activeConnectionId ? '&connection_id=' + activeConnectionId : ''}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: SLAPrediction[]) => {
        setPredictions(d)
        setPredictionsUpdated(new Date())
        setPredictionsLoading(false)
      })
      .catch(() => {
        setPredictionsLoading(false)
      })
  }, [activeConnectionId])

  const loadHeatmap = useCallback(() => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    apiFetch(`/api/observability/quality-heatmap${activeConnectionId ? `?${params}` : ''}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { domains: [], dates: [], matrix: [] }))
      .then((d: HeatmapData) => {
        setHeatmap(d)
        setHeatmapUpdated(new Date())
        setHeatmapLoading(false)
      })
      .catch(() => {
        setHeatmapLoading(false)
      })
  }, [activeConnectionId])

  const loadIncidents = useCallback(() => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    apiFetch(`/api/monitoring/correlated-incidents${activeConnectionId ? `?${params}` : ''}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: CorrelatedIncident[]) => {
        setIncidents(d)
        setIncidentsUpdated(new Date())
        setIncidentsLoading(false)
      })
      .catch(() => {
        setIncidentsLoading(false)
      })
  }, [activeConnectionId])

  const loadForecast = useCallback(() => {
    apiFetch(`/api/quality/forecast${activeConnectionId ? '?connection_id=' + activeConnectionId : ''}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((d: QualityForecast | null) => { if (d) setForecast(d) })
      .catch(() => {})
      .finally(() => setForecastLoading(false))
  }, [activeConnectionId])

  async function saveRemConfig() {
    setRemSaving(true)
    try {
      const res = await apiFetch('/api/rules/auto-remediate-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(remConfig),
      })
      if (res.ok) { const d = await res.json(); setRemConfig(d) }
      setRemSaved(true)
      setTimeout(() => setRemSaved(false), 2500)
    } finally { setRemSaving(false) }
  }

  async function saveContConfig() {
    if (!contDraft.connection_id) return
    setContSaving(true)
    try {
      const res = await apiFetch('/api/observability/continuous-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contDraft),
      })
      if (res.ok) { const d = await res.json(); setContConfigs(d.connections ?? []) }
      setContSaved(true); setTimeout(() => setContSaved(false), 2500)
    } finally { setContSaving(false) }
  }

  // Initial load
  useEffect(() => {
    loadFreshness()
    loadPredictions()
    loadHeatmap()
    loadIncidents()
    loadForecast()
    apiFetch('/api/rules/auto-remediate-config').then(r => r.ok ? r.json() : null).then(d => { if (d) setRemConfig(d) }).catch(() => {})
    apiFetch('/api/observability/continuous-config', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { connections: [] })
      .then(d => setContConfigs(d.connections ?? []))
      .catch(() => {})
  }, [loadFreshness, loadPredictions, loadHeatmap, loadIncidents, loadForecast])

  // 30s independent polling for each section
  useInterval(loadFreshness, POLL_MS)
  useInterval(loadPredictions, POLL_MS)
  useInterval(loadHeatmap, POLL_MS)
  useInterval(loadIncidents, POLL_MS)

  // ── Resolve incident ────────────────────────────────────────────────────────

  async function resolveIncident(id: string) {
    setResolvingId(id)
    try {
      await apiFetch(`/api/monitoring/correlated-incidents/${id}/resolve`, {
        method: 'POST',
      })
      loadIncidents()
    } catch {
      // silently keep last-good data; updated label shows staleness
    }
    setResolvingId(null)
  }

  // ── Summary counts ──────────────────────────────────────────────────────────

  const breachedCount = freshness.filter(f => f.status === 'breached').length
  const atRiskCount   = freshness.filter(f => f.status === 'at_risk').length

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        padding: '16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        background: 'var(--background)',
        minHeight: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Page header */}
      <div>
        <div
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 700,
            color: 'var(--foreground)',
          }}
        >
          Observability
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginTop: '2px',
          }}
        >
          {freshness.length} assets monitored &middot; {breachedCount} breached &middot; {atRiskCount} at risk &middot; polls every 30s
        </div>
      </div>

      {/* ── Section 1: Freshness Board ── */}
      <div>
        <SectionHeader
          title="Freshness Board"
          subtitle={`${freshness.length} rules`}
          lastUpdated={freshnessUpdated}
        />
        {freshnessLoading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '8px',
            }}
          >
            {[1, 2, 3, 4].map(n => (
              <Skeleton key={n} />
            ))}
          </div>
        ) : freshness.length === 0 ? (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              padding: '20px 0',
            }}
          >
            No freshness rules configured — create{' '}
            <code>freshness_check</code> rules on assets to monitor them.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '8px',
            }}
          >
            {freshness.map(f => {
              const c = statusColor(f.status)
              return (
                <div
                  key={f.rule_id}
                  style={{
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: c.text,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {f.status.replace('_', ' ')}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--foreground)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={f.rule_name}
                  >
                    {f.rule_name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {f.hours_since_last_run !== null
                      ? `${f.hours_since_last_run}h ago / ${f.sla_threshold_hours}h SLA`
                      : 'Never run'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 2: SLA Breach Forecast ── */}
      <div>
        <SectionHeader
          title="SLA Breach Forecast"
          subtitle="next 7 days"
          lastUpdated={predictionsUpdated}
        />
        {predictionsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[1, 2].map(n => (
              <Skeleton key={n} />
            ))}
          </div>
        ) : predictions.length === 0 ? (
          <div
            style={{
              color: 'var(--status-ok-text)',
              background: 'var(--status-ok-bg)',
              border: '1px solid #86efac',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: 'var(--text-xs)',
            }}
          >
            All assets on track for the next 7 days.
          </div>
        ) : (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 90px',
                gap: '0 8px',
                padding: '6px 12px',
                background: 'var(--surface)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {['Asset', 'Breach Day', 'Probability', 'Forecast'].map(h => (
                <span
                  key={h}
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
            {predictions.map(p => (
              <div
                key={p.prediction_id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 80px 90px',
                  gap: '0 8px',
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    color: 'var(--foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.asset_id}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--status-error-text)',
                    fontWeight: 600,
                  }}
                >
                  {p.breach_day !== null ? `Day ${p.breach_day + 1}` : '—'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--foreground)' }}>
                  {Math.round((p.breach_probability ?? 0) * 100)}%
                </span>
                <div
                  style={{
                    display: 'flex',
                    gap: '2px',
                    alignItems: 'flex-end',
                  }}
                >
                  {(p.forecast_scores ?? []).slice(0, 7).map((s, i) => (
                    <div
                      key={i}
                      title={`Day ${i + 1}: ${s}`}
                      style={{
                        width: '10px',
                        height: `${Math.max(4, Math.round(s / 10))}px`,
                        background:
                          s >= 90
                            ? '#86efac'
                            : s >= 75
                            ? '#fde68a'
                            : '#fca5a5',
                        borderRadius: '1px',
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: Quality Heatmap ── */}
      <div>
        <SectionHeader
          title="Quality Heatmap"
          subtitle="7-day domain × date"
          lastUpdated={heatmapUpdated}
        />
        {heatmapLoading ? (
          <Skeleton />
        ) : heatmap.domains.length === 0 ? (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              padding: '20px 0',
            }}
          >
            No domain quality data available.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                fontSize: '11px',
                width: '100%',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      padding: '4px 8px',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    Domain
                  </th>
                  {heatmap.dates.map(d => (
                    <th
                      key={d}
                      style={{
                        padding: '4px 6px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                        minWidth: '44px',
                      }}
                    >
                      {d.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.domains.map((dom, ri) => (
                  <tr key={dom.domain_id}>
                    <td
                      style={{
                        padding: '4px 8px',
                        fontWeight: 600,
                        color: 'var(--foreground)',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {dom.domain_name}
                    </td>
                    {(heatmap.matrix[ri] ?? []).map((score, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '4px 6px',
                          textAlign: 'center',
                          background: heatColor(score),
                          borderBottom: '1px solid var(--border)',
                          borderLeft: '1px solid var(--border)',
                          color: score !== null ? '#374151' : 'var(--text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        {score !== null ? score : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 4: Correlated Incidents ── */}
      <div>
        <SectionHeader
          title="Correlated Incidents"
          subtitle="open incidents"
          lastUpdated={incidentsUpdated}
        />
        {incidentsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[1, 2].map(n => (
              <Skeleton key={n} />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <div
            style={{
              color: 'var(--status-ok-text)',
              background: 'var(--status-ok-bg)',
              border: '1px solid #86efac',
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: 'var(--text-xs)',
            }}
          >
            No correlated incidents detected.
          </div>
        ) : (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            {incidents.map(inc => {
              const sc = severityStyle(inc.severity)
              return (
                <div
                  key={inc.incident_id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <span
                    style={{
                      background: sc.bg,
                      color: sc.text,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {inc.severity}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--foreground)',
                      }}
                    >
                      {inc.asset_count} tables degraded simultaneously
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        marginTop: '2px',
                      }}
                    >
                      {fmtTime(inc.detected_at)} &middot; window{' '}
                      {fmtTime(inc.window_start)} &ndash;{' '}
                      {fmtTime(inc.window_end)}
                    </div>
                  </div>
                  <button
                    onClick={() => resolveIncident(inc.incident_id)}
                    disabled={resolvingId === inc.incident_id}
                    style={{
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11px',
                      cursor:
                        resolvingId === inc.incident_id
                          ? 'not-allowed'
                          : 'pointer',
                      color: 'var(--foreground)',
                      opacity: resolvingId === inc.incident_id ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {resolvingId === inc.incident_id ? 'Resolving…' : 'Resolve'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 5: Predictive Quality Forecast ── */}
      <div>
        <SectionHeader title="Predictive Quality Forecast" subtitle="7-day projection" lastUpdated={null} />
        {forecastLoading ? (
          <Skeleton />
        ) : !forecast || forecast.forecast.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '8px' }}>
            No forecast data available
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 80px', gap: '0 8px', padding: '6px 12px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
              {['Date', 'Confidence Band', 'Lower', 'Upper'].map(h => (
                <span key={h} style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
              ))}
            </div>
            {forecast.forecast.map((day, i) => {
              const pct = Math.max(0, Math.min(100, day.projected_score))
              const barColor = pct >= 90 ? '#86efac' : pct >= 75 ? '#fde68a' : '#fca5a5'
              return (
                <div key={day.date} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 80px', gap: '0 8px', padding: '8px 12px', borderBottom: i < forecast.forecast.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{day.date}</span>
                  <div style={{ position: 'relative', height: '16px', background: 'var(--surface-muted)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: `${day.lower_bound}%`, width: `${day.upper_bound - day.lower_bound}%`, height: '100%', background: barColor, opacity: 0.35, borderRadius: '4px' }} />
                    <div style={{ position: 'absolute', left: `${pct}%`, top: '2px', width: '3px', height: '12px', background: barColor, borderRadius: '2px', transform: 'translateX(-50%)' }} />
                    <span style={{ position: 'absolute', right: '6px', top: '1px', fontSize: '10px', fontWeight: 700, color: 'var(--foreground)' }}>{day.projected_score.toFixed(1)}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{day.lower_bound.toFixed(1)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>{day.upper_bound.toFixed(1)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 6b: Continuous Monitoring Config ── */}
      <div>
        <SectionHeader title="Continuous Monitoring" subtitle="polling intervals per connection" lastUpdated={null} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          {contConfigs.length > 0 && (
            <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {contConfigs.map(c => (
                <div key={c.connection_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--surface-muted)', borderRadius: '6px', opacity: c.is_enabled ? 1 : 0.55 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>{c.name || c.connection_id}</span>
                  {!c.is_enabled && <span style={{ fontSize: '10px', background: 'var(--surface)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>paused</span>}
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>every {c.interval_minutes}m</span>
                  {c.freshness_enabled && <span style={{ fontSize: '10px', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>freshness</span>}
                  {c.volume_enabled && <span style={{ fontSize: '10px', background: 'var(--status-info-bg)', color: 'var(--status-info-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>volume</span>}
                  {c.schema_drift_enabled && <span style={{ fontSize: '10px', background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>schema drift</span>}
                  {c.distribution_enabled && <span style={{ fontSize: '10px', background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>distribution</span>}
                  {c.next_check_at && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>next: {c.next_check_at.slice(11, 16)}</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Add / Update Connection</div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Connection ID</label>
                <input value={contDraft.connection_id} onChange={e => setContDraft(d => ({ ...d, connection_id: e.target.value }))}
                  placeholder="e.g. snowflake-prod"
                  style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none', width: '160px' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>Interval</label>
                <select value={contDraft.interval_minutes} onChange={e => setContDraft(d => ({ ...d, interval_minutes: Number(e.target.value) }))}
                  style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
                  {[5, 15, 30, 60].map(v => <option key={v} value={v}>{v} min</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.freshness_enabled} onChange={e => setContDraft(d => ({ ...d, freshness_enabled: e.target.checked }))} />
                Freshness
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.volume_enabled} onChange={e => setContDraft(d => ({ ...d, volume_enabled: e.target.checked }))} />
                Volume
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.schema_drift_enabled} onChange={e => setContDraft(d => ({ ...d, schema_drift_enabled: e.target.checked }))} />
                Schema Drift
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={contDraft.distribution_enabled} onChange={e => setContDraft(d => ({ ...d, distribution_enabled: e.target.checked }))} />
                Distribution
              </label>
              <button onClick={() => setContDraft(d => ({ ...d, is_enabled: !d.is_enabled }))}
                style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', background: contDraft.is_enabled ? '#16a34a' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                title={contDraft.is_enabled ? 'Enabled — click to pause' : 'Paused — click to resume'}>
                <span style={{ position: 'absolute', top: '2px', left: contDraft.is_enabled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </button>
              <button onClick={saveContConfig} disabled={contSaving || !contDraft.connection_id}
                style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: contDraft.connection_id ? 'pointer' : 'not-allowed', opacity: (!contDraft.connection_id || contSaving) ? 0.6 : 1 }}>
                {contSaving ? 'Saving…' : contSaved ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 6: Auto-Remediation Config ── */}
      <div>
        <SectionHeader title="Auto-Remediation" subtitle="trigger automatic fixes on score drop" lastUpdated={null} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Enable Auto-Remediation</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>When a quality score drops below the threshold, attempt automatic remediation</div>
            </div>
            <button onClick={() => setRemConfig(c => ({ ...c, enabled: !c.enabled }))}
              style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', background: remConfig.enabled ? '#16a34a' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: '3px', left: remConfig.enabled ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
            </button>
          </div>
          {remConfig.enabled && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Score threshold</label>
                <input type="number" min={0} max={100} value={remConfig.threshold}
                  onChange={e => setRemConfig(c => ({ ...c, threshold: Number(e.target.value) }))}
                  style={{ width: '70px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none' }} />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>%  — trigger remediation when score drops below this</span>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '8px' }}>Apply to rule types</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {['null_check', 'freshness', 'volume', 'uniqueness', 'schema_drift', 'distribution_consistency'].map(rt => {
                    const active = remConfig.rule_types.includes(rt)
                    return (
                      <button key={rt} onClick={() => setRemConfig(c => ({ ...c, rule_types: active ? c.rule_types.filter(x => x !== rt) : [...c.rule_types, rt] }))}
                        style={{ padding: '3px 10px', borderRadius: '20px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', fontWeight: active ? 600 : 400 }}>
                        {rt}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={saveRemConfig} disabled={remSaving}
              style={{ padding: '7px 18px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', opacity: remSaving ? 0.7 : 1 }}>
              {remSaving ? 'Saving…' : remSaved ? 'Saved ✓' : 'Save Config'}
            </button>
            {remConfig.last_updated && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Last updated: {remConfig.last_updated.slice(0, 10)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
