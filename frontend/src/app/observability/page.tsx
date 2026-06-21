'use client'
import { useState, useEffect, useCallback } from 'react'
import { useInterval } from '@/hooks/useInterval'

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

  // ── Loaders (each independent) ─────────────────────────────────────────────

  const loadFreshness = useCallback(() => {
    fetch('/api/observability/freshness-board', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: FreshnessEntry[]) => {
        setFreshness(d)
        setFreshnessUpdated(new Date())
        setFreshnessLoading(false)
      })
      .catch(() => {
        setFreshnessLoading(false)
      })
  }, [])

  const loadPredictions = useCallback(() => {
    fetch('/api/monitoring/sla-predictions?is_at_risk=true', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: SLAPrediction[]) => {
        setPredictions(d)
        setPredictionsUpdated(new Date())
        setPredictionsLoading(false)
      })
      .catch(() => {
        setPredictionsLoading(false)
      })
  }, [])

  const loadHeatmap = useCallback(() => {
    fetch('/api/observability/quality-heatmap', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { domains: [], dates: [], matrix: [] }))
      .then((d: HeatmapData) => {
        setHeatmap(d)
        setHeatmapUpdated(new Date())
        setHeatmapLoading(false)
      })
      .catch(() => {
        setHeatmapLoading(false)
      })
  }, [])

  const loadIncidents = useCallback(() => {
    fetch('/api/monitoring/correlated-incidents', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .then((d: CorrelatedIncident[]) => {
        setIncidents(d)
        setIncidentsUpdated(new Date())
        setIncidentsLoading(false)
      })
      .catch(() => {
        setIncidentsLoading(false)
      })
  }, [])

  // Initial load
  useEffect(() => {
    loadFreshness()
    loadPredictions()
    loadHeatmap()
    loadIncidents()
  }, [loadFreshness, loadPredictions, loadHeatmap, loadIncidents])

  // 30s independent polling for each section
  useInterval(loadFreshness, POLL_MS)
  useInterval(loadPredictions, POLL_MS)
  useInterval(loadHeatmap, POLL_MS)
  useInterval(loadIncidents, POLL_MS)

  // ── Resolve incident ────────────────────────────────────────────────────────

  async function resolveIncident(id: string) {
    setResolvingId(id)
    try {
      await fetch(`/api/monitoring/correlated-incidents/${id}/resolve`, {
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
    </div>
  )
}
