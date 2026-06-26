'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface ProfileSummary {
  asset_id: string
  run_id: string
  column_count: number
  avg_null_ratio: number
  row_count: number | null
  profiled_at: string | null
  profile_score: number | null
  quality_status: string | null
}

interface ColumnProfile {
  profiling_id: string
  column_name: string
  data_type: string | null
  null_count: number | null
  null_ratio: number
  distinct_count: number | null
  distinct_ratio: number
  min_value: string | null
  max_value: string | null
  avg_value: number | null
  std_dev: number | null
  top_values: Record<string, number>
  row_count: number | null
}

interface RunHistory {
  run_id: string
  profiled_at: string | null
  column_count: number
  status: string
  trigger_type: string | null
}

const SCORE_COLOR = (score: number | null) => {
  if (score === null) return 'var(--text-muted)'
  if (score >= 0.9) return '#16a34a'
  if (score >= 0.7) return '#d97706'
  return '#dc2626'
}

const NULL_BAR_COLOR = (ratio: number) => {
  if (ratio <= 0.05) return '#16a34a'
  if (ratio <= 0.2) return '#d97706'
  return '#dc2626'
}

function NullBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '6px', background: 'var(--surface-muted)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: NULL_BAR_COLOR(ratio), borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', minWidth: '32px' }}>{pct}%</span>
    </div>
  )
}

function TopValuesChip({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values).slice(0, 5)
  if (entries.length === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
      {entries.map(([val, count]) => (
        <span key={val} style={{ fontSize: '10px', padding: '1px 5px', background: 'var(--surface-muted)', borderRadius: '3px', color: 'var(--text-secondary)' }}>
          {String(val).slice(0, 20)}{String(val).length > 20 ? '…' : ''} ({count})
        </span>
      ))}
    </div>
  )
}

