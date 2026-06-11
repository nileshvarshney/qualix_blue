'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

type JobStatus = 'active' | 'inactive'
type LastRunStatus = 'completed' | 'failed' | 'running' | 'queued' | 'cancelled' | null
type FilterType = 'all' | 'active' | 'inactive' | 'failed'

interface ScanJob {
  job_id: string
  job_name: string
  job_type: string
  schedule_frequency: string
  cron_expr: string | null
  connection_id: string | null
  connection_name: string | null
  is_active: boolean
  last_run_status: LastRunStatus
  last_run_at: string | null
  created_at: string
}

const RUN_STYLE: Record<string, { background: string; color: string }> = {
  completed:  { background: '#f0fdf4', color: '#16a34a' },
  failed:     { background: '#fee2e2', color: '#dc2626' },
  running:    { background: '#eff6ff', color: '#2563eb' },
  queued:     { background: '#fef3c7', color: '#d97706' },
  cancelled:  { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
}

const JOB_TYPE_LABEL: Record<string, string> = {
  metadata_discovery:       'Metadata Discovery',
  asset_refresh:            'Asset Refresh',
  connection_test:          'Connection Test',
  profile_scan_placeholder: 'Profile Scan',
  rule_scan_placeholder:    'Rule Scan',
  source_health_check:      'Health Check',
}

const FREQ_LABEL: Record<string, string> = {
  on_demand: 'On Demand', hourly: 'Hourly', daily: 'Daily',
  weekly: 'Weekly', monthly: 'Monthly', cron: 'Custom',
}

const GRID = '1fr 140px 90px 90px 100px 90px auto'

export default function ScanJobsPage() {
  const [jobs, setJobs]                   = useState<ScanJob[]>([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState<FilterType>('all')
  const [runningId, setRunningId]         = useState<string | null>(null)
  const [collapsedConns, setCollapsedConns] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/scan-jobs')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: ScanJob[] = (Array.isArray(data) ? data : []).map(j => ({
          job_id:            String(j.job_id ?? j.id ?? ''),
          job_name:          String(j.job_name ?? j.name ?? ''),
          job_type:          String(j.job_type ?? ''),
          schedule_frequency: String(j.schedule_frequency ?? 'on_demand'),
          cron_expr:         j.cron_expr as string | null ?? null,
          connection_id:     j.connection_id as string | null ?? null,
          connection_name:   j.connection_name as string | null ?? String(j.connection_id ?? '(no connection)'),
          is_active:         Boolean(j.is_active ?? true),
          last_run_status:   (j.last_run_status as LastRunStatus) ?? null,
          last_run_at:       j.last_run_at as string | null ?? null,
          created_at:        String(j.created_at ?? ''),
        }))
        setJobs(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const totalActive   = jobs.filter(j => j.is_active).length
  const totalInactive = jobs.filter(j => !j.is_active).length
  const totalFailed   = jobs.filter(j => j.last_run_status === 'failed').length

  const filtered = jobs.filter(j => {
    if (filter === 'active')   return j.is_active
    if (filter === 'inactive') return !j.is_active
    if (filter === 'failed')   return j.last_run_status === 'failed'
    return true
  })

  const byConn = filtered.reduce<Record<string, ScanJob[]>>((acc, j) => {
    const key = j.connection_name ?? j.connection_id ?? '(no connection)'
    ;(acc[key] ??= []).push(j); return acc
  }, {})
  const conns = Object.keys(byConn).sort()

  function toggleConn(c: string) {
    setCollapsedConns(prev => { const s = new Set(prev); s.has(c) ? s.delete(c) : s.add(c); return s })
  }

  function toggleActive(job: ScanJob) {
    setJobs(prev => prev.map(j => j.job_id === job.job_id ? { ...j, is_active: !j.is_active } : j))
    fetch('/api/scan-jobs', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: job.job_id, is_active: !job.is_active }),
    }).catch(() => {})
  }

  function runNow(job: ScanJob) {
    setRunningId(job.job_id)
    fetch(`/api/scan-jobs/${job.job_id}/trigger`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .catch(() => {})
      .finally(() => {
        setRunningId(null)
        setJobs(prev => prev.map(j => j.job_id === job.job_id
          ? { ...j, last_run_status: 'queued', last_run_at: new Date().toISOString() } : j))
      })
  }

  const CARDS = [
    { key: 'all',      label: 'Total',    value: jobs.length,    color: 'var(--accent)' },
    { key: 'active',   label: 'Active',   value: totalActive,    color: 'var(--status-ok-text)' },
    { key: 'inactive', label: 'Inactive', value: totalInactive,  color: 'var(--text-muted)' },
    { key: 'failed',   label: 'Failed',   value: totalFailed,    color: 'var(--status-error-text)' },
  ] as const

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Scan Jobs</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} · ${totalActive} active${totalFailed > 0 ? ` · ${totalFailed} failing` : ''}`}
          </div>
        </div>
        <button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
          + New Job
        </button>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', flexShrink: 0 }}>
        {CARDS.map(c => {
          const on = filter === c.key
          return (
            <div key={c.key} onClick={() => setFilter(p => p === c.key ? 'all' : c.key as FilterType)}
              style={{ background: on ? c.color : 'var(--surface)', border: `1px solid ${on ? c.color : 'var(--border)'}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: on ? '#fff' : c.color, lineHeight: 1 }}>{loading ? '…' : c.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>{c.label}</div>
            </div>
          )
        })}
      </div>

      {/* filter chips */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {(['all', 'active', 'inactive', 'failed'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 12px', borderRadius: '20px', border: '1px solid', fontSize: 'var(--text-xs)', cursor: 'pointer',
            fontWeight: filter === f ? 600 : 400,
            borderColor: filter === f ? 'var(--foreground)' : 'var(--border)',
            background: filter === f ? 'var(--foreground)' : 'var(--surface)',
            color: filter === f ? 'var(--background)' : 'var(--text-secondary)',
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* column header */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', padding: '0 24px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['Job · Type', 'Schedule', 'Last Run', 'Status', 'Created', 'Active', 'Actions'].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable job list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {!loading && jobs.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>No scan jobs yet</div>
            <div style={{ fontSize: 'var(--text-xs)' }}>Create your first scan job to start discovering and monitoring data assets</div>
          </div>
        )}
        {!loading && jobs.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No jobs match the selected filter</div>
        )}

        {!loading && conns.map(conn => {
          const connJobs  = byConn[conn]
          const collapsed = collapsedConns.has(conn)
          const active    = connJobs.filter(j => j.is_active).length
          const failed    = connJobs.filter(j => j.last_run_status === 'failed').length

          return (
            <div key={conn} style={{ marginBottom: '3px' }}>
              <div onClick={() => toggleConn(conn)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-block', transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s', lineHeight: 1, width: '8px', flexShrink: 0 }}>▶</span>
                <span style={{ fontSize: '11px', flexShrink: 0 }}>🔌</span>
                <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{connJobs.length} job{connJobs.length !== 1 ? 's' : ''} · {active} active</span>
                {failed > 0 && <span style={{ fontSize: '10px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{failed} failing</span>}
              </div>

              {!collapsed && (
                <div style={{ marginLeft: '16px', marginBottom: '2px', borderLeft: '2px solid var(--border)' }}>
                  {connJobs.map(job => {
                    const rs = job.last_run_status ? RUN_STYLE[job.last_run_status] ?? RUN_STYLE.queued : null
                    return (
                      <div key={job.job_id}
                        style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '5px 8px', background: 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', minHeight: '32px' }}>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.job_name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{JOB_TYPE_LABEL[job.job_type] ?? job.job_type}</div>
                        </div>

                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {job.cron_expr ?? FREQ_LABEL[job.schedule_frequency] ?? job.schedule_frequency}
                        </span>

                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {job.last_run_at ? new Date(job.last_run_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>

                        <div>
                          {rs && job.last_run_status ? (
                            <span style={{ ...rs, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, display: 'inline-block' }}>
                              {job.last_run_status === 'completed' ? '✓' : job.last_run_status === 'failed' ? '✕' : job.last_run_status === 'running' ? '⏳' : '○'} {job.last_run_status}
                            </span>
                          ) : (
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>—</span>
                          )}
                        </div>

                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {job.created_at ? new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                        </span>

                        <span style={{ fontSize: '10px', fontWeight: 600, color: job.is_active ? 'var(--status-ok-text)' : 'var(--text-muted)' }}>
                          {job.is_active ? '● active' : '○ off'}
                        </span>

                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => runNow(job)} disabled={runningId === job.job_id || !job.is_active}
                            title={!job.is_active ? 'Enable job to run' : 'Trigger run now'}
                            style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid #dbeafe', background: runningId === job.job_id ? '#eff6ff' : 'var(--surface)', color: '#2563eb', fontSize: '10px', cursor: (runningId === job.job_id || !job.is_active) ? 'not-allowed' : 'pointer', opacity: !job.is_active ? 0.5 : 1 }}>
                            {runningId === job.job_id ? '⏳' : '▶'}
                          </button>
                          <button onClick={() => toggleActive(job)}
                            style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
                            {job.is_active ? '⏸' : '▶'}
                          </button>
                          <Link href={`/run-history?job=${job.job_id}`}
                            style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                            Runs
                          </Link>
                        </div>
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
