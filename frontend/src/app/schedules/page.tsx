'use client'
import { useState, useEffect } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

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
  id: string
  name: string
  dataset: string
  cron: string
  human: string
  rules: number
  lastRun: string
  nextRun: string
  status: ScheduleStatus
  lastRunStatus: LastRunStatus
  lastDuration: string
  connection: string
  owner: string
  failedRules: number
  checkedRows: string
  failedRows: string
  issues: RunIssue[]
}

const severityConfig = {
  critical: { color: '#dc2626', bg: '#fee2e2', dot: '#dc2626', label: 'Critical' },
  warning:  { color: '#d97706', bg: '#fef3c7', dot: '#f59e0b', label: 'Warning' },
  info:     { color: '#2563eb', bg: '#dbeafe', dot: '#3b82f6', label: 'Info' },
}

const lastRunStyle: Record<LastRunStatus, { bg: string; color: string }> = {
  passed:  { bg: '#f0fdf4', color: '#16a34a' },
  failed:  { bg: '#fee2e2', color: '#dc2626' },
  warning: { bg: '#fef3c7', color: '#d97706' },
}

const statusStyle: Record<ScheduleStatus, { bg: string; color: string }> = {
  active: { bg: '#f0fdf4', color: '#16a34a' },
  paused: { bg: '#f8fafc', color: '#64748b' },
}

