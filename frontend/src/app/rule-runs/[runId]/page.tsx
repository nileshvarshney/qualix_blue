'use client'
import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import FailedRecordsTable from '@/components/shared/FailedRecordsTable'
import { apiFetch } from '@/lib/apiFetch'

type RunStatus = 'passed' | 'failed' | 'error' | 'skipped' | 'running'

interface RuleRun {
  run_id: string
  rule_id: string
  rule_name?: string
  rule_type?: string
  severity?: string
  status: RunStatus
  quality_score: number | null
  total_rows_scanned: number | null
  failed_rows_count: number | null
  passed_rows_count: number | null
  failure_percentage: number | null
  error_message: string | null
  executed_sql: string | null
  execution_start_time: string | null
  execution_end_time: string | null
  duration_ms: number | null
  samples: Record<string, unknown>[]
  masked_fields: string[]
}

const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  passed:  { background: '#f0fdf4', color: '#16a34a' },
  failed:  { background: '#fee2e2', color: '#dc2626' },
  error:   { background: '#fee2e2', color: '#dc2626' },
  skipped: { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
  running: { background: '#eff6ff', color: '#2563eb' },
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtTs(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function scoreColor(s: number | null): string {
  if (s == null) return 'var(--text-muted)'
  return s >= 90 ? '#16a34a' : s >= 80 ? '#ea8b3a' : '#dc2626'
}

export default function RuleRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params)
  const [run, setRun] = useState<RuleRun | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSql, setShowSql] = useState(false)

  useEffect(() => {
    apiFetch(`/api/rule-runs/${runId}?samples=true`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        if (!data || data.error) { setLoading(false); return }
        setRun({
          run_id:              String(data.run_id ?? runId),
          rule_id:             String(data.rule_id ?? ''),
          rule_name:           data.rule_name as string | undefined,
          rule_type:           data.rule_type as string | undefined,
          severity:            data.severity as string | undefined,
          status:              (data.status as RunStatus) ?? 'error',
          quality_score:       data.quality_score as number | null ?? null,
          total_rows_scanned:  data.total_rows_scanned as number | null ?? null,
          failed_rows_count:   data.failed_rows_count as number | null ?? null,
          passed_rows_count:   data.passed_rows_count as number | null ?? null,
          failure_percentage:  data.failure_percentage as number | null ?? null,
          error_message:       data.error_message as string | null ?? null,
          executed_sql:        data.executed_sql as string | null ?? null,
          execution_start_time: data.execution_start_time as string | null ?? null,
          execution_end_time:  data.execution_end_time as string | null ?? null,
          duration_ms:         data.duration_ms as number | null ?? null,
          samples:             Array.isArray(data.samples) ? data.samples as Record<string, unknown>[] : [],
          masked_fields:       Array.isArray(data.masked_fields) ? data.masked_fields as string[] : [],
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [runId])

  if (!loading && !run) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
        <div style={{ fontWeight: 600 }}>Run not found</div>
        <Link href="/rules" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none', marginTop: '8px', display: 'inline-block' }}>
          ← Back to Rules
        </Link>
      </div>
    )
  }

  const ss = run ? (STATUS_STYLE[run.status] ?? STATUS_STYLE.error) : null

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--background)', minHeight: '100%' }}>

      {/* breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        <Link href="/rules" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Rules</Link>
        <span>›</span>
        <span style={{ color: 'var(--foreground)', fontFamily: 'monospace' }}>Run {runId.slice(0, 8)}…</span>
      </div>

      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading run…</div>
      )}

      {!loading && run && ss && (
        <>
          {/* run summary card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--foreground)' }}>
                  {run.rule_name ?? 'Rule Run'}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '2px' }}>
                  run {run.run_id}
                </div>
                {run.rule_type && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {run.rule_type.replace(/_/g, ' ')}
                    {run.severity && ` · ${run.severity}`}
                  </div>
                )}
              </div>
              <span style={{ ...ss, padding: '3px 10px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                {run.status}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
              {[
                { label: 'Quality Score', value: run.quality_score != null ? `${Math.round(run.quality_score)}%` : '—', color: scoreColor(run.quality_score) },
                { label: 'Total Rows',    value: run.total_rows_scanned?.toLocaleString() ?? '—', color: 'var(--foreground)' },
                { label: 'Failed Rows',  value: run.failed_rows_count?.toLocaleString() ?? '—', color: run.failed_rows_count ? '#dc2626' : '#16a34a' },
                { label: 'Failure %',    value: run.failure_percentage != null ? `${run.failure_percentage.toFixed(2)}%` : '—', color: run.failure_percentage ? '#dc2626' : '#16a34a' },
                { label: 'Duration',     value: fmtDuration(run.duration_ms), color: 'var(--foreground)' },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{m.label}</div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Started</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--foreground)' }}>{fmtTs(run.execution_start_time)}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Ended</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--foreground)' }}>{fmtTs(run.execution_end_time)}</div>
              </div>
            </div>

            {run.error_message && (
              <div style={{ marginTop: '10px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '10px 12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', marginBottom: '4px' }}>Error</div>
                <pre style={{ margin: 0, fontSize: '10px', color: '#7f1d1d', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{run.error_message}</pre>
              </div>
            )}
          </div>

          {/* Executed SQL */}
          {run.executed_sql && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <button onClick={() => setShowSql(p => !p)} style={{ width: '100%', padding: '10px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>Executed SQL</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{showSql ? '▲' : '▼'}</span>
              </button>
              {showSql && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                  <pre style={{ margin: 0, fontSize: '11px', color: 'var(--foreground)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', background: 'var(--surface-muted)', padding: '10px', borderRadius: '6px', overflowX: 'auto' }}>
                    {run.executed_sql}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Failing samples */}
          {run.samples.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)' }}>
                  Failing Records Sample ({run.samples.length})
                </span>
                {run.masked_fields.length > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    🔒 {run.masked_fields.length} column{run.masked_fields.length !== 1 ? 's' : ''} masked for your role
                  </span>
                )}
              </div>
              <FailedRecordsTable records={run.samples} maskedFields={run.masked_fields} />
            </div>
          )}

          {run.status === 'passed' && run.failed_rows_count === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>✓</div>
              <div style={{ fontWeight: 600, color: '#16a34a', fontSize: 'var(--text-sm)' }}>All rows passed</div>
              <div style={{ fontSize: 'var(--text-xs)', color: '#166534', marginTop: '4px' }}>
                {run.total_rows_scanned?.toLocaleString() ?? 0} rows checked — no failures found
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
