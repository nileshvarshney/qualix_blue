'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { ExecLog, GroupedExecLog, RunStatus, StatFilter, mapExecLog, groupExecLogs } from '@/lib/executionLogs'
import { apiFetch } from '@/lib/apiFetch'

const STAT: Record<RunStatus, { background: string; color: string; border: string }> = {
  passed:  { background: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)',    border: '#bbf7d0' },
  failed:  { background: 'var(--status-error-bg)', color: 'var(--status-error-text)', border: '#fca5a5' },
  warning: { background: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  border: '#fde68a' },
}

const GRID = '110px 1fr 70px 70px 50px 110px 80px 80px 18px'
const SUB_GRID = '1fr 70px 50px 110px 80px 18px'

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

function ExecutionLogsInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [logs, setLogs]                 = useState<ExecLog[]>([])
  const [loading, setLoading]           = useState(true)
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [statusFilter, setStatusFilter] = useState<StatFilter>(() => (searchParams.get('status') as StatFilter) ?? 'all')
  const [search, setSearch]             = useState(() => searchParams.get('q') ?? '')
  const [expanded, setExpanded]         = useState<string | null>(null)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const url = `/api/execution-logs${activeConnectionId ? `?${params}` : ''}`
    apiFetch(url)
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setLogs((Array.isArray(data) ? data : []).map(mapExecLog))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeConnectionId])

  // Sync filter state to URL so browser back restores it
  useEffect(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const qs = params.toString()
    router.replace(qs ? `/execution-logs?${qs}` : '/execution-logs', { scroll: false })
  }, [search, statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => groupExecLogs(logs), [logs])

  const totalRuns = groups.length
  const passed    = groups.filter(g => g.status === 'passed').length
  const failed    = groups.filter(g => g.status === 'failed').length
  const warnings  = groups.filter(g => g.status === 'warning').length
  const avgScore  = groups.length > 0 ? Math.round(groups.reduce((a, g) => a + g.score, 0) / groups.length) : 0

  function exportExecCsv(rows: GroupedExecLog[]) {
    const headers = ['Date', 'Rule', 'Dataset', 'Status', 'Score', 'Rows Checked', 'Rows Failed', 'Duration']
    const lines = rows.flatMap(g => g.rules).map(r => [
      r.ts ?? '', r.rule ?? '', r.dataset ?? '', r.status ?? '',
      r.score ?? '', r.checked ?? '', r.failed ?? '', r.duration ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...lines].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `execution-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const filtered = groups.filter(g =>
    (statusFilter === 'all' || g.status === statusFilter) &&
    (search === '' ||
      g.dataset.toLowerCase().includes(search.toLowerCase()) ||
      g.rules.some(r => r.rule.toLowerCase().includes(search.toLowerCase())))
  )

  // Group by date
  const byDate = filtered.reduce<Record<string, GroupedExecLog[]>>((acc, g) => {
    const key = dateGroup(g.ts)
    ;(acc[key] ??= []).push(g); return acc
  }, {})
  const dateKeys = Object.keys(byDate).sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a), bi = GROUP_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a < b ? 1 : -1
  })

  function toggleDateGroup(g: string) {
    setCollapsedGroups(prev => { const s = new Set(prev); s.has(g) ? s.delete(g) : s.add(g); return s })
  }

  function toggleGroup(id: string) {
    setExpanded(prev => prev === id ? null : id)
    setExpandedRule(null)
  }

  const CARDS = [
    { label: 'Total (24h)', value: totalRuns, color: 'var(--accent)',            filter: 'all'     as StatFilter },
    { label: 'Passed',       value: passed,   color: 'var(--status-ok-text)',    filter: 'passed'  as StatFilter },
    { label: 'Failed',       value: failed,   color: 'var(--status-error-text)', filter: 'failed'  as StatFilter },
    { label: 'Warnings',     value: warnings, color: 'var(--status-warn-text)',   filter: 'warning' as StatFilter },
    { label: 'Avg Score',    value: groups.length > 0 ? `${avgScore}%` : '—', color: '#7c3aed', filter: null },
  ]

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Execution Logs</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${totalRuns} runs · ${passed} passed · ${failed} failed`}
          </div>
        </div>
        <button onClick={() => exportExecCsv(filtered)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
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
          {['Timestamp', 'Table/View · Connection', 'Rules', 'Status', 'Score', 'Checked / Failed', 'Duration', 'Trigger', ''].map((h, i) => (
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

        {!loading && dateKeys.map(dk => {
          const items     = byDate[dk]
          const collapsed = collapsedGroups.has(dk)
          const grpPassed = items.filter(g => g.status === 'passed').length
          const passRate  = Math.round((grpPassed / items.length) * 100)

          return (
            <div key={dk} style={{ marginBottom: '3px' }}>
              {/* date group header */}
              <div onClick={() => toggleDateGroup(dk)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-block', transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s', lineHeight: 1, width: '8px', flexShrink: 0 }}>▶</span>
                <span style={{ fontSize: '11px', flexShrink: 0 }}>📅</span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>{dk}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{items.length} run{items.length !== 1 ? 's' : ''}</span>
                <span style={{ fontSize: '10px', color: passRate >= 90 ? 'var(--status-ok-text)' : passRate >= 70 ? 'var(--status-warn-text)' : 'var(--status-error-text)', fontWeight: 600 }}>{passRate}% pass</span>
              </div>

              {!collapsed && (
                <div style={{ marginLeft: '16px', marginBottom: '2px', borderLeft: '2px solid var(--border)' }}>
                  {items.map(g => {
                    const ss         = STAT[g.status]
                    const scoreColor = g.score >= 95 ? 'var(--status-ok-text)' : g.score >= 80 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
                    const isExp      = expanded === g.id

                    return (
                      <div key={g.id}>
                        {/* group row */}
                        <div onClick={() => toggleGroup(g.id)}
                          style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isExp ? 'var(--surface-muted)' : g.status !== 'passed' ? 'var(--status-error-bg)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', borderLeft: `2px solid ${ss.color}`, cursor: 'pointer', minHeight: '28px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.ts.slice(11, 16) || g.ts.slice(0, 10)}</span>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                              title={g.dataset + (g.connection ? ` · ${g.connection}` : '')}>
                              {g.dataset}
                              {g.connection && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {g.connection}</span>}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{g.rules.length} rule{g.rules.length !== 1 ? 's' : ''}</span>
                          <span style={{ ...ss, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, display: 'inline-block', width: 'fit-content' }}>{g.status}</span>
                          <span style={{ fontWeight: 700, color: scoreColor, fontSize: 'var(--text-xs)' }}>{g.score}%</span>
                          <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {g.checked.toLocaleString('en-US')} / <span style={{ color: g.failed > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)', fontWeight: g.failed > 0 ? 700 : 400 }}>{g.failed.toLocaleString('en-US')}</span>
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{g.duration}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.trigger}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                        </div>

                        {/* expanded: member rule runs */}
                        {isExp && (
                          <div style={{ marginLeft: '16px', borderLeft: '2px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                            {g.rules.map(r => {
                              const rss      = STAT[r.status]
                              const rScoreColor = r.score >= 95 ? 'var(--status-ok-text)' : r.score >= 80 ? 'var(--status-warn-text)' : 'var(--status-error-text)'
                              const isRuleExp = expandedRule === r.id

                              return (
                                <div key={r.id}>
                                  <div onClick={() => setExpandedRule(prev => prev === r.id ? null : r.id)}
                                    style={{ display: 'grid', gridTemplateColumns: SUB_GRID, gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isRuleExp ? 'var(--surface-muted)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', borderLeft: `2px solid ${rss.color}`, cursor: 'pointer', minHeight: '26px' }}>
                                    <div style={{ minWidth: 0 }}>
                                      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                                        title={r.rule + (r.ruleType ? ` · ${r.ruleType}` : '')}>
                                        {r.rule}
                                        {r.ruleType && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {r.ruleType}</span>}
                                      </span>
                                    </div>
                                    <span style={{ ...rss, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, display: 'inline-block', width: 'fit-content' }}>{r.status}</span>
                                    <span style={{ fontWeight: 700, color: rScoreColor, fontSize: 'var(--text-xs)' }}>{r.score}%</span>
                                    <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                      {r.checked.toLocaleString('en-US')} / <span style={{ color: r.failed > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)', fontWeight: r.failed > 0 ? 700 : 400 }}>{r.failed.toLocaleString('en-US')}</span>
                                    </span>
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.duration}</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', transform: isRuleExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                                  </div>

                                  {/* rule detail panel */}
                                  {isRuleExp && (
                                    <div style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                                      <div style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
                                        {[
                                          { label: 'Rule Type',   value: r.ruleType },
                                          { label: 'Checked',     value: r.checked.toLocaleString('en-US') },
                                          { label: 'Failed',      value: r.failed.toLocaleString('en-US') },
                                          { label: 'Duration',    value: r.duration },
                                          { label: 'Trigger',     value: r.trigger },
                                          { label: 'Run By',      value: r.runBy },
                                        ].map((m, i, arr) => (
                                          <div key={i} style={{ flex: 1, minWidth: '80px', padding: '8px 12px', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                                            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', marginTop: '2px' }}>{m.value}</div>
                                          </div>
                                        ))}
                                      </div>

                                      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {r.status !== 'passed' && r.failureReason && (
                                          <div style={{ background: rss.background, border: `1px solid ${rss.border}`, borderRadius: '6px', padding: '8px 12px', fontSize: 'var(--text-xs)', color: rss.color, fontWeight: 500 }}>
                                            ⚡ <strong>Failure Reason:</strong> {r.failureReason}
                                          </div>
                                        )}
                                        {r.rootCause && (
                                          <div style={{ background: 'var(--surface)', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                            <span style={{ color: '#7c3aed', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>{r.rootCause}
                                          </div>
                                        )}
                                        {(r.impact || r.recommendation) && (
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            {r.impact && (
                                              <div style={{ background: rss.background, border: `1px solid ${rss.border}`, borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                                <span style={{ color: rss.color, fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>{r.impact}
                                              </div>
                                            )}
                                            {r.recommendation && (
                                              <div style={{ background: 'var(--status-ok-bg)', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                                <span style={{ color: 'var(--status-ok-text)', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fix · </span>{r.recommendation}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                        {(r.query || r.errorSample) && (
                                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            {r.query && (
                                              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                <div style={{ background: '#1e293b', padding: '6px 12px' }}>
                                                  <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '10px', letterSpacing: '0.04em' }}>⌗ RULE QUERY</span>
                                                </div>
                                                <div style={{ padding: '10px 12px', background: '#0f172a', fontFamily: 'monospace', fontSize: '10.5px', color: '#7dd3fc', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                                                  {r.query}
                                                </div>
                                              </div>
                                            )}
                                            {r.errorSample && (
                                              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                <div style={{ background: '#334155', padding: '6px 12px' }}>
                                                  <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '10px', letterSpacing: '0.04em' }}>📋 ERROR SAMPLE</span>
                                                </div>
                                                <div style={{ padding: '10px 12px', background: '#1e293b', fontFamily: 'monospace', fontSize: '10.5px', color: '#fca5a5', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                                  {r.errorSample}
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
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ExecutionLogsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <ExecutionLogsInner />
    </Suspense>
  )
}
