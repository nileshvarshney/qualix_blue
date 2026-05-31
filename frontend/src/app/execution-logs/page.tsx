'use client'
import { useState, useEffect } from 'react'

type RunStatus = 'passed' | 'failed' | 'warning'
type StatFilter = 'all' | 'passed' | 'failed' | 'warning'

interface ExecLog {
  id: string
  rule: string
  dataset: string
  connection: string
  status: RunStatus
  score: number
  checked: number
  failed: number
  duration: string
  ts: string
  trigger: string
  runBy: string
  ruleType: string
  failureReason: string
  rootCause: string
  impact: string
  recommendation: string
  query: string
  errorSample: string
}

const STAT: Record<RunStatus, { bg: string; color: string; border: string }> = {
  passed:  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  failed:  { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  warning: { bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
}

export default function ExecutionLogsPage() {
  const [logs, setLogs] = useState<ExecLog[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatFilter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/execution-logs')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: ExecLog[] = (Array.isArray(data) ? data : []).map((l, i) => ({
          id: String(l.run_id ?? l.id ?? i),
          rule: String(l.rule_name ?? l.rule ?? ''),
          dataset: String(l.asset_name ?? l.dataset ?? ''),
          connection: String(l.connection_name ?? l.connection ?? ''),
          status: (l.status as RunStatus) ?? 'passed',
          score: Number(l.quality_score ?? l.score ?? 100),
          checked: Number(l.checked_rows ?? l.checked ?? 0),
          failed: Number(l.failed_rows ?? l.failed ?? 0),
          duration: String(l.duration_seconds ? `${l.duration_seconds}s` : l.duration ?? '—'),
          ts: String(l.started_at ?? l.ts ?? ''),
          trigger: String(l.trigger_type ?? l.trigger ?? 'Scheduled'),
          runBy: String(l.run_by ?? l.runBy ?? 'scheduler'),
          ruleType: String(l.rule_type ?? l.ruleType ?? ''),
          failureReason: String(l.failure_reason ?? l.failureReason ?? ''),
          rootCause: String(l.root_cause ?? l.rootCause ?? ''),
          impact: String(l.impact ?? ''),
          recommendation: String(l.recommendation ?? ''),
          query: String(l.rule_query ?? l.query ?? ''),
          errorSample: String(l.error_sample ?? l.errorSample ?? ''),
        }))
        setLogs(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const totalRuns = logs.length
  const passed = logs.filter(l => l.status === 'passed').length
  const failed = logs.filter(l => l.status === 'failed').length
  const warnings = logs.filter(l => l.status === 'warning').length
  const avgScore = logs.length > 0 ? Math.round(logs.reduce((a, l) => a + l.score, 0) / logs.length) : 0

  const filtered = logs.filter(l =>
    (statusFilter === 'all' || l.status === statusFilter) &&
    (search === '' || l.rule.toLowerCase().includes(search.toLowerCase()) || l.dataset.toLowerCase().includes(search.toLowerCase()))
  )

  const statCards = [
    { label: 'Total Runs (24h)', value: totalRuns,         icon: '🔄', color: '#2563eb', filter: 'all' as StatFilter },
    { label: 'Passed',           value: passed,            icon: '✅', color: '#16a34a', filter: 'passed' as StatFilter },
    { label: 'Failed',           value: failed,            icon: '❌', color: '#dc2626', filter: 'failed' as StatFilter },
    { label: 'Warnings',         value: warnings,          icon: '⚠️', color: '#ca8a04', filter: 'warning' as StatFilter },
    { label: 'Avg Score',        value: logs.length > 0 ? avgScore + '%' : '—', icon: '📊', color: '#7c3aed', filter: null },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Execution Logs</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Full history of every quality check run · {logs.length} runs today
          </p>
        </div>
        <button style={{
          background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px',
          borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#475569', cursor: 'pointer'
        }}>⬇ Export CSV</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map(s => {
          const isActive = s.filter !== null && statusFilter === s.filter
          return (
            <div
              key={s.label}
              onClick={() => s.filter !== null && setStatusFilter(prev => prev === s.filter ? 'all' : s.filter!)}
              style={{
                background: isActive ? s.color : '#fff',
                border: `1px solid ${isActive ? s.color : '#ebe8df'}`,
                borderRadius: '12px', padding: '16px 20px',
                cursor: s.filter !== null ? 'pointer' : 'default',
                transition: 'all 0.18s',
                boxShadow: isActive ? `0 4px 16px ${s.color}33` : 'none',
              }}
            >
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{s.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: isActive ? '#fff' : s.color }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.85)' : '#64748b', marginTop: '2px' }}>{s.label}</div>
              {isActive && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '4px', fontWeight: 500 }}>▼ filtered</div>}
            </div>
          )
        })}
      </div>

      {/* Search + filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by rule or dataset…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none' }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatFilter)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#475569' }}
        >
          <option value="all">All Statuses</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="warning">Warning</option>
        </select>
      </div>

      {/* Log rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
            No execution logs yet
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #ebe8df' }}>
            No logs match your filters.
          </div>
        ) : null}

        {!loading && filtered.map(l => {
          const ss = STAT[l.status]
          const scoreColor = l.score >= 95 ? '#16a34a' : l.score >= 80 ? '#ca8a04' : '#dc2626'
          const isExpanded = expanded === l.id

          return (
            <div
              key={l.id}
              onClick={() => setExpanded(isExpanded ? null : l.id)}
              style={{
                background: '#fff',
                border: `1px solid ${l.status === 'failed' ? '#fca5a5' : l.status === 'warning' ? '#fde68a' : '#ebe8df'}`,
                borderLeft: `3px solid ${ss.color}`,
                borderRadius: '12px', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {/* Row summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px 100px 90px 70px 110px 100px 120px 130px auto', gap: '0', alignItems: 'center', padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{l.ts}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#1a1a1a' }}>{l.rule}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{l.ruleType}</div>
                </div>
                <div style={{ fontSize: '12.5px', color: '#475569' }}>{l.dataset}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{l.connection}</div>
                <div>
                  <span style={{ background: ss.bg, color: ss.color, padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>
                    {l.status}
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: scoreColor, fontSize: '13px' }}>{l.score}%</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{l.checked.toLocaleString('en-US')}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', color: l.failed > 0 ? '#dc2626' : '#16a34a' }}>
                  {l.failed.toLocaleString('en-US')}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{l.duration}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{l.trigger} · <span style={{ color: '#475569' }}>{l.runBy}</span></div>
                <span style={{ color: '#94a3b8', fontSize: '14px', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', justifySelf: 'end' }}>▾</span>
              </div>

              {/* Column headers */}
              {!isExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px 100px 90px 70px 110px 100px 120px 130px auto', gap: '0', padding: '0 16px 8px', borderTop: '1px solid #f8fafc' }}>
                  {['Timestamp','Rule','Dataset','Connection','Status','Score','Checked','Failed','Duration','Trigger / Run By',''].map((h, i) => (
                    <div key={i} style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 600, letterSpacing: '0.04em' }}>{h}</div>
                  ))}
                </div>
              )}

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #f1f5f9' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', background: '#fafaf9', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Rule Type',       value: l.ruleType },
                      { label: 'Checked Records', value: l.checked.toLocaleString('en-US') },
                      { label: 'Failed Records',  value: l.failed.toLocaleString('en-US') },
                      { label: 'Duration',        value: l.duration },
                      { label: 'Trigger',         value: l.trigger },
                      { label: 'Run By',          value: l.runBy },
                    ].map((m, i, arr) => (
                      <div key={i} style={{
                        flex: 1, minWidth: '120px', padding: '10px 16px',
                        borderRight: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none'
                      }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {l.status !== 'passed' && l.failureReason && (
                      <div style={{ background: ss.bg, border: `1px solid ${ss.border}`, borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: ss.color, fontWeight: 500 }}>
                        ⚡ <strong>Failure Reason:</strong> {l.failureReason}
                      </div>
                    )}

                    {l.rootCause && (
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e9d5ff' }}>
                        <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: '10px 16px' }}>
                          <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>🔍 ROOT CAUSE</span>
                        </div>
                        <div style={{ padding: '14px 16px', background: '#faf5ff', fontSize: '13px', color: '#3b1f6e', lineHeight: '1.65' }}>
                          {l.rootCause}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {l.impact && (
                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: `1px solid ${ss.border}` }}>
                          <div style={{ background: l.status === 'failed' ? '#dc2626' : l.status === 'warning' ? '#ca8a04' : '#16a34a', padding: '10px 16px' }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>⚠️ BUSINESS IMPACT</span>
                          </div>
                          <div style={{ padding: '14px 16px', background: ss.bg, fontSize: '13px', color: '#334155', lineHeight: '1.65' }}>
                            {l.impact}
                          </div>
                        </div>
                      )}

                      {l.recommendation && (
                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #bbf7d0' }}>
                          <div style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', padding: '10px 16px' }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>✅ RECOMMENDED FIX</span>
                          </div>
                          <div style={{ padding: '14px 16px', background: '#f0fdf4', fontSize: '13px', color: '#14532d', lineHeight: '1.65' }}>
                            {l.recommendation}
                          </div>
                        </div>
                      )}
                    </div>

                    {(l.query || l.errorSample) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {l.query && (
                          <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <div style={{ background: '#1e293b', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>⌗ RULE QUERY</span>
                            </div>
                            <div style={{ padding: '12px 16px', background: '#0f172a', fontFamily: 'monospace', fontSize: '11.5px', color: '#7dd3fc', lineHeight: '1.6', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                              {l.query}
                            </div>
                          </div>
                        )}
                        {l.errorSample && (
                          <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                            <div style={{ background: '#334155', padding: '10px 16px' }}>
                              <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>📋 ERROR SAMPLE</span>
                            </div>
                            <div style={{ padding: '12px 16px', background: '#1e293b', fontFamily: 'monospace', fontSize: '11.5px', color: '#fca5a5', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                              {l.errorSample}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
