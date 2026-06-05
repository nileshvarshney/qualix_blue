'use client'
import { useState, useEffect } from 'react'

type LastRunStatus = 'passed' | 'failed' | 'warning'
type ScheduleStatus = 'active' | 'paused'
type FilterType = 'all' | 'active' | 'paused' | 'failed'

interface RunIssue {
  rule: string
  severity: 'critical' | 'warning' | 'info'
  detail: string
  impact: string
  failedRows: string
}

interface Schedule {
  id: string; name: string; dataset: string; cron: string; human: string
  rules: number; lastRun: string; nextRun: string; status: ScheduleStatus
  lastRunStatus: LastRunStatus; lastDuration: string; connection: string
  owner: string; failedRules: number; checkedRows: string; failedRows: string
  issues: RunIssue[]
}

const SEV_CFG = {
  critical: { color: '#dc2626', bg: '#fee2e2', label: 'Critical' },
  warning:  { color: '#d97706', bg: '#fef3c7', label: 'Warning'  },
  info:     { color: '#2563eb', bg: '#dbeafe', label: 'Info'     },
}

const RUN_STYLE: Record<LastRunStatus, { background: string; color: string }> = {
  passed:  { background: '#f0fdf4', color: '#16a34a' },
  failed:  { background: '#fee2e2', color: '#dc2626' },
  warning: { background: '#fef3c7', color: '#d97706' },
}