export default function AssetProfilingTab({
  assetId,
  connectionId,
}: {
  assetId: string
  connectionId: string | undefined
}) {
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [columns, setColumns] = useState<ColumnProfile[]>([])
  const [history, setHistory] = useState<RunHistory[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [columnsLoading, setColumnsLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null)
  const [expandedCol, setExpandedCol] = useState<string | null>(null)

  const loadSummary = useCallback(async (runId?: string | null) => {
    setLoading(true)
    try {
      const url = runId
        ? `/api/profile-results/assets/${assetId}/summary?run_id=${runId}`
        : `/api/profile-results/assets/${assetId}/summary`
      const res = await apiFetch(url)
      setSummary(res.ok ? await res.json() : null)
    } finally {
      setLoading(false)
    }
  }, [assetId])

  const loadColumns = useCallback(async (runId?: string | null) => {
    setColumnsLoading(true)
    try {
      const url = runId
        ? `/api/profile-results/assets/${assetId}/columns?run_id=${runId}`
        : `/api/profile-results/assets/${assetId}/columns`
      const res = await apiFetch(url)
      setColumns(res.ok ? await res.json() : [])
    } finally {
      setColumnsLoading(false)
    }
  }, [assetId])

  const loadHistory = useCallback(async () => {
    const res = await apiFetch(`/api/profile-results/assets/${assetId}/history`)
    setHistory(res.ok ? await res.json() : [])
  }, [assetId])

  useEffect(() => {
    loadSummary(null)
    loadColumns(null)
    loadHistory()
  }, [assetId, loadSummary, loadColumns, loadHistory])

  async function runProfile() {
    if (!connectionId) {
      setTriggerMsg('Cannot trigger profile: asset has no connection')
      return
    }
    setTriggering(true)
    setTriggerMsg(null)
    try {
      const createRes = await apiFetch('/api/scan-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_name: `Profile Scan — ${connectionId}`,
          job_type: 'profile_scan',
          connection_id: connectionId,
          schedule_frequency: 'on_demand',
        }),
      })
      const job = await createRes.json()
      if (!job.job_id) {
        setTriggerMsg('Failed to create profile scan job')
        return
      }
      await apiFetch(`/api/scan-jobs/${job.job_id}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      setTriggerMsg('Profile scan queued — results will appear once the run completes')
    } catch {
      setTriggerMsg('Failed to trigger profile scan')
    } finally {
      setTriggering(false)
    }
  }

  function handleRunSelect(runId: string) {
    setSelectedRunId(runId)
    loadSummary(runId)
    loadColumns(runId)
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Loading profile…
      </div>
    )
  }

  const score = summary?.profile_score ?? null
  const statusColor = SCORE_COLOR(score)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '4px 0' }}>

      {/* Summary card */}
      {summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {[
            { label: 'Profile Score', value: score !== null ? `${Math.round(score * 100)}%` : '—', color: statusColor },
            { label: 'Columns Profiled', value: summary.column_count },
            { label: 'Rows Sampled', value: summary.row_count?.toLocaleString() ?? '—' },
            { label: 'Avg Null Ratio', value: `${Math.round(summary.avg_null_ratio * 100)}%` },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: color ?? 'var(--foreground)' }}>{String(value)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '8px', padding: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--foreground)', marginBottom: '6px' }}>No profile data yet</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Run a profile scan to see column statistics, null ratios, and value distributions.
          </div>
          <button
            onClick={runProfile}
            disabled={triggering}
            style={{ padding: '8px 18px', borderRadius: '6px', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600, opacity: triggering ? 0.6 : 1 }}
          >
            {triggering ? 'Queuing…' : 'Run First Profile'}
          </button>
          {triggerMsg && <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>{triggerMsg}</div>}
        </div>
      )}

      {summary && (
        <>
          {/* Header row: Last profiled + action */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Last profiled:{' '}
              <span style={{ color: 'var(--foreground)' }}>
                {summary.profiled_at ? new Date(summary.profiled_at).toLocaleString() : '—'}
              </span>
              {summary.quality_status && (
                <span style={{
                  marginLeft: '10px', fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
                  background: summary.quality_status === 'good' ? '#f0fdf4' : summary.quality_status === 'warning' ? '#fef3c7' : '#fee2e2',
                  color: summary.quality_status === 'good' ? '#16a34a' : summary.quality_status === 'warning' ? '#d97706' : '#dc2626',
                }}>
                  {summary.quality_status.toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {history.length > 1 && (
                <select
                  value={selectedRunId ?? ''}
                  onChange={e => handleRunSelect(e.target.value)}
                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)' }}
                >
                  <option value="">Latest run</option>
                  {history.map(h => (
                    <option key={h.run_id} value={h.run_id}>
                      {h.profiled_at ? new Date(h.profiled_at).toLocaleString() : h.run_id.slice(0, 8)}
                      {' '}({h.status})
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={runProfile}
                disabled={triggering}
                style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', opacity: triggering ? 0.6 : 1 }}
              >
                {triggering ? 'Queuing…' : 'Run Profile'}
              </button>
            </div>
          </div>

          {triggerMsg && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '4px 8px', background: 'var(--surface-muted)', borderRadius: '4px' }}>
              {triggerMsg}
            </div>
          )}

          {/* Column profile table */}
          {columnsLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading columns…</div>
          ) : columns.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No column profiles found for this run.</div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                    {['Column', 'Type', 'Null %', 'Distinct', 'Min', 'Max', 'Top Values'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, i) => (
                    <>
                      <tr
                        key={col.column_name}
                        onClick={() => setExpandedCol(expandedCol === col.column_name ? null : col.column_name)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: i % 2 === 0 ? 'transparent' : 'var(--surface-muted)', transition: 'background 0.1s' }}
                      >
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--foreground)' }}>{col.column_name}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '10px' }}>{col.data_type ?? '—'}</td>
                        <td style={{ padding: '8px 10px', minWidth: '100px' }}><NullBar ratio={col.null_ratio} /></td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{col.distinct_count?.toLocaleString() ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '10px', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.min_value ?? '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '10px', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.max_value ?? '—'}</td>
                        <td style={{ padding: '8px 10px' }}><TopValuesChip values={col.top_values} /></td>
                      </tr>
                      {expandedCol === col.column_name && (
                        <tr key={`${col.column_name}-detail`} style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={7} style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 16px', fontSize: '11px' }}>
                              {[
                                ['Null Count', col.null_count?.toLocaleString()],
                                ['Distinct Count', col.distinct_count?.toLocaleString()],
                                ['Distinct Ratio', col.distinct_ratio !== undefined ? `${Math.round(col.distinct_ratio * 100)}%` : '—'],
                                ['Rows Sampled', col.row_count?.toLocaleString()],
                                ['Avg Value', col.avg_value !== null ? col.avg_value?.toFixed(4) : '—'],
                                ['Std Dev', col.std_dev !== null ? col.std_dev?.toFixed(4) : '—'],
                              ].map(([label, val]) => (
                                <div key={label}>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                                  <div style={{ color: 'var(--foreground)', marginTop: '2px' }}>{val ?? '—'}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
