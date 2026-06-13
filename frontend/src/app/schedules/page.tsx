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

interface BundledRule {
  ruleId: string
  ruleName: string
  ruleDescription: string
  severity: 'critical' | 'high' | 'medium' | 'low'
}

interface Schedule {
  id: string; name: string; dataset: string; tableFqn: string; cron: string; human: string
  frequency: string; runAtHour: number | null; runAtMinute: number | null
  rules: number; lastRun: string; nextRun: string; status: ScheduleStatus
  lastRunStatus: LastRunStatus; lastDuration: string; connection: string
  owner: string; failedRules: number; checkedRows: string; failedRows: string
  issues: RunIssue[]; bundledRules: BundledRule[]
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

function mapSchedule(s: Record<string, unknown>, i: number): Schedule {
  const dataset = String(s.asset_name ?? s.dataset ?? '')
  const tableFqn = [s.asset_database, s.asset_schema, s.asset_name]
    .filter(v => typeof v === 'string' && v)
    .join('.') || dataset || '(unscoped)'
  return {
    id:            String(s.schedule_id ?? s.id ?? i),
    name:          String(s.schedule_name ?? s.name ?? ''),
    dataset,
    tableFqn,
    cron:          String(s.cron_expression ?? s.cron ?? ''),
    human:         String(s.human_readable ?? s.human ?? s.cron_expression ?? ''),
    frequency:     String(s.frequency ?? 'daily'),
    runAtHour:     s.run_at_hour === null || s.run_at_hour === undefined ? null : Number(s.run_at_hour),
    runAtMinute:   s.run_at_minute === null || s.run_at_minute === undefined ? null : Number(s.run_at_minute),
    rules:         Number(s.rule_count ?? s.rules ?? 0),
    lastRun:       String(s.last_run_at ?? s.lastRun ?? '—'),
    nextRun:       String(s.next_run_at ?? s.nextRun ?? '—'),
    status:        (s.is_active ? 'active' : 'paused') as ScheduleStatus,
    lastRunStatus: (['passed', 'failed', 'warning'] as const).includes(s.last_run_status as 'passed' | 'failed' | 'warning')
                     ? (s.last_run_status as 'passed' | 'failed' | 'warning')
                     : 'passed',
    lastDuration:  String(s.last_duration ?? s.lastDuration ?? '—'),
    connection:    String(s.connection_name ?? s.connection ?? '(no connection)'),
    owner:         String(s.owner ?? ''),
    failedRules:   Number(s.failed_rules ?? s.failedRules ?? 0),
    checkedRows:   String(s.checked_rows ?? s.checkedRows ?? '0'),
    failedRows:    String(s.failed_rows ?? s.failedRows ?? '0'),
    issues:        Array.isArray(s.issues) ? s.issues as RunIssue[] : [],
    bundledRules:  Array.isArray(s.bundled_rules) ? (s.bundled_rules as Record<string, unknown>[]).map(r => ({
                     ruleId: String(r.rule_id ?? ''),
                     ruleName: String(r.rule_name ?? ''),
                     ruleDescription: String(r.rule_description ?? ''),
                     severity: (r.severity ?? 'medium') as BundledRule['severity'],
                   })) : [],
  }
}

const RULE_SEV_CFG: Record<BundledRule['severity'], { color: string; bg: string }> = {
  critical: { color: '#dc2626', bg: '#fee2e2' },
  high:     { color: '#d97706', bg: '#fef3c7' },
  medium:   { color: '#2563eb', bg: '#dbeafe' },
  low:      { color: 'var(--text-muted)', bg: 'var(--surface-muted)' },
}

export default function SchedulesPage() {
  const [scheduleList, setScheduleList] = useState<Schedule[]>([])
  const [loading, setLoading]           = useState(true)
  const [runningId, setRunningId]       = useState<string | null>(null)
  const [expandedId, setExpandedId]     = useState<string | null>(null)
  const [filter, setFilter]             = useState<FilterType>('all')
  const [pausingRuleId, setPausingRuleId] = useState<string | null>(null)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editHour, setEditHour]         = useState(6)
  const [editMinute, setEditMinute]     = useState(0)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [schedForm, setSchedForm] = useState({ name: '', dataset: '', cron: '0 2 * * *', connection: '' })
  const [schedSaving, setSchedSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [connOptions, setConnOptions] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/schedules')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setScheduleList((Array.isArray(data) ? data : []).map(mapSchedule))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/connections')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setConnOptions((Array.isArray(data) ? data : []).map(c => ({
          id: String(c.connection_id ?? c.id ?? ''),
          name: String(c.connection_name ?? c.name ?? ''),
        })))
      })
      .catch(() => {})
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

  const sorted = [...filtered].sort((a, b) => a.tableFqn.localeCompare(b.tableFqn) || a.id.localeCompare(b.id))
  const tableCount = new Set(filtered.map(s => s.tableFqn)).size

  async function refreshSchedules() {
    const res = await fetch('/api/schedules')
    const data: Record<string, unknown>[] = await res.json()
    setScheduleList((Array.isArray(data) ? data : []).map(mapSchedule))
  }

  function startEditSchedule(s: Schedule) {
    setEditingId(s.id)
    setEditHour(s.runAtHour ?? 6)
    setEditMinute(s.runAtMinute ?? 0)
  }

  async function saveScheduleTime(id: string) {
    setSavingSchedule(true)
    try {
      await fetch(`/api/schedules/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_at_hour: editHour, run_at_minute: editMinute }),
      })
      await refreshSchedules()
      setEditingId(null)
    } catch {
      // ignore — list simply won't reflect the change
    } finally {
      setSavingSchedule(false)
    }
  }

  async function pauseRule(ruleId: string) {
    setPausingRuleId(ruleId)
    try {
      await fetch(`/api/rules/${ruleId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disabled' }),
      })
      await refreshSchedules()
    } catch {
      // ignore — list simply won't reflect the change
    } finally {
      setPausingRuleId(null)
    }
  }

  function toggle(id: string) {
    const current = scheduleList.find(s => s.id === id)
    const action = current?.status === 'active' ? 'pause' : 'resume'
    setScheduleList(prev => prev.map(s => s.id === id ? { ...s, status: s.status === 'active' ? 'paused' : 'active' } : s))
    fetch('/api/schedules', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    }).catch(() => {})
  }

  function runNow(id: string) {
    setRunningId(id)
    fetch('/api/schedules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {}).finally(() => {
      setRunningId(null)
      setScheduleList(prev => prev.map(s => s.id === id
        ? { ...s, lastRun: new Date().toISOString().slice(0, 16).replace('T', ' ') } : s))
    })
  }

  async function createSchedule() {
    if (!schedForm.name || !schedForm.cron) return
    setSchedSaving(true)
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create: true,
          schedule_name: schedForm.name,
          asset_name: schedForm.dataset,
          cron_expression: schedForm.cron,
          connection_name: schedForm.connection,
          is_active: true,
        }),
      })
      if (!res.ok) throw new Error(`Failed to create schedule: ${res.status}`)
      // Re-fetch schedules list after successful create
      const listRes = await fetch('/api/schedules')
      if (!listRes.ok) throw new Error('Failed to reload schedules')
      const data: Record<string, unknown>[] = await listRes.json()
      setScheduleList((Array.isArray(data) ? data : []).map(mapSchedule))
      setShowCreate(false)
      setSchedForm({ name: '', dataset: '', cron: '0 2 * * *', connection: '' })
    } catch (err) {
      console.error(err)
      setCreateError('Failed to create schedule. Please try again.')
    } finally {
      setSchedSaving(false)
    }
  }

  const CARDS = [
    { key: 'all',    label: 'Total',          value: scheduleList.length, color: 'var(--accent)'            },
    { key: 'active', label: 'Active',          value: active,              color: 'var(--status-ok-text)'    },
    { key: 'paused', label: 'Paused',          value: paused,              color: 'var(--text-muted)'        },
    { key: 'failed', label: 'Failed/Warning',  value: failed + warning,    color: 'var(--status-error-text)' },
  ] as const

  return (
    <div style={{ padding: '16px 24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Schedules</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${active} of ${scheduleList.length} active · ${tableCount} table${tableCount !== 1 ? 's' : ''}${(failed + warning) > 0 ? ` · ${failed + warning} need attention` : ''}`}
          </div>
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError(null) }} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
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

      {/* scrollable list grouped by table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {!loading && scheduleList.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>No schedules yet</div>
        )}
        {!loading && scheduleList.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No schedules match the selected filter</div>
        )}

        {!loading && sorted.map(s => {
          const isExpanded = expandedId === s.id
          const rs         = RUN_STYLE[s.lastRunStatus]
          const ss         = STATUS_STYLE[s.status]
          const hasIssues  = s.issues.length > 0
          const hasRules   = s.bundledRules.length > 0
          const canExpand  = hasIssues || hasRules
          const isEditing  = editingId === s.id

          return (
            <div key={s.id}>
              {/* schedule row */}
              <div onClick={() => canExpand && setExpandedId(isExpanded ? null : s.id)}
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isExpanded ? 'var(--surface-muted)' : hasIssues && s.lastRunStatus !== 'passed' ? 'rgba(254,242,242,0.4)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', cursor: canExpand ? 'pointer' : 'default', minHeight: '30px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                  {canExpand && (
                    <span style={{ color: hasIssues ? (s.lastRunStatus === 'failed' ? '#dc2626' : '#d97706') : 'var(--text-muted)', fontSize: '9px', flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                  )}
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.tableFqn}</span>
                    {isEditing ? (
                      <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="number" min={0} max={23} value={editHour} onChange={e => setEditHour(Number(e.target.value))}
                          style={{ width: '36px', fontSize: '10px', padding: '1px 3px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>:</span>
                        <input type="number" min={0} max={59} value={editMinute} onChange={e => setEditMinute(Number(e.target.value))}
                          style={{ width: '36px', fontSize: '10px', padding: '1px 3px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                        <button onClick={() => saveScheduleTime(s.id)} disabled={savingSchedule}
                          style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: savingSchedule ? 'not-allowed' : 'pointer' }}>
                          {savingSchedule ? '⏳' : '✓'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
                          ✕
                        </button>
                      </span>
                    ) : (
                      <span onClick={e => { e.stopPropagation(); startEditSchedule(s) }}
                        style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {s.runAtHour !== null ? `Daily at ${String(s.runAtHour).padStart(2, '0')}:${String(s.runAtMinute ?? 0).padStart(2, '0')}` : s.cron}
                        <span style={{ color: 'var(--accent)' }}>✎</span>
                      </span>
                    )}
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
                  {hasRules && (
                    <div style={{ marginBottom: hasIssues ? '14px' : 0 }}>
                      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--foreground)', marginBottom: '8px' }}>
                        Scheduled Rules — {s.bundledRules.length}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {s.bundledRules.map(rule => {
                          const rc = RULE_SEV_CFG[rule.severity]
                          const isPausing = pausingRuleId === rule.ruleId
                          return (
                            <div key={rule.ruleId} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px' }}>
                              <span style={{ background: rc.bg, color: rc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>{rule.severity}</span>
                              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)' }}>{rule.ruleName}</span>
                              {rule.ruleDescription && (
                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{rule.ruleDescription}</span>
                              )}
                              <button onClick={() => pauseRule(rule.ruleId)} disabled={isPausing}
                                title="Pause this rule"
                                style={{ marginLeft: 'auto', flexShrink: 0, padding: '2px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: isPausing ? 'not-allowed' : 'pointer' }}>
                                {isPausing ? '⏳' : '⏸ Pause'}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {hasIssues && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--foreground)' }}>Last Run Issues — {s.tableFqn}</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{s.checkedRows} checked · {s.failedRows} failed · {s.lastDuration}</span>
                  </div>
                  )}
                  {hasIssues && (
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
                  )}
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

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '440px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>New Schedule</div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Schedule Name *</label>
              <input value={schedForm.name} onChange={e => setSchedForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Daily Orders Check"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Dataset / Asset</label>
              <input value={schedForm.dataset} onChange={e => setSchedForm(p => ({ ...p, dataset: e.target.value }))}
                placeholder="e.g. ORDERS table"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Cron Expression *</label>
              <input value={schedForm.cron} onChange={e => setSchedForm(p => ({ ...p, cron: e.target.value }))}
                placeholder="0 2 * * * (daily at 2am)"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Connection</label>
              <select value={schedForm.connection} onChange={e => setSchedForm(p => ({ ...p, connection: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                <option value="">— None —</option>
                {connOptions.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {createError && (
              <div style={{ fontSize: '11px', color: '#dc2626', background: '#fee2e2', padding: '6px 10px', borderRadius: '6px' }}>
                {createError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCreate(false); setSchedForm({ name: '', dataset: '', cron: '0 2 * * *', connection: '' }); setCreateError(null) }}
                style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createSchedule} disabled={schedSaving || !schedForm.name || !schedForm.cron}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (schedSaving || !schedForm.name || !schedForm.cron) ? 'not-allowed' : 'pointer', opacity: (schedSaving || !schedForm.name || !schedForm.cron) ? 0.6 : 1 }}>
                {schedSaving ? 'Creating…' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
