'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import RunDetailPanel from '@/components/shared/RunDetailPanel'
import { apiFetch } from '@/lib/apiFetch'

type RunStatus = 'queued' | 'running' | 'succeeded' | 'partial_success' | 'failed' | 'timed_out' | 'cancelled'
type FilterType = 'all' | 'running' | 'succeeded' | 'failed'

interface Run {
  run_id: string
  job_id: string
  job_name: string
  status: RunStatus
  trigger_type: string
  triggered_by: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string | null
  duration_seconds: number | null
  assets_scanned: number
  errors_count: number
  warnings_count: number
  error_message: string | null
}

function todayLocal(): string {
  const d = new Date()
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10)
}

function dayRange(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

const STATUS_STYLE: Record<RunStatus, { background: string; color: string }> = {
  succeeded:       { background: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)'    },
  partial_success: { background: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
  failed:          { background: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
  timed_out:       { background: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
  running:         { background: 'var(--status-info-bg)',  color: 'var(--status-info-text)'  },
  queued:          { background: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
  cancelled:       { background: 'var(--surface-muted)',   color: 'var(--text-muted)'        },
}

const STATUS_ICON: Record<RunStatus, string> = {
  succeeded: '✓', partial_success: '⚠', failed: '✕', timed_out: '⏱', running: '⏳', queued: '○', cancelled: '—',
}

function fmtDuration(secs: number | null): string {
  if (secs == null) return '—'
  if (secs < 60) return `${Math.round(secs)}s`
  return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const GRID = '1fr 120px 80px 110px 110px 70px 60px 64px'

function RunHistoryInner() {
  const searchParams = useSearchParams()
  const jobFilter    = searchParams.get('job')

  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [runs, setRuns]       = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<FilterType>('all')
  const [logDate, setLogDate] = useState<string>(todayLocal())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<{ jobId: string; runId: string } | null>(null)

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    setLoading(true)
    const { start, end } = dayRange(logDate)
    let url: string
    if (jobFilter) {
      const params = new URLSearchParams()
      if (activeConnectionId) params.set('connection_id', activeConnectionId)
      const qs = params.toString()
      url = `/api/scan-jobs/${jobFilter}/runs${qs ? `?${qs}` : ''}`
    } else {
      url = `/api/run-history?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}${activeConnectionId ? '&connection_id=' + activeConnectionId : ''}`
    }
    apiFetch(url)
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: Run[] = (Array.isArray(data) ? data : []).map((r, i) => ({
          run_id:           String(r.run_id ?? r.id ?? i),
          job_id:           String(r.job_id ?? ''),
          job_name:         String(r.job_name ?? r.scan_job_name ?? r.job_id ?? '—'),
          status:           (r.status as RunStatus) ?? 'queued',
          trigger_type:     String(r.trigger_type ?? 'manual'),
          triggered_by:     r.triggered_by as string | null ?? null,
          started_at:       r.started_at as string | null ?? null,
          ended_at:         r.ended_at as string | null ?? null,
          created_at:       r.created_at as string | null ?? null,
          duration_seconds: r.duration_seconds as number | null ?? null,
          assets_scanned:   Number(r.assets_scanned ?? 0),
          errors_count:     Number(r.errors_count ?? 0),
          warnings_count:   Number(r.warnings_count ?? 0),
          error_message:    r.error_message as string | null ?? null,
        }))
        const filteredByDate = jobFilter
          ? items.filter(r => {
              const ts = r.started_at ?? r.created_at
              return !!ts && ts >= start && ts < end
            })
          : items
        setRuns(filteredByDate.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [jobFilter, logDate, activeConnectionId])

  const totalRunning   = runs.filter(r => r.status === 'running').length
  const totalCompleted = runs.filter(r => r.status === 'succeeded' || r.status === 'partial_success').length
  const totalFailed    = runs.filter(r => r.status === 'failed' || r.status === 'timed_out').length

  const filtered = runs.filter(r => {
    if (filter === 'all') return true
    if (filter === 'succeeded') return r.status === 'succeeded' || r.status === 'partial_success'
    if (filter === 'failed') return r.status === 'failed' || r.status === 'timed_out'
    return r.status === filter
  })

  const CARDS = [
    { key: 'all',       label: 'Total',     value: runs.length,    color: 'var(--accent)' },
    { key: 'running',   label: 'Running',   value: totalRunning,   color: 'var(--status-info-text)' },
    { key: 'succeeded', label: 'Succeeded', value: totalCompleted, color: 'var(--status-ok-text)' },
    { key: 'failed',    label: 'Failed',    value: totalFailed,    color: 'var(--status-error-text)' },
  ] as const

  return (
    <div style={{ padding: '16px 24px', paddingRight: selectedRun ? 'calc(min(640px, 92vw) + 24px)' : '24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>
            Run History {jobFilter && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>— filtered by job</span>}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${runs.length} run${runs.length !== 1 ? 's' : ''}${totalRunning > 0 ? ` · ${totalRunning} in progress` : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Log date
            <input
              type="date"
              value={logDate}
              max={todayLocal()}
              onChange={e => setLogDate(e.target.value)}
              style={{ fontSize: 'var(--text-xs)', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}
            />
          </label>
          {logDate !== todayLocal() && (
            <button
              onClick={() => setLogDate(todayLocal())}
              style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
              Today
            </button>
          )}
          {jobFilter && (
            <Link href="/run-history" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none' }}>
              ← All jobs
            </Link>
          )}
        </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', padding: '0 12px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['Job', 'Status', 'Trigger', 'Started', 'Ended', 'Duration', 'Assets', 'Detail'].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable run list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {!loading && runs.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>No runs yet</div>
            <div style={{ fontSize: 'var(--text-xs)' }}>Trigger a scan job to see run history here</div>
          </div>
        )}
        {!loading && runs.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No runs match the selected filter</div>
        )}

        {!loading && filtered.map(run => {
          const ss        = STATUS_STYLE[run.status] ?? STATUS_STYLE.queued
          const isExpanded = expanded === run.run_id
          const hasError  = !!run.error_message

          return (
            <div key={run.run_id}>
              <div
                onClick={() => hasError && setExpanded(isExpanded ? null : run.run_id)}
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '5px 12px', background: isExpanded ? 'var(--surface-muted)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', minHeight: '32px', cursor: hasError ? 'pointer' : 'default' }}>

                <div style={{ minWidth: 0, fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{run.job_name}</div>

                <span style={{ ...ss, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, display: 'inline-block', width: 'fit-content' }}>
                  {STATUS_ICON[run.status]} {run.status}
                </span>

                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{run.trigger_type}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTs(run.started_at)}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTs(run.ended_at)}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{fmtDuration(run.duration_seconds)}</span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent)' }}>{run.assets_scanned}</span>

                <button
                  onClick={e => { e.stopPropagation(); setSelectedRun({ jobId: run.job_id, runId: run.run_id }) }}
                  style={{ fontSize: '10px', color: 'var(--accent)', whiteSpace: 'nowrap', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Detail →
                </button>
              </div>

              {isExpanded && run.error_message && (
                <div style={{ background: 'var(--status-error-bg)', borderBottom: '1px solid var(--border)', padding: '10px 16px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--status-error-text)', marginBottom: '4px' }}>Error</div>
                  <pre style={{ margin: 0, fontSize: '10px', color: 'var(--status-error-text)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{run.error_message}</pre>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedRun && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(640px, 92vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', zIndex: 900, display: 'flex' }}>
          <RunDetailPanel
            jobId={selectedRun.jobId}
            runId={selectedRun.runId}
            onClose={() => setSelectedRun(null)}
          />
        </div>
      )}
    </div>
  )
}

export default function RunHistoryPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <RunHistoryInner />
    </Suspense>
  )
}
