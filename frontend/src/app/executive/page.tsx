'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiFetch'

interface DashStats { overall_score: number; open_issues: number; sla_adherence: number; datasets_monitored: number }
interface Incident { id: string; title: string; severity: string; status: string; asset: string; created_at: string }
interface AiNarrative { summary?: string; highlights?: string[]; priorities?: string[]; [key: string]: unknown }

export default function ExecutivePage() {
  const [stats, setStats] = useState<DashStats | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [narrative, setNarrative] = useState<AiNarrative | null>(null)
  const [narrativeLoading, setNarrativeLoading] = useState(false)
  const [narrativeError, setNarrativeError] = useState<string | null>(null)

  const generateNarrative = useCallback((currentStats: DashStats, currentIncidents: Incident[]) => {
    setNarrativeLoading(true)
    setNarrativeError(null)
    fetch('/api/ai/executive-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overall_score: currentStats.overall_score,
        open_issues: currentStats.open_issues,
        sla_adherence: currentStats.sla_adherence,
        datasets_monitored: currentStats.datasets_monitored,
        active_incidents: currentStats.open_issues,
        incidents: currentIncidents.map(i => ({ title: i.title, severity: i.severity, status: i.status, asset: i.asset })),
      }),
      cache: 'no-store',
    })
      .then(r => r.json())
      .then(d => setNarrative(d as AiNarrative))
      .catch(e => setNarrativeError(e instanceof Error ? e.message : 'AI summary unavailable'))
      .finally(() => setNarrativeLoading(false))
  }, [])

  useEffect(() => {
    let loadedStats: DashStats | null = null
    let loadedIncidents: Incident[] = []
    let statsReady = false
    let incidentsReady = false

    function maybeGenerate() {
      if (statsReady && incidentsReady && loadedStats) {
        generateNarrative(loadedStats, loadedIncidents)
      }
    }

    apiFetch('/api/dashboard')
      .then(r => r.json())
      .then((d: Record<string, unknown>) => {
        loadedStats = {
          overall_score: Number(d.overall_score ?? d.quality_score ?? 0),
          open_issues: Number(d.open_issues ?? 0),
          sla_adherence: Number(d.sla_adherence ?? 0),
          datasets_monitored: Number(d.datasets_monitored ?? 0),
        }
        setStats(loadedStats)
        statsReady = true
        maybeGenerate()
      })
      .catch(() => { statsReady = true; maybeGenerate() })

    fetch('/api/incidents')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        loadedIncidents = (Array.isArray(data) ? data : []).slice(0, 5).map((inc, i) => ({
          id: String(inc.incident_id ?? inc.id ?? i),
          title: String(inc.title ?? inc.description ?? ''),
          severity: String(inc.severity ?? 'medium'),
          status: String(inc.status ?? 'open'),
          asset: String(inc.asset ?? inc.table_name ?? ''),
          created_at: String(inc.created_at ?? ''),
        }))
        setIncidents(loadedIncidents)
        incidentsReady = true
        maybeGenerate()
      })
      .catch(() => { incidentsReady = true; maybeGenerate() })
  }, [generateNarrative])

  const sevColor = (s: string) => s === 'critical' ? '#dc2626' : s === 'high' ? '#d97706' : '#2563eb'

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' as const, gap: '8px', background: 'var(--background)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Executive Dashboard</span>
        {stats && <>
          <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>Quality {stats.overall_score}%</span>
          <span style={{ background: stats.sla_adherence >= 95 ? 'var(--status-ok-bg)' : 'var(--status-warn-bg)', color: stats.sla_adherence >= 95 ? 'var(--status-ok-text)' : 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>SLA {stats.sla_adherence}%</span>
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{stats.open_issues} open issues</span>
          <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{stats.datasets_monitored} datasets</span>
        </>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '10px', flex: 1, minHeight: 0 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', overflow: 'auto' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '8px' }}>Quality Overview</div>
          {stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {[
                { label: 'Overall Quality', value: `${stats.overall_score}%`, color: stats.overall_score >= 90 ? 'var(--status-ok-text)' : 'var(--status-warn-text)' },
                { label: 'Open Issues', value: stats.open_issues, color: stats.open_issues > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)' },
                { label: 'SLA Adherence', value: `${stats.sla_adherence}%`, color: stats.sla_adherence >= 95 ? 'var(--status-ok-text)' : 'var(--status-warn-text)' },
                { label: 'Datasets Monitored', value: stats.datasets_monitored, color: 'var(--accent)' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--surface-muted)', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color }}>{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '30px', textAlign: 'center' as const, color: 'var(--text-muted)', fontSize: '11px' }}>Loading…</div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px', flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)' }}>Active Incidents</div>
              <Link href="/incidents" style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>View all →</Link>
            </div>
            {incidents.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center' as const, color: 'var(--text-muted)', fontSize: '11px' }}>No active incidents</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {incidents.map(inc => (
                  <div key={inc.id} style={{ padding: '7px 10px', background: 'var(--surface-muted)', borderRadius: '6px', borderLeft: `3px solid ${sevColor(inc.severity)}` }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', marginBottom: '2px' }}>{inc.title}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{inc.asset} · {inc.status}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Narrative Panel */}
      <div style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', border: '1px solid #93c5fd', borderRadius: '10px', padding: '14px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ fontSize: '16px' }}>🤖</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>AI Weekly Summary</span>
            <span style={{ fontSize: '10px', color: '#3b82f6', background: '#dbeafe', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>AI Generated</span>
          </div>
          {stats && (
            <button
              onClick={() => generateNarrative(stats, incidents)}
              disabled={narrativeLoading}
              style={{ fontSize: '10px', padding: '3px 10px', borderRadius: '5px', border: '1px solid #93c5fd', background: 'transparent', color: '#1d4ed8', cursor: 'pointer', opacity: narrativeLoading ? 0.6 : 1 }}
            >
              {narrativeLoading ? '…' : '↺ Regenerate'}
            </button>
          )}
        </div>
        {narrativeLoading && <div style={{ fontSize: '12.5px', color: '#3b82f6' }}>Generating executive summary…</div>}
        {narrativeError && <div style={{ fontSize: '12.5px', color: 'var(--status-error-text)' }}>{narrativeError}</div>}
        {!narrativeLoading && !narrativeError && narrative && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {narrative.summary && (
              <p style={{ margin: 0, fontSize: '13px', color: '#1e3a5f', lineHeight: '1.7' }}>{narrative.summary}</p>
            )}
            {Array.isArray(narrative.highlights) && narrative.highlights.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '4px' }}>Key Highlights</div>
                <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {narrative.highlights.map((h, i) => <li key={i} style={{ fontSize: '12.5px', color: '#1e3a5f', lineHeight: '1.6' }}>{h}</li>)}
                </ul>
              </div>
            )}
            {Array.isArray(narrative.priorities) && narrative.priorities.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '4px' }}>Top Priorities This Week</div>
                <ol style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {narrative.priorities.map((p, i) => <li key={i} style={{ fontSize: '12.5px', color: '#1e3a5f', lineHeight: '1.6' }}>{p}</li>)}
                </ol>
              </div>
            )}
            {!narrative.summary && !Array.isArray(narrative.highlights) && !Array.isArray(narrative.priorities) && (
              <div style={{ fontSize: '12.5px', color: '#3b82f6' }}>Summary generated — check the response structure from your AI backend.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
