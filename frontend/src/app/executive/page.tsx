'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface DashStats { overall_score: number; open_issues: number; sla_adherence: number; datasets_monitored: number }
interface Incident { id: string; title: string; severity: string; status: string; asset: string; created_at: string }

export default function ExecutivePage() {
  const [stats, setStats] = useState<DashStats | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then((d: Record<string, unknown>) => setStats({
        overall_score: Number(d.overall_score ?? d.quality_score ?? 0),
        open_issues: Number(d.open_issues ?? 0),
        sla_adherence: Number(d.sla_adherence ?? 0),
        datasets_monitored: Number(d.datasets_monitored ?? 0),
      }))
      .catch(() => {})
    fetch('/api/incidents')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setIncidents((Array.isArray(data) ? data : []).slice(0, 5).map((inc, i) => ({
          id: String(inc.incident_id ?? inc.id ?? i),
          title: String(inc.title ?? inc.description ?? ''),
          severity: String(inc.severity ?? 'medium'),
          status: String(inc.status ?? 'open'),
          asset: String(inc.asset ?? inc.table_name ?? ''),
          created_at: String(inc.created_at ?? ''),
        })))
      })
      .catch(() => {})
  }, [])

  const sevColor = (s: string) => s === 'critical' ? '#dc2626' : s === 'high' ? '#d97706' : '#2563eb'

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' as const, gap: '8px', background: 'var(--background)' }}>
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
    </div>
  )
}
