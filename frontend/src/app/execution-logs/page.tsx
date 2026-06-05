'use client'
import { useState, useEffect } from 'react'

type RunStatus = 'passed' | 'failed' | 'warning'
type StatFilter = 'all' | 'passed' | 'failed' | 'warning'

interface ExecLog {
  id: string; rule: string; dataset: string; connection: string
  status: RunStatus; score: number; checked: number; failed: number
  duration: string; ts: string; trigger: string; runBy: string
  ruleType: string; failureReason: string; rootCause: string
  impact: string; recommendation: string; query: string; errorSample: string
}

const STAT: Record<RunStatus, { background: string; color: string; border: string }> = {
  passed:  { background: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  failed:  { background: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  warning: { background: '#fefce8', color: '#ca8a04', border: '#fde68a' },
}

const GRID = '110px 1fr 100px 70px 50px 110px 80px 80px 18px'

function dateGroup(ts: string): string {
  if (!ts) return 'Unknown'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return 'Unknown'
  const today     = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const dDay      = new Date(d); dDay.setHours(0, 0, 0, 0)
  if (dDay.getTime() === today.getTime())     return 'Today'
  if (dDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const GROUP_ORDER = ['Today', 'Yesterday']

export default function ExecutionLogsPage() {
  const [logs, setLogs]                 = useState<ExecLog[]>([])
  const [loading, setLoading]           = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatFilter>('all')
  const [search, setSearch]             = useState('')
  const [expanded, setExpanded]         = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/execution-logs')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: ExecLog[] = (Array.isArray(data) ? data : []).map((l, i) => ({
          id:            String(l.run_id ?? l.id ?? i),
          rule:          String(l.rule_name ?? l.rule ?? ''),
          dataset:       String(l.asset_name ?? l.dataset ?? ''),
          connection:    String(l.connection_name ?? l.connection ?? ''),
          status:        (l.status as RunStatus) ?? 'passed',
          score:         Number(l.quality_score ?? l.score ?? 100),
          checked:       Number(l.checked_rows ?? l.checked ?? 0),
          failed:        Number(l.failed_rows ?? l.failed ?? 0),
          duration:      String(l.duration_seconds ? `${l.duration_seconds}s` : l.duration ?? '—'),
          ts:            String(l.started_at ?? l.ts ?? ''),
          trigger:       String(l.trigger_type ?? l.trigger ?? 'Scheduled'),
          runBy:         String(l.run_by ?? l.runBy ?? 'scheduler'),
          ruleType:      String(l.rule_type ?? l.ruleType ?? ''),
          failureReason: String(l.failure_reason ?? l.failureReason ?? ''),
          rootCause:     String(l.root_cause ?? l.rootCause ?? ''),
          impact:        String(l.impact ?? ''),
          recommendation: String(l.recommendation ?? ''),
          query:         String(l.rule_query ?? l.query ?? ''),
          errorSample:   String(l.error_sample ?? l.errorSample ?? ''),
        }))
        setLogs(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const totalRuns = logs.length
  const passed    = logs.filter(l => l.status === 'passed').length
  const failed    = logs.filter(l => l.status === 'failed').length
  const warnings  = logs.filter(l => l.status === 'warning').length
  const avgScore  = logs.length > 0 ? Math.round(logs.reduce((a, l) => a + l.score, 0) / logs.length) : 0

  const filtered = logs.filter(l =>
    (statusFilter === 'all' || l.status === statusFilter) &&
    (search === '' || l.rule.toLowerCase().includes(search.toLowerCase()) || l.dataset.toLowerCase().includes(search.toLowerCase()))
  )

  // Group by date
  const byDate = filtered.reduce<Record<string, ExecLog[]>>((acc, l) => {
    const g = dateGroup(l.ts)
    ;(acc[g] ??= []).push(l); return acc
  }, {})
  const dateKeys = Object.keys(byDate).sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a), bi = GROUP_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a < b ? 1 : -1
  })

  function toggleGroup(g: string) {
    setCollapsedGroups(prev => { const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s })
  }

  const CARDS = [
    { label: 'Total (24h)', value: totalRuns, color: 'var(--accent)',            filter: 'all'     as StatFilter },
    { label: 'Passed',       value: passed,   color: 'var(--status-ok-text)',    filter: 'passed'  as StatFilter },
    { label: 'Failed',       value: failed,   color: 'var(--status-error-text)', filter: 'failed'  as StatFilter },
    { label: 'Warnings',     value: warnings, color: '#ca8a04',                  filter: 'warning' as StatFilter },
    { label: 'Avg Score',    value: logs.length > 0 ? `${avgScore}%` : '—', color: '#7c3aed', filter: null },
  ]

  return (
    <div style={{ padding: '16px 24px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Execution Logs</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${totalRuns} runs · ${passed} passed · ${failed} failed`}
          </div>
        </div>
        <button style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          ⬇ Export CSV
        </button>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '8px', flexShrink: 0 }}>
        {CARDS.map(s => {
          const on = s.filter !== null && statusFilter === s.filter
          return (
            <div key={s.label}
              onClick={() => s.filter !== null && setStatusFilter(prev => prev === s.filter ? 'all' : s.filter!)}
              style={{ background: on ? s.color : 'var(--surface)', border: `1px solid ${on ? s.color : 'var(--border)'}`, borderRadius: '8px', padding: '10px 14px', cursor: s.filter !== null ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: on ? '#fff' : s.color, lineHeight: 1 }}>{loading ? '…' : s.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* search + filter */}
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by rule or dataset…"
          style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatFilter)}
          style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
          <option value="all">All Statuses</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="warning">Warning</option>
        </select>
      </div>

      {/* column header */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', padding: '0 24px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['Timestamp', 'Rule · Type', 'Dataset', 'Status', 'Score', 'Checked / Failed', 'Duration', 'Trigger', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list grouped by date */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {!loading && logs.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>No execution logs yet</div>
        )}
        {!loading && logs.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No logs match your filters</div>
        )}

        {!loading && dateKeys.map(grp => {
          const items     = byDate[grp]
          const collapsed = collapsedGroups.has(grp)
          const grpPassed = items.filter(l => l.status === 'passed').length
          const passRate  = Math.round((grpPassed / items.length) * 100)

          return (
            <div key={grp} style={{ marginBottom: '3px' }}>
              {/* date group header */}
              <div onClick={() => toggleGroup(grp)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-block', transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s', lineHeight: 1, width: '8px', flexShrink: 0 }}>▶</span>
                <span style={{ fontSize: '11px', flexShrink: 0 }}>📅</span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>{grp}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{items.length} run{items.length !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: '10px', color: passRate >= 90 ? 'var(--status-ok-text)' : passRate >= 70 ? '#ca8a04' : 'var(--status-error-text)', fontWeight: 600 }}>{passRate}% pass</span>
              </div>

              {!collapsed && (
                <div style={{ marginLeft: '16px', marginBottom: '2px', borderLeft: '2px solid var(--border)' }}>
                  {items.map(l => {
                    const ss         = STAT[l.status]
                    const scoreColor = l.score >= 95 ? 'var(--status-ok-text)' : l.score >= 80 ? '#ca8a04' : 'var(--status-error-text)'
                    const isExp      = expanded === l.id

                    return (
                      <div key={l.id}>
                        {/* single-line row */}
                        <div onClick={() => setExpanded(isExp ? null : l.id)}
                          style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isExp ? 'var(--surface-muted)' : l.status !== 'passed' ? 'rgba(254,242,242,0.3)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', borderLeft: `2px solid ${ss.color}`, cursor: 'pointer', minHeight: '28px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.ts.slice(11, 16) || l.ts.slice(0, 10)}</span>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                              title={l.rule + (l.ruleType ? ` · ${l.ruleType}` : '')}>
                              {l.rule}
                              {l.ruleType && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {l.ruleType}</span>}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.dataset}</span>
                          <span style={{ ...ss, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, display: 'inline-block', width: 'fit-content' }}>{l.status}</span>
                          <span style={{ fontWeight: 700, color: scoreColor, fontSize: 'var(--text-xs)' }}>{l.score}%</span>
                          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {l.checked.toLocaleString('en-US')} / <span style={{ color: l.failed > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)', fontWeight: l.failed > 0 ? 700 : 400 }}>{l.failed.toLocaleString('en-US')}</span>
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{l.duration}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.trigger}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                        </div>

                        {/* expanded detail */}
                        {isExp && (
                          <div style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
                              {[
                                { label: 'Rule Type',   value: l.ruleType },
                                { label: 'Checked',     value: l.checked.toLocaleString('en-US') },
                                { label: 'Failed',      value: l.failed.toLocaleString('en-US') },
                                { label: 'Duration',    value: l.duration },
                                { label: 'Trigger',     value: l.trigger },
                                { label: 'Run By',      value: l.runBy },
                              ].map((m, i, arr) => (
                                <div key={i} style={{ flex: 1, minWidth: '80px', padding: '8px 12px', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', marginTop: '2px' }}>{m.value}</div>
                                </div>
                              ))}
                            </div>

                            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {l.status !== 'passed' && l.failureReason && (
                                <div style={{ background: ss.background, border: `1px solid ${ss.border}`, borderRadius: '6px', padding: '8px 12px', fontSize: 'var(--text-xs)', color: ss.color, fontWeight: 500 }}>
                                  ⚡ <strong>Failure Reason:</strong> {l.failureReason}
                                </div>
                              )}
                              {l.rootCause && (
                                <div style={{ background: 'var(--surface)', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                  <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>{l.rootCause}
                                </div>
                              )}
                              {(l.impact || l.recommendation) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  {l.impact && (
                                    <div style={{ background: ss.background, border: `1px solid ${ss.border}`, borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                      <span style={{ color: ss.color, fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>{l.impact}
                                    </div>
                                  )}
                                  {l.recommendation && (
                                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                      <span style={{ color: '#15803d', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fix · </span>{l.recommendation}
                                    </div>
                                  )}
                                </div>
                              )}
                              {(l.query || l.errorSample) && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                  {l.query && (
                                    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                      <div style={{ background: '#1e293b', padding: '6px 12px' }}>
                                        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '10px', letterSpacing: '0.04em' }}>⌗ RULE QUERY</span>
                                      </div>
                                      <div style={{ padding: '10px 12px', background: '#0f172a', fontFamily: 'monospace', fontSize: '10.5px', color: '#7dd3fc', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                                        {l.query}
                                      </div>
                                    </div>
                                  )}
                                  {l.errorSample && (
                                    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                      <div style={{ background: '#334155', padding: '6px 12px' }}>
                                        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '10px', letterSpacing: '0.04em' }}>📋 ERROR SAMPLE</span>
                                      </div>
                                      <div style={{ padding: '10px 12px', background: '#1e293b', fontFamily: 'monospace', fontSize: '10.5px', color: '#fca5a5', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
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
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
