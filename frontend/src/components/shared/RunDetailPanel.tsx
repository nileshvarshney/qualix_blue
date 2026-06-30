'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

type RunStatus = 'queued' | 'running' | 'succeeded' | 'partial_success' | 'failed' | 'timed_out' | 'cancelled'
type LogLevel  = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

interface RunDetail {
  run_id: string
  job_id: string
  job_name: string
  status: RunStatus
  trigger_type: string
  triggered_by: string | null
  attempt: number
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  assets_scanned: number
  errors_count: number
  warnings_count: number
  error_message: string | null
  result_summary: Record<string, unknown> | null
}

interface LogEntry {
  log_id: string
  level: LogLevel
  message: string
  logged_at: string
  context: Record<string, unknown> | null
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

const LOG_STYLE: Record<LogLevel, { color: string; bg: string }> = {
  DEBUG:    { color: '#6b7280', bg: 'transparent' },
  INFO:     { color: 'var(--foreground)', bg: 'transparent' },
  WARNING:  { color: '#d97706', bg: '#fef9c340' },
  ERROR:    { color: '#dc2626', bg: '#fee2e240' },
  CRITICAL: { color: '#dc2626', bg: '#fee2e2' },
}

function fmtDuration(secs: number | null): string {
  if (secs == null) return '—'
  if (secs < 60) return `${Math.round(secs)}s`
  return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function RunDetailPanel({ jobId, runId, onClose }: { jobId: string; runId: string; onClose: () => void }) {
  const [run, setRun]       = useState<RunDetail | null>(null)
  const [logs, setLogs]     = useState<LogEntry[]>([])
  const [loadingRun, setLoadingRun] = useState(true)
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [logFilter, setLogFilter] = useState<LogLevel | 'ALL'>('ALL')
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoadingRun(true)
    setLoadingLogs(true)
    setLogFilter('ALL')
    setCancelling(false)
    setRun(null)
    setLogs([])

    apiFetch(`/api/scan-jobs/${jobId}/runs/${runId}`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (cancelled) return
        if (!data) { setLoadingRun(false); return }
        setRun({
          run_id:          String(data.run_id ?? ''),
          job_id:          String(data.job_id ?? jobId),
          job_name:        String(data.job_name ?? data.job_id ?? jobId),
          status:          (data.status as RunStatus) ?? 'queued',
          trigger_type:    String(data.trigger_type ?? 'manual'),
          triggered_by:    data.triggered_by as string | null ?? null,
          attempt:         Number(data.attempt ?? 1),
          started_at:      data.started_at as string | null ?? null,
          ended_at:        data.ended_at as string | null ?? null,
          duration_seconds: data.duration_seconds as number | null ?? null,
          assets_scanned:  Number(data.assets_scanned ?? 0),
          errors_count:    Number(data.errors_count ?? 0),
          warnings_count:  Number(data.warnings_count ?? 0),
          error_message:   data.error_message as string | null ?? null,
          result_summary:  data.result_summary as Record<string, unknown> | null ?? null,
        })
        setLoadingRun(false)
      })
      .catch(() => { if (!cancelled) setLoadingRun(false) })

    apiFetch(`/api/scan-jobs/${jobId}/runs/${runId}/logs`)
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        if (cancelled) return
        const entries: LogEntry[] = (Array.isArray(data) ? data : []).map((l, i) => ({
          log_id:    String(l.log_id ?? i),
          level:     (l.level as LogLevel) ?? 'INFO',
          message:   String(l.message ?? ''),
          logged_at: String(l.logged_at ?? ''),
          context:   l.context as Record<string, unknown> | null ?? null,
        }))
        setLogs(entries)
        setLoadingLogs(false)
      })
      .catch(() => { if (!cancelled) setLoadingLogs(false) })

    return () => { cancelled = true }
  }, [jobId, runId])

  function cancelRun() {
    setCancelling(true)
    apiFetch(`/api/scan-jobs/${jobId}/runs/${runId}`, { method: 'POST' })
      .then(res => { if (res.ok) setRun(r => r ? { ...r, status: 'cancelled' } : r) })
      .catch(() => {})
      .finally(() => setCancelling(false))
  }

  const filteredLogs = logFilter === 'ALL' ? logs : logs.filter(l => l.level === logFilter)
  const ss = run ? (STATUS_STYLE[run.status] ?? STATUS_STYLE.queued) : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--foreground)' }}>
            {run?.job_name ?? 'Run Detail'}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
            run {runId}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {loadingRun && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading run…</div>
        )}

        {!loadingRun && !run && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Run not found</div>
        )}

        {!loadingRun && run && ss && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ ...ss, padding: '3px 10px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-block' }}>
                  {run.status}
                </span>
                {run.status === 'running' && (
                  <button onClick={cancelRun} disabled={cancelling}
                    style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid #fca5a5', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
                    {cancelling ? 'Cancelling…' : 'Cancel Run'}
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              {[
                { label: 'Started',  value: fmtTs(run.started_at) },
                { label: 'Ended',    value: fmtTs(run.ended_at) },
                { label: 'Duration', value: fmtDuration(run.duration_seconds) },
                { label: 'Assets',   value: String(run.assets_scanned) },
                { label: 'Trigger',  value: run.trigger_type + (run.triggered_by ? ` · ${run.triggered_by}` : '') },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{m.label}</div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)' }}>{m.value}</div>
                </div>
              ))}
            </div>
            {run.errors_count > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                {run.errors_count > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{run.errors_count} error{run.errors_count !== 1 ? 's' : ''}</span>}
                {run.warnings_count > 0 && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{run.warnings_count} warning{run.warnings_count !== 1 ? 's' : ''}</span>}
              </div>
            )}
            {run.error_message && (
              <div style={{ marginTop: '10px', background: 'var(--status-error-bg)', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--status-error-text)', marginBottom: '4px' }}>Error</div>
                <pre style={{ margin: 0, fontSize: '10px', color: 'var(--status-error-text)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{run.error_message}</pre>
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '200px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>
              Logs {!loadingLogs && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({logs.length})</span>}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['ALL', 'INFO', 'WARNING', 'ERROR'] as const).map(lvl => (
                <button key={lvl} onClick={() => setLogFilter(lvl)} style={{
                  padding: '2px 8px', borderRadius: '4px', border: '1px solid',
                  fontSize: '10px', cursor: 'pointer', fontWeight: logFilter === lvl ? 600 : 400,
                  borderColor: logFilter === lvl ? 'var(--foreground)' : 'var(--border)',
                  background: logFilter === lvl ? 'var(--foreground)' : 'var(--surface)',
                  color: logFilter === lvl ? 'var(--background)' : 'var(--text-secondary)',
                }}>{lvl}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px' }}>
            {loadingLogs && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading logs…</div>}
            {!loadingLogs && logs.length === 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No logs available for this run</div>
            )}
            {!loadingLogs && filteredLogs.length === 0 && logs.length > 0 && (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No {logFilter} logs</div>
            )}
            {!loadingLogs && filteredLogs.map((entry, idx) => {
              const ls = LOG_STYLE[entry.level] ?? LOG_STYLE.INFO
              return (
                <div key={entry.log_id} style={{ display: 'flex', gap: '12px', padding: '3px 16px', background: idx % 2 === 0 ? 'transparent' : 'var(--surface-muted)', borderBottom: '1px solid var(--border)', ...('bg' in ls && ls.bg !== 'transparent' ? { background: ls.bg } : {}) }}>
                  <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '10px', paddingTop: '1px' }}>
                    {entry.logged_at ? new Date(entry.logged_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                  </span>
                  <span style={{ color: ls.color, fontWeight: 700, width: '52px', flexShrink: 0, fontSize: '10px', paddingTop: '1px' }}>{entry.level}</span>
                  <span style={{ color: ls.color === 'var(--foreground)' ? 'var(--foreground)' : ls.color, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{entry.message}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