const STATUS_STYLE: Record<ScheduleStatus, { background: string; color: string }> = {
  active: { background: '#f0fdf4', color: '#16a34a' },
  paused: { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
}

const GRID = '1fr 100px 80px 80px 90px 90px 110px auto'

export default function SchedulesPage() {
  const [scheduleList, setScheduleList] = useState<Schedule[]>([])
  const [loading, setLoading]           = useState(true)
  const [runningId, setRunningId]       = useState<string | null>(null)
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [filter, setFilter]             = useState<FilterType>('all')
  const [collapsedConns, setCollapsedConns] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/schedules')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: Schedule[] = (Array.isArray(data) ? data : []).map((s, i) => ({
          id: String(s.schedule_id ?? s.id ?? i),
          name: String(s.schedule_name ?? s.name ?? ''),
          dataset: String(s.asset_name ?? s.dataset ?? ''),
          cron: String(s.cron_expression ?? s.cron ?? ''),
          human: String(s.human_readable ?? s.human ?? s.cron_expression ?? ''),
          rules: Number(s.rule_count ?? s.rules ?? 0),
          lastRun: String(s.last_run_at ?? s.lastRun ?? '—'),
          nextRun: String(s.next_run_at ?? s.nextRun ?? '—'),
          status: (s.is_active ? 'active' : 'paused') as ScheduleStatus,
          lastRunStatus: (s.last_run_status as LastRunStatus) ?? 'passed',
          lastDuration: String(s.last_duration ?? s.lastDuration ?? '—'),
          connection: String(s.connection_name ?? s.connection ?? '(no connection)'),
          owner: String(s.owner ?? ''),
          failedRules: Number(s.failed_rules ?? s.failedRules ?? 0),
          checkedRows: String(s.checked_rows ?? s.checkedRows ?? '0'),
          failedRows: String(s.failed_rows ?? s.failedRows ?? '0'),
          issues: Array.isArray(s.issues) ? s.issues as RunIssue[] : [],
        }))
        setScheduleList(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const active  = scheduleList.filter(s => s.status === 'active').length
  const paused  = scheduleList.filter(s => s.status === 'paused').length
  const failed  = scheduleList.filter(s => s.lastRunStatus === 'failed').length
  const warning = scheduleList.filter(s => s.lastRunStatus === 'warning').length

  const filtered = scheduleList.filter(s => {
    if (filter === 'active') return s.status === 'active'
    if (filter === 'paused') return s.status === 'paused'
    if (filter === 'failed') return s.lastRunStatus === 'failed' || s.lastRunStatus === 'warning'
    return true
  })

  // Group by connection
  const byConn = filtered.reduce<Record<string, Schedule[]>>((acc, s) => {
    ;(acc[s.connection] ??= []).push(s); return acc
  }, {})
  const conns = Object.keys(byConn).sort()

  function toggleConn(c: string) {
    setCollapsedConns(prev => { const s = new Set(prev); s.has(c) ? s.delete(c) : s.add(c); return s })
  }

  function toggle(id: string) {
    setScheduleList(prev => prev.map(s => s.id === id ? { ...s, status: s.status === 'active' ? 'paused' : 'active' } : s))
  }

  function runNow(id: string) {
    setRunningId(id)
    setTimeout(() => {
      setRunningId(null)
      setScheduleList(prev => prev.map(s => s.id === id
        ? { ...s, lastRun: new Date().toISOString().slice(0, 16).replace('T', ' ') } : s))
    }, 2000)
  }

  const CARDS = [
    { key: 'all',    label: 'Total',          value: scheduleList.length, color: 'var(--accent)'            },
    { key: 'active', label: 'Active',          value: active,              color: 'var(--status-ok-text)'    },
    { key: 'paused', label: 'Paused',          value: paused,              color: 'var(--text-muted)'        },
    { key: 'failed', label: 'Failed/Warning',  value: failed + warning,    color: 'var(--status-error-text)' },
  ] as const

  return (
    <div style={{ padding: '16px 24px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Schedules</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${active} of ${scheduleList.length} active · ${conns.length} connection${conns.length !== 1 ? 's' : ''}${(failed + warning) > 0 ? ` · ${failed + warning} need attention` : ''}`}
          </div>
        </div>
        <button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
          + New Schedule
        </button>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', flexShrink: 0 }}>
        {CARDS.map(s => {
          const on = filter === s.key
          return (
            <div key={s.key} onClick={() => setFilter(p => p === s.key ? 'all' : s.key as FilterType)}
              style={{ background: on ? s.color : 'var(--surface)', border: `1px solid ${on ? s.color : 'var(--border)'}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: on ? '#fff' : s.color, lineHeight: 1 }}>{loading ? '…' : s.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* filter chips */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        {(['all', 'active', 'paused', 'failed'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 12px', borderRadius: '20px', border: '1px solid', fontSize: 'var(--text-xs)', cursor: 'pointer',
            fontWeight: filter === f ? 600 : 400,
            borderColor: filter === f ? 'var(--foreground)' : 'var(--border)',
            background: filter === f ? 'var(--foreground)' : 'var(--surface)',
            color: filter === f ? 'var(--background)' : 'var(--text-secondary)',
          }}>
            {f === 'failed' ? 'Failed/Warning' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* column header */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', padding: '0 24px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['Schedule · Cron', 'Last Run', 'Result', 'Next Run', 'Duration', 'Rules', 'Status', 'Actions'].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list grouped by connection */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {!loading && scheduleList.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>No schedules yet</div>
        )}
        {!loading && scheduleList.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No schedules match the selected filter</div>
        )}

        {!loading && conns.map(conn => {
          const connSchedules = byConn[conn]
          const collapsed     = collapsedConns.has(conn)
          const connActive    = connSchedules.filter(s => s.status === 'active').length
          const connFailed    = connSchedules.filter(s => s.lastRunStatus === 'failed' || s.lastRunStatus === 'warning').length

          return (
            <div key={conn} style={{ marginBottom: '3px' }}>
              {/* connection group header */}
              <div onClick={() => toggleConn(conn)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-block', transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s', lineHeight: 1, width: '8px', flexShrink: 0 }}>▶</span>
                <span style={{ fontSize: '11px', flexShrink: 0 }}>🔌</span>
                <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn}</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{connSchedules.length} schedule{connSchedules.length !== 1 ? 's' : ''} · {connActive} active</span>
                {connFailed > 0 && <span style={{ fontSize: '10px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{connFailed} need attention</span>}
              </div>

              {!collapsed && (
                <div style={{ marginLeft: '16px', marginBottom: '2px', borderLeft: '2px solid var(--border)' }}>
                  {connSchedules.map(s => {
                    const isExpanded = expandedId === s.id
                    const rs         = RUN_STYLE[s.lastRunStatus]
                    const ss         = STATUS_STYLE[s.status]
                    const hasIssues  = s.issues.length > 0

                    return (
                      <div key={s.id}>
                        {/* schedule row */}
                        <div onClick={() => hasIssues && setExpandedId(isExpanded ? null : s.id)}
                          style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isExpanded ? 'var(--surface-muted)' : hasIssues && s.lastRunStatus !== 'passed' ? 'rgba(254,242,242,0.4)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', cursor: hasIssues ? 'pointer' : 'default', minHeight: '30px' }}>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                            {hasIssues && (
                              <span style={{ color: s.lastRunStatus === 'failed' ? '#dc2626' : '#d97706', fontSize: '9px', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{s.cron} · {s.dataset}</div>
                            </div>
                          </div>

                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.lastRun}</span>

                          <div>
                            <span style={{ ...rs, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, display: 'inline-block' }}>
                              {s.lastRunStatus === 'passed' ? '✓' : s.lastRunStatus === 'failed' ? '✕' : '⚠'} {s.lastRunStatus}
                            </span>
                            {s.failedRules > 0 && <div style={{ fontSize: '9px', color: 'var(--status-error-text)' }}>{s.failedRules} rule{s.failedRules > 1 ? 's' : ''} failed</div>}
                          </div>

                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nextRun}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{s.lastDuration}</span>
                          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent)' }}>{s.rules}</span>

                          <span style={{ ...ss, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, display: 'inline-block', width: 'fit-content' }}>{s.status}</span>

                          <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => toggle(s.id)}
                              style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
                              {s.status === 'active' ? '⏸' : '▶'}
                            </button>
                            <button onClick={() => runNow(s.id)} disabled={runningId === s.id}
                              style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid #dbeafe', background: runningId === s.id ? '#eff6ff' : 'var(--surface)', color: '#2563eb', fontSize: '10px', cursor: runningId === s.id ? 'not-allowed' : 'pointer' }}>
                              {runningId === s.id ? '⏳' : '▶ Run'}
                            </button>
                          </div>
                        </div>

                        {/* expanded issues */}
                        {isExpanded && (
                          <div style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--foreground)' }}>Last Run Issues — {s.name}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.checkedRows} checked · {s.failedRows} failed · {s.lastDuration}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {s.issues.map((issue, j) => {
                                const sc = SEV_CFG[issue.severity]
                                return (
                                  <div key={j} style={{ background: 'var(--surface)', border: `1px solid ${sc.color}30`, borderLeft: `3px solid ${sc.color}`, borderRadius: '6px', padding: '10px 14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                      <span style={{ background: sc.bg, color: sc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{sc.label}</span>
                                      <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--foreground)' }}>{issue.rule}</span>
                                      <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '10px', color: 'var(--status-error-text)', fontWeight: 600 }}>{issue.failedRows} rows</span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                      <div style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                                        <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>{issue.detail}
                                      </div>
                                      <div style={{ background: `${sc.bg}88`, borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                                        <span style={{ fontWeight: 700, color: sc.color, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>{issue.impact}
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            <div style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                              <button onClick={() => runNow(s.id)} disabled={runningId === s.id}
                                style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #dbeafe', background: '#eff6ff', color: '#2563eb', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
                                {runningId === s.id ? '⏳ Running…' : '▶ Re-run'}
                              </button>
                              <button onClick={() => setExpandedId(null)}
                                style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                                ▲ Collapse
                              </button>
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
