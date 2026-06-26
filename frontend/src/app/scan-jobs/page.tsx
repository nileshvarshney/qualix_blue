'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useInterval } from '@/hooks/useInterval'
import { apiFetch } from '@/lib/apiFetch'

type JobStatus = 'active' | 'inactive'
type LastRunStatus = 'succeeded' | 'partial_success' | 'failed' | 'timed_out' | 'running' | 'queued' | 'cancelled' | null
type FilterType = 'all' | 'active' | 'inactive' | 'failed'

const RUN_STATUSES = ['succeeded', 'partial_success', 'failed', 'timed_out', 'running', 'queued', 'cancelled'] as const

const RUN_ICON: Record<string, string> = {
  succeeded:       '✓',
  partial_success: '⚠',
  failed:          '✕',
  timed_out:       '⏱',
  running:         '⏳',
  queued:          '○',
  cancelled:       '—',
}

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
  last_run_error_message: string | null
  created_at: string
}

const RUN_STYLE: Record<string, { background: string; color: string }> = {
  succeeded:       { background: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)'    },
  partial_success: { background: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
  failed:          { background: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
  timed_out:       { background: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
  running:         { background: 'var(--status-info-bg)',  color: 'var(--status-info-text)'  },
  queued:          { background: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
  cancelled:       { background: 'var(--surface-muted)',   color: 'var(--text-muted)'        },
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

const GRID = '1fr 140px 90px 90px 100px 90px 230px'

interface ErrorInsight { title: string; suggestion: string }

const ERROR_PATTERNS: { pattern: RegExp; title: string; suggestion: string }[] = [
  {
    pattern: /password authentication failed|authentication failed|invalid credentials|access denied for user|incorrect username or password|login failed/i,
    title: 'Authentication failed',
    suggestion: "The stored username or password for this connection was rejected. Edit the connection and re-enter the correct credentials.",
  },
  {
    pattern: /could not connect|connection refused|econnrefused|no route to host|host.*unreachable|name or service not known/i,
    title: 'Could not reach the database',
    suggestion: 'Check that the host and port are correct, the database is running, and any firewall or VPN allows access from this server.',
  },
  {
    pattern: /timed out|timeout/i,
    title: 'Connection timed out',
    suggestion: 'The database took too long to respond. Verify network connectivity, or increase the job timeout if the source is just slow.',
  },
  {
    pattern: /permission denied|insufficient privileges|not authorized|access is denied/i,
    title: 'Permission denied',
    suggestion: "The connection's account lacks the privileges needed for this scan. Grant the required access or use an account with broader permissions.",
  },
  {
    pattern: /does not exist|not found|unknown database|unknown table|no such table|no such database/i,
    title: 'Database object not found',
    suggestion: 'A referenced database, schema, or table may have been renamed or dropped. Re-run discovery or update the job’s configuration.',
  },
  {
    pattern: /ssl|certificate/i,
    title: 'SSL/TLS connection error',
    suggestion: 'Check the SSL settings for this connection (certificate, sslmode) and ensure the database accepts secure connections from this server.',
  },
  {
    pattern: /decrypt|fernet|invalid token/i,
    title: 'Stored credentials could not be read',
    suggestion: 'The saved password for this connection could not be decrypted. Open the connection settings and re-enter the password to save it again.',
  },
  {
    pattern: /driver|module.*not installed|no module named/i,
    title: 'Database driver missing',
    suggestion: "A required database driver isn't installed on the server. Contact your administrator to install the missing dependency.",
  },
  {
    pattern: /rate limit|too many connections|too many requests/i,
    title: 'Rejected by the database',
    suggestion: 'The database rejected the connection, likely due to too many concurrent connections. Try again later or reduce job concurrency.',
  },
]

function classifyError(message: string): ErrorInsight {
  for (const { pattern, title, suggestion } of ERROR_PATTERNS) {
    if (pattern.test(message)) return { title, suggestion }
  }
  return {
    title: 'Scan failed',
    suggestion: 'Review the run logs for the full error details, or contact your administrator if this keeps happening.',
  }
}

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
    last_run_status:    (RUN_STATUSES as readonly string[]).includes(j.last_run_status as string)
                          ? (j.last_run_status as LastRunStatus)
                          : null,
    last_run_at:        typeof j.last_run_at === 'string' ? j.last_run_at : null,
    last_run_error_message: typeof j.last_run_error_message === 'string' ? j.last_run_error_message : null,
    created_at:         String(j.created_at ?? ''),
  }
}

export default function ScanJobsPage() {
  const [jobs, setJobs]                   = useState<ScanJob[]>([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState<FilterType>('all')
  const [runningId, setRunningId]         = useState<string | null>(null)
  const [cancellingId, setCancellingId]   = useState<string | null>(null)
  const [collapsedConns, setCollapsedConns] = useState<Set<string>>(new Set())
  const [expandedJob, setExpandedJob]     = useState<string | null>(null)
  const [showCreate, setShowCreate]       = useState(false)
  const [editingJobId, setEditingJobId]   = useState<string | null>(null)
  const [jobForm, setJobForm]             = useState({
    job_name: '', job_type: 'metadata_discovery', connection_id: '',
    schedule_frequency: 'daily', cron_expr: '',
  })
  const [jobSaving, setJobSaving]         = useState(false)
  const [createError, setCreateError]     = useState<string | null>(null)
  const [connOptions, setConnOptions]     = useState<{ id: string; name: string }[]>([])

  const loadJobs = useCallback((showLoader = false) => {
    if (showLoader) setLoading(true)
    fetch('/api/scan-jobs')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: ScanJob[] = (Array.isArray(data) ? data : []).map(mapJob)
        setJobs(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { loadJobs(true) }, [loadJobs])

  const hasActiveJobs = jobs.some(j => j.last_run_status === 'queued' || j.last_run_status === 'running')
  useInterval(() => loadJobs(), hasActiveJobs ? 5000 : null)

  useEffect(() => {
    apiFetch('/api/connections')
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
  const totalFailed   = jobs.filter(j => j.last_run_status === 'failed' || j.last_run_status === 'timed_out').length

  const filtered = jobs.filter(j => {
    if (filter === 'active')   return j.is_active
    if (filter === 'inactive') return !j.is_active
    if (filter === 'failed')   return j.last_run_status === 'failed' || j.last_run_status === 'timed_out'
    return true
  })

  const byConn = filtered.reduce<Record<string, ScanJob[]>>((acc, j) => {
    const key = j.connection_name ?? j.connection_id ?? '(no connection)'
    ;(acc[key] ??= []).push(j); return acc
  }, {})
  const conns = Object.keys(byConn).sort()

  function openEdit(job: ScanJob) {
    setEditingJobId(job.job_id)
    setJobForm({
      job_name: job.job_name,
      job_type: job.job_type,
      connection_id: job.connection_id ?? '',
      schedule_frequency: job.schedule_frequency,
      cron_expr: job.cron_expr ?? '',
    })
    setCreateError(null)
    setShowCreate(true)
  }

  function closeJobDialog() {
    setShowCreate(false)
    setEditingJobId(null)
    setCreateError(null)
    setJobForm({ job_name: '', job_type: 'metadata_discovery', connection_id: '', schedule_frequency: 'daily', cron_expr: '' })
  }

  async function saveJob() {
    if (!jobForm.job_name) return
    setJobSaving(true)
    try {
      const body = {
        job_name: jobForm.job_name,
        job_type: jobForm.job_type,
        connection_id: jobForm.connection_id || null,
        schedule_frequency: jobForm.schedule_frequency,
        cron_expr: jobForm.schedule_frequency === 'cron' ? jobForm.cron_expr : null,
      }
      const res = editingJobId
        ? await fetch('/api/scan-jobs', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: editingJobId, ...body }),
          })
        : await fetch('/api/scan-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, is_active: true }),
          })
      if (!res.ok) throw new Error(`Failed to save job: ${res.status}`)
      loadJobs()
      closeJobDialog()
    } catch (err) {
      console.error(err)
      setCreateError(editingJobId ? 'Failed to update job. Please try again.' : 'Failed to create job. Please try again.')
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

  function cancelJob(job: ScanJob) {
    setCancellingId(job.job_id)
    fetch(`/api/scan-jobs/${job.job_id}/cancel-latest`, { method: 'POST' })
      .catch(() => {})
      .finally(() => {
        setCancellingId(null)
        setJobs(prev => prev.map(j => j.job_id === job.job_id
          ? { ...j, last_run_status: 'cancelled' } : j))
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
        <button onClick={() => { setEditingJobId(null); setShowCreate(true); setCreateError(null) }} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
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

      {/* column header */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', padding: '0 8px', marginLeft: '18px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
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
                    const hasError = (job.last_run_status === 'failed' || job.last_run_status === 'partial_success' || job.last_run_status === 'timed_out') && !!job.last_run_error_message
                    const isExpanded = expandedJob === job.job_id
                    return (
                      <div key={job.job_id}>
                      <div
                        style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '5px 8px', background: isExpanded ? 'var(--surface-muted)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', minHeight: '32px' }}>

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
                              {RUN_ICON[job.last_run_status] ?? '○'} {job.last_run_status}
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
                          {(job.last_run_status === 'running' || job.last_run_status === 'queued') ? (
                            <button onClick={() => cancelJob(job)} disabled={cancellingId === job.job_id}
                              title="Cancel this run"
                              style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--status-error-text)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '10px', fontWeight: 600, cursor: cancellingId === job.job_id ? 'not-allowed' : 'pointer', opacity: cancellingId === job.job_id ? 0.6 : 1 }}>
                              {cancellingId === job.job_id ? '…' : '✕ Cancel'}
                            </button>
                          ) : (
                            <button onClick={() => runNow(job)} disabled={runningId === job.job_id || !job.is_active}
                              title={!job.is_active ? 'Enable job to run' : 'Trigger run now'}
                              style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: runningId === job.job_id ? 'var(--status-info-bg)' : 'var(--surface)', color: 'var(--status-info-text)', fontSize: '10px', cursor: (runningId === job.job_id || !job.is_active) ? 'not-allowed' : 'pointer', opacity: !job.is_active ? 0.5 : 1 }}>
                              {runningId === job.job_id ? '⏳' : '▶'}
                            </button>
                          )}
                          <button onClick={() => toggleActive(job)}
                            style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
                            {job.is_active ? '⏸' : '▶'}
                          </button>
                          <button onClick={() => openEdit(job)}
                            style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
                            Edit
                          </button>
                          <Link href={`/run-history?job=${job.job_id}`}
                            style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                            History
                          </Link>
                          {hasError && (
                            <button onClick={() => setExpandedJob(isExpanded ? null : job.job_id)}
                              style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: isExpanded ? 'var(--status-error-bg)' : 'var(--surface)', color: 'var(--status-error-text)', fontSize: '10px', cursor: 'pointer', fontWeight: 600 }}>
                              {isExpanded ? 'Hide' : 'View Error'}
                            </button>
                          )}
                        </div>
                      </div>
                      {isExpanded && job.last_run_error_message && (() => {
                        const insight = classifyError(job.last_run_error_message)
                        return (
                          <div style={{ background: 'var(--status-error-bg)', borderBottom: '1px solid var(--border)', padding: '10px 16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-error-text)', marginBottom: '4px' }}>{insight.title}</div>
                            <div style={{ fontSize: '10px', color: 'var(--status-error-text)', marginBottom: '8px' }}>
                              <span style={{ fontWeight: 600 }}>Suggested fix: </span>{insight.suggestion}
                            </div>
                            <details>
                              <summary style={{ fontSize: '10px', color: 'var(--status-error-text)', cursor: 'pointer' }}>Show technical details</summary>
                              <pre style={{ margin: '6px 0 0', fontSize: '10px', color: 'var(--status-error-text)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{job.last_run_error_message}</pre>
                            </details>
                          </div>
                        )
                      })()}
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
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>{editingJobId ? 'Edit Scan Job' : 'New Scan Job'}</div>
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
              <div style={{ fontSize: '11px', color: 'var(--status-error-text)', background: 'var(--status-error-bg)', padding: '6px 10px', borderRadius: '6px' }}>
                {createError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={closeJobDialog}
                style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveJob} disabled={jobSaving || !jobForm.job_name}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (jobSaving || !jobForm.job_name) ? 'not-allowed' : 'pointer', opacity: (jobSaving || !jobForm.job_name) ? 0.6 : 1 }}>
                {jobSaving ? (editingJobId ? 'Saving…' : 'Creating…') : (editingJobId ? 'Save Changes' : 'Create Job')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
