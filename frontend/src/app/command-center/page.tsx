'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/apiFetch'

interface Incident {
  incident_id: string
  title: string
  severity: string
  status: string
  created_at: string | null
}

interface AlertItem {
  alert_id?: string
  id?: string
  name?: string
  title?: string
  severity?: string
  status?: string
  fired_at?: string | null
  created_at?: string | null
}

interface SLAItem {
  sla_id?: string
  name?: string
  asset_name?: string
  status?: string
  compliance_pct?: number
}

interface ScanJob {
  job_id: string
  job_name: string
  last_run_status: string | null
  last_run_at: string | null
}

const SEV_COLOR: Record<string, string> = {
  critical: '#dc2626', high: '#f97316', medium: '#eab308', low: '#22c55e',
}
const SEV_BG: Record<string, string> = {
  critical: '#fef2f2', high: '#fff7ed', medium: '#fefce8', low: '#f0fdf4',
}
const STATUS_COLOR: Record<string, string> = {
  open: '#dc2626', investigating: '#f97316', resolved: '#22c55e', closed: '#6b7280',
  firing: '#dc2626', suppressed: '#6b7280', active: '#22c55e', inactive: '#6b7280',
  ok: '#22c55e', at_risk: '#eab308', breached: '#dc2626',
  succeeded: '#22c55e', failed: '#dc2626', running: '#3b82f6', queued: '#6b7280',
}

function StatusBadge({ label, status }: { label: string; status: string }) {
  const color = STATUS_COLOR[status?.toLowerCase()] ?? '#6b7280'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12,
      fontSize: 11, fontWeight: 600,
      background: `${color}18`, color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return '—'
  try {
    return new Date(dt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return dt }
}

function Card({ title, count, sub, href, color }: { title: string; count: number; sub: string; href: string; color: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '20px 24px', cursor: 'pointer', transition: 'box-shadow 0.15s',
      }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = 'none')}
      >
        <div style={{ fontSize: 28, fontWeight: 800, color }}>{count}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginTop: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>
      </div>
    </Link>
  )
}

export default function CommandCenter() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [slas, setSLAs] = useState<SLAItem[]>([])
  const [scanJobs, setScanJobs] = useState<ScanJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.allSettled([
      apiFetch('/api/incidents').then(r => r.json()),
      apiFetch('/api/alerts').then(r => r.json()),
      apiFetch('/api/slas').then(r => r.json()),
      apiFetch('/api/scan-jobs').then(r => r.json()),
    ]).then(([inc, alr, sla, scn]) => {
      if (inc.status === 'fulfilled') {
        const items = Array.isArray(inc.value) ? inc.value : (inc.value?.items ?? [])
        setIncidents(items)
      }
      if (alr.status === 'fulfilled') {
        const items = Array.isArray(alr.value) ? alr.value : (alr.value?.items ?? [])
        setAlerts(items)
      }
      if (sla.status === 'fulfilled') {
        const items = Array.isArray(sla.value) ? sla.value : (sla.value?.items ?? [])
        setSLAs(items)
      }
      if (scn.status === 'fulfilled') {
        const items = Array.isArray(scn.value) ? scn.value : (scn.value?.items ?? [])
        setScanJobs(items)
      }
    }).finally(() => setLoading(false))
  }, [])

  const openIncidents = incidents.filter(i => i.status !== 'resolved' && i.status !== 'closed')
  const criticalIncidents = openIncidents.filter(i => i.severity === 'critical')
  const firingAlerts = alerts.filter(a => a.status === 'firing')
  const breachedSLAs = slas.filter(s => s.status === 'breached')
  const failedJobs = scanJobs.filter(j => j.last_run_status === 'failed')

  return (
    <div style={{ paddingLeft: 88, paddingTop: 72, minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Command Center
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Live operational overview across incidents, alerts, SLAs, and jobs
          </p>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
              <Card title="Open Incidents" count={openIncidents.length} sub={`${criticalIncidents.length} critical`} href="/incidents" color="#dc2626" />
              <Card title="Firing Alerts" count={firingAlerts.length} sub="requiring attention" href="/alerts" color="#f97316" />
              <Card title="Breached SLAs" count={breachedSLAs.length} sub="out of SLA bounds" href="/slas" color="#eab308" />
              <Card title="Failed Jobs" count={failedJobs.length} sub="in last run" href="/scan-jobs" color="#6b7280" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

              {/* Open Incidents */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>Open Incidents</span>
                  <Link href="/incidents" style={{ fontSize: 11, color: 'var(--brand-primary)', textDecoration: 'none' }}>View all</Link>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {openIncidents.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No open incidents</div>
                  ) : openIncidents.slice(0, 10).map(inc => (
                    <div key={inc.incident_id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--surface-muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: SEV_COLOR[inc.severity] ?? '#6b7280',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{fmt(inc.created_at)}</div>
                      </div>
                      <StatusBadge label={inc.status} status={inc.status} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Firing Alerts */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>Active Alerts</span>
                  <Link href="/alerts" style={{ fontSize: 11, color: 'var(--brand-primary)', textDecoration: 'none' }}>View all</Link>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {firingAlerts.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No firing alerts</div>
                  ) : firingAlerts.slice(0, 10).map((a, i) => (
                    <div key={a.alert_id ?? a.id ?? i} style={{ padding: '12px 20px', borderBottom: '1px solid var(--surface-muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: SEV_COLOR[a.severity ?? ''] ?? '#6b7280',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name ?? a.title ?? 'Alert'}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{fmt(a.fired_at ?? a.created_at)}</div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: SEV_COLOR[a.severity ?? ''] ?? '#6b7280', background: SEV_BG[a.severity ?? ''] ?? '#f3f4f6', padding: '2px 6px', borderRadius: 6 }}>
                        {a.severity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SLA Status */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>SLA Tracker</span>
                  <Link href="/slas" style={{ fontSize: 11, color: 'var(--brand-primary)', textDecoration: 'none' }}>View all</Link>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {slas.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No SLAs configured</div>
                  ) : slas.slice(0, 10).map((s, i) => (
                    <div key={s.sla_id ?? i} style={{ padding: '12px 20px', borderBottom: '1px solid var(--surface-muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name ?? s.asset_name ?? 'SLA'}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                          {s.compliance_pct != null ? `${s.compliance_pct.toFixed(1)}% compliance` : ''}
                        </div>
                      </div>
                      <StatusBadge label={s.status ?? 'unknown'} status={s.status ?? ''} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Scan Jobs */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>Recent Scan Jobs</span>
                  <Link href="/scan-jobs" style={{ fontSize: 11, color: 'var(--brand-primary)', textDecoration: 'none' }}>View all</Link>
                </div>
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {scanJobs.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No scan jobs</div>
                  ) : scanJobs.slice(0, 10).map(j => (
                    <div key={j.job_id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--surface-muted)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.job_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{fmt(j.last_run_at)}</div>
                      </div>
                      {j.last_run_status && (
                        <StatusBadge label={j.last_run_status} status={j.last_run_status} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </div>
  )
}