export default function SchedulesPage() {
  const [scheduleList, setScheduleList] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')

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
          connection: String(s.connection_name ?? s.connection ?? ''),
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
    if (filter === 'active')  return s.status === 'active'
    if (filter === 'paused')  return s.status === 'paused'
    if (filter === 'failed')  return s.lastRunStatus === 'failed' || s.lastRunStatus === 'warning'
    return true
  })

  function toggle(id: string) {
    setScheduleList(prev => prev.map(s => s.id === id
      ? { ...s, status: s.status === 'active' ? 'paused' : 'active' }
      : s))
  }

  function runNow(id: string) {
    setRunningId(id)
    setTimeout(() => {
      setRunningId(null)
      setScheduleList(prev => prev.map(s => s.id === id
        ? { ...s, lastRun: new Date().toISOString().slice(0, 16).replace('T', ' ') }
        : s))
    }, 2000)
  }

  const statCards = [
    { key: 'all',    label: 'Total Schedules',  value: scheduleList.length, icon: '📅', color: '#2563eb' },
    { key: 'active', label: 'Active',            value: active,              icon: '▶️', color: '#16a34a' },
    { key: 'paused', label: 'Paused',            value: paused,              icon: '⏸️', color: '#64748b' },
    { key: 'failed', label: 'Failed / Warning',  value: failed + warning,    icon: '⚠️', color: '#dc2626' },
  ] as const

  if (loading) {
    return (
      <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
        <PageTabBar tabs={[
          { href: '/schedules',      label: 'Schedules' },
          { href: '/execution-logs', label: 'Execution Logs' },
        ]} />
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
      <PageTabBar tabs={[
        { href: '/schedules',      label: 'Schedules' },
        { href: '/execution-logs', label: 'Execution Logs' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Schedules</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Automate quality checks — {active} of {scheduleList.length} schedules active
            {(failed + warning) > 0 && (
              <span style={{ marginLeft: '8px', color: '#dc2626', fontWeight: 600 }}>
                · {failed + warning} need attention
              </span>
            )}
          </p>
        </div>
        <button style={{ background: '#dbeafe', border: '1px solid #93c5fd', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>
          + New Schedule
        </button>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map(card => {
          const isActive = filter === card.key
          return (
            <div
              key={card.key}
              onClick={() => setFilter(isActive ? 'all' : card.key as FilterType)}
              style={{
                background: isActive ? card.color : '#fff',
                border: `2px solid ${isActive ? card.color : '#ebe8df'}`,
                borderRadius: '12px', padding: '16px 20px', cursor: 'pointer',
                transition: 'all 0.18s', boxShadow: isActive ? `0 4px 14px ${card.color}30` : 'none',
              }}
            >
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: isActive ? '#fff' : '#1a1a1a' }}>{card.value}</div>
              <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.85)' : '#64748b', marginTop: '2px' }}>{card.label}</div>
              {isActive && (
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>Click to clear filter</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Filter label */}
      {filter !== 'all' && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b' }}>Showing:</span>
          <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>
            {filter === 'failed' ? 'Failed / Warning last run' : filter.charAt(0).toUpperCase() + filter.slice(1)}
          </span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setFilter('all')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>✕ Clear</button>
        </div>
      )}

      {/* Empty state */}
      {scheduleList.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '12px', border: '2px dashed var(--border)' }}>
          No schedules yet
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '12px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#fafaf9', borderBottom: '1px solid #ebe8df' }}>
                {['Schedule', 'Dataset', 'Frequency', 'Rules', 'Last Run', 'Last Run Result', 'Next Run', 'Duration', 'Owner', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: '11.5px', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const isExpanded = expandedId === s.id
                const lrs = lastRunStyle[s.lastRunStatus]
                const ss = statusStyle[s.status]
                const hasIssues = s.issues.length > 0

                return (
                  <>
                    <tr
                      key={s.id}
                      onClick={() => hasIssues && setExpandedId(isExpanded ? null : s.id)}
                      style={{
                        borderBottom: (!isExpanded && i < filtered.length - 1) ? '1px solid #f3f1ea' : 'none',
                        cursor: hasIssues ? 'pointer' : 'default',
                        background: isExpanded ? '#fafaf9' : hasIssues ? 'rgba(254,242,242,0.3)' : '#fff',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {hasIssues && (
                            <span style={{ color: s.lastRunStatus === 'failed' ? '#dc2626' : '#d97706', fontSize: '12px' }}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          )}
                          <div>
                            <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{s.name}</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{s.cron}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569', fontSize: '12.5px' }}>{s.dataset}</td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '12px' }}>{s.human}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#2563eb', textAlign: 'center' }}>{s.rules}</td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>{s.lastRun}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ ...lrs, padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, display: 'inline-block', width: 'fit-content' }}>
                            {s.lastRunStatus === 'passed' ? '✓ passed' : s.lastRunStatus === 'failed' ? '✕ failed' : '⚠ warning'}
                          </span>
                          {s.failedRules > 0 && (
                            <span style={{ fontSize: '10.5px', color: '#dc2626' }}>
                              {s.failedRules} rule{s.failedRules > 1 ? 's' : ''} failed · {s.failedRows} rows
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#475569', fontSize: '12px', whiteSpace: 'nowrap' }}>{s.nextRun}</td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '12px', fontFamily: 'monospace' }}>{s.lastDuration}</td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '12px' }}>{s.owner}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ ...ss, padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{s.status}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => toggle(s.id)}
                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '11.5px', cursor: 'pointer' }}
                          >
                            {s.status === 'active' ? '⏸ Pause' : '▶ Resume'}
                          </button>
                          <button
                            onClick={() => runNow(s.id)}
                            disabled={runningId === s.id}
                            style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #dbeafe', background: runningId === s.id ? '#eff6ff' : '#fff', color: '#2563eb', fontSize: '11.5px', cursor: runningId === s.id ? 'not-allowed' : 'pointer' }}
                          >
                            {runningId === s.id ? '⏳ Running…' : '▶ Run Now'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <tr key={`${s.id}-detail`}>
                        <td colSpan={11} style={{ padding: '0', borderBottom: i < filtered.length - 1 ? '1px solid #f3f1ea' : 'none' }}>
                          <div style={{ padding: '20px 28px', background: '#fafaf9', borderTop: '1px solid #f0f0ea' }}>

                            {/* Header row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                              <div style={{ fontWeight: 700, fontSize: '13px', color: '#1a1a1a' }}>
                                Last Run Issues — {s.name}
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                {s.checkedRows} rows checked · {s.failedRows} failed · {s.lastDuration}
                              </div>
                            </div>

                            {/* Issue cards */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {s.issues.map((issue, j) => {
                                const sc = severityConfig[issue.severity]
                                return (
                                  <div key={j} style={{
                                    background: '#fff',
                                    border: `1px solid ${sc.color}40`,
                                    borderLeft: `4px solid ${sc.color}`,
                                    borderRadius: '10px',
                                    padding: '16px 18px',
                                  }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700 }}>
                                        {sc.label}
                                      </span>
                                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#1a1a1a' }}>{issue.rule}</span>
                                      <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '11.5px', color: '#dc2626', fontWeight: 600 }}>
                                        {issue.failedRows} rows failed
                                      </span>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                      <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '12px' }}>
                                        <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#7c3aed', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                          🔍 Root Cause
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#374151', lineHeight: '1.6' }}>{issue.detail}</div>
                                      </div>

                                      <div style={{ background: `${sc.bg}88`, border: `1px solid ${sc.color}30`, borderRadius: '8px', padding: '12px' }}>
                                        <div style={{ fontSize: '10.5px', fontWeight: 700, color: sc.color, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                          💥 Business Impact
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#374151', lineHeight: '1.6' }}>{issue.impact}</div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => runNow(s.id)}
                                disabled={runningId === s.id}
                                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #dbeafe', background: '#eff6ff', color: '#2563eb', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                              >
                                {runningId === s.id ? '⏳ Re-running…' : '▶ Re-run Now'}
                              </button>
                              <button
                                onClick={() => setExpandedId(null)}
                                style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}
                              >
                                ▲ Collapse
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              No schedules match the selected filter
            </div>
          )}
        </div>
      )}
    </div>
  )
}
