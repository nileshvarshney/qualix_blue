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

function mapJob(j: Record<string, unknown>, i: number): ScanJob {
  return {
    job_id:             String(j.job_id ?? j.id ?? i),
    job_name:           String(j.job_name ?? j.name ?? ''),
    job_type:           String(j.job_type ?? ''),
    schedule_frequency: String(j.schedule_frequency ?? 'on_demand'),
    cron_expr:          typeof j.cron_expr === 'string' ? j.cron_expr : null,
    connection_id:      typeof j.connection_id === 'string' ? j.connection_id : null,
    connection_name:    typeof j.connection_name === 'string'
                          ? j.connection_name
                          : typeof j.connection_id === 'string'
                            ? j.connection_id
                            : '(no connection)',
    is_active:          Boolean(j.is_active ?? true),
    last_run_status:    (['completed','failed','running','queued','cancelled'] as const)
                          .includes(j.last_run_status as 'completed')
                          ? (j.last_run_status as LastRunStatus)
                          : null,
    last_run_at:        typeof j.last_run_at === 'string' ? j.last_run_at : null,
    created_at:         String(j.created_at ?? ''),
  }
}

export default function ScanJobsPage() {
  const [jobs, setJobs]                   = useState<ScanJob[]>([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState<FilterType>('all')
  const [runningId, setRunningId]         = useState<string | null>(null)
  const [collapsedConns, setCollapsedConns] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate]       = useState(false)
  const [jobForm, setJobForm]             = useState({
    job_name: '', job_type: 'metadata_discovery', connection_id: '',
    schedule_frequency: 'daily', cron_expr: '',
  })
  const [jobSaving, setJobSaving]         = useState(false)
  const [createError, setCreateError]     = useState<string | null>(null)
  const [connOptions, setConnOptions]     = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/scan-jobs')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: ScanJob[] = (Array.isArray(data) ? data : []).map(mapJob)
        setJobs(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setConnOptions((Array.isArray(data) ? data : []).map(c => ({
          id: String(c.connection_id ?? c.id ?? ''),
          name: String(c.connection_name ?? c.name ?? ''),
        })))
      })
      .catch(() => {})
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

  async function createJob() {
    if (!jobForm.job_name) return
    setJobSaving(true)
    try {
      const res = await fetch('/api/scan-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_name: jobForm.job_name,
          job_type: jobForm.job_type,
          connection_id: jobForm.connection_id || null,
          schedule_frequency: jobForm.schedule_frequency,
          cron_expr: jobForm.schedule_frequency === 'cron' ? jobForm.cron_expr : null,
          is_active: true,
        }),
      })
      if (!res.ok) throw new Error(`Failed to create job: ${res.status}`)
      // Re-fetch jobs list after successful create
      const listRes = await fetch('/api/scan-jobs')
      if (!listRes.ok) throw new Error('Failed to reload jobs')
      const data: Record<string, unknown>[] = await listRes.json()
      const items: ScanJob[] = (Array.isArray(data) ? data : []).map(mapJob)
      setJobs(items)
      setShowCreate(false)
      setJobForm({ job_name: '', job_type: 'metadata_discovery', connection_id: '', schedule_frequency: 'daily', cron_expr: '' })
    } catch (err) {
      console.error(err)
      setCreateError('Failed to create job. Please try again.')
    } finally {
      setJobSaving(false)
    }
  }

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
        <button onClick={() => { setShowCreate(true); setCreateError(null) }} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
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

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '440px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>New Scan Job</div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Job Name *</label>
              <input value={jobForm.job_name} onChange={e => setJobForm(p => ({ ...p, job_name: e.target.value }))}
                placeholder="e.g. Daily Snowflake Discovery"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Job Type</label>
              <select value={jobForm.job_type} onChange={e => setJobForm(p => ({ ...p, job_type: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                {Object.entries(JOB_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Connection</label>
              <select value={jobForm.connection_id} onChange={e => setJobForm(p => ({ ...p, connection_id: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                <option value="">— None —</option>
                {connOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Schedule</label>
              <select value={jobForm.schedule_frequency} onChange={e => setJobForm(p => ({ ...p, schedule_frequency: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {jobForm.schedule_frequency === 'cron' && (
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Cron Expression</label>
                <input value={jobForm.cron_expr} onChange={e => setJobForm(p => ({ ...p, cron_expr: e.target.value }))}
                  placeholder="e.g. 0 2 * * *"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }} />
              </div>
            )}
            {createError && (
              <div style={{ fontSize: '11px', color: '#dc2626', background: '#fee2e2', padding: '6px 10px', borderRadius: '6px' }}>
                {createError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCreate(false); setCreateError(null); setJobForm({ job_name: '', job_type: 'metadata_discovery', connection_id: '', schedule_frequency: 'daily', cron_expr: '' }) }}
                style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createJob} disabled={jobSaving || !jobForm.job_name}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (jobSaving || !jobForm.job_name) ? 'not-allowed' : 'pointer', opacity: (jobSaving || !jobForm.job_name) ? 0.6 : 1 }}>
                {jobSaving ? 'Creating…' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
