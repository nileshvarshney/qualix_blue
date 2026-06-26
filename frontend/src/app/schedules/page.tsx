'use client'
import { useState, useEffect } from 'react'
import { Schedule, RUN_STYLE, STATUS_STYLE, mapSchedule } from '@/lib/schedules'
import ScheduleJobTree from '@/components/shared/ScheduleJobTree'
import { apiFetch } from '@/lib/apiFetch'

type FilterType = 'all' | 'active' | 'paused' | 'failed'

const GRID = '1fr 100px 80px 80px 90px 90px 110px auto'

const SCHED_FREQ_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', custom: 'Custom (cron)' }
const DOW_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function validateCron(expr: string): string | null {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return `Must have exactly 5 fields (got ${parts.length}): minute hour day-of-month month day-of-week`
  const [minute, hour, dom, month, dow] = parts
  const checkField = (val: string, min: number, max: number, name: string): string | null => {
    if (val === '*') return null
    if (/^(\*|\d+)\/\d+$/.test(val)) return null // step e.g. */5
    if (/^\d+-\d+$/.test(val)) return null        // range e.g. 1-5
    if (/^\d+(,\d+)+$/.test(val)) return null     // list e.g. 1,3,5
    const n = Number(val)
    if (isNaN(n)) return `${name} field "${val}" is not valid`
    if (n < min || n > max) return `${name} value ${n} is out of range (${min}–${max})`
    return null
  }
  return checkField(minute, 0, 59, 'Minute') ?? checkField(hour, 0, 23, 'Hour') ?? checkField(dom, 1, 31, 'Day-of-month') ?? checkField(month, 1, 12, 'Month') ?? checkField(dow, 0, 7, 'Day-of-week')
}

function buildCronExpression(frequency: string, time: string, dayOfWeek: string, customCron: string): string {
  if (frequency === 'custom') return customCron
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr ?? 0)
  const minute = Number(minuteStr ?? 0)
  if (frequency === 'weekly') return `${minute} ${hour} * * ${dayOfWeek}`
  return `${minute} ${hour} * * *`
}

export default function SchedulesPage() {
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [scheduleList, setScheduleList] = useState<Schedule[]>([])
  const [loading, setLoading]           = useState(true)
  const [runningId, setRunningId]       = useState<string | null>(null)
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [filter, setFilter]             = useState<FilterType>('all')
  const [pausingRuleId, setPausingRuleId] = useState<string | null>(null)
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [editHour, setEditHour]         = useState(6)
  const [editMinute, setEditMinute]     = useState(0)
  const [editFrequency, setEditFrequency] = useState('daily')
  const [editDayOfWeek, setEditDayOfWeek] = useState('1')
  const [editCron, setEditCron]         = useState('0 2 * * *')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [schedForm, setSchedForm] = useState({ name: '', dataset: '', cron: '0 2 * * *', connection: '', frequency: 'daily', time: '02:00', dayOfWeek: '1' })
  const [schedSaving, setSchedSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [connOptions, setConnOptions] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const url = `/api/schedules${params.toString() ? '?' + params.toString() : ''}`
    fetch(url)
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        setScheduleList((Array.isArray(data) ? data : []).map(mapSchedule))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeConnectionId])

  useEffect(() => {
    apiFetch('/api/connections')
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

  const allRules        = scheduleList.flatMap(s => s.bundledRules)
  const totalRules      = allRules.length
  const activeRules     = allRules.filter(r => r.status === 'active').length
  const pausedRules     = allRules.filter(r => r.status === 'disabled').length
  const failedWarnRules = allRules.filter(r => r.lastRunStatus === 'failed' || r.lastRunStatus === 'warning').length

  const filtered = scheduleList.filter(s => {
    if (filter === 'active') return s.status === 'active'
    if (filter === 'paused') return s.status === 'paused'
    if (filter === 'failed') return s.lastRunStatus === 'failed' || s.lastRunStatus === 'warning'
    return true
  })

  const sorted = [...filtered].sort((a, b) => a.tableFqn.localeCompare(b.tableFqn) || a.id.localeCompare(b.id))
  const tableCount = new Set(filtered.map(s => s.tableFqn)).size

  async function refreshSchedules() {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    const url = `/api/schedules${params.toString() ? '?' + params.toString() : ''}`
    const res = await fetch(url)
    const data: Record<string, unknown>[] = await res.json()
    setScheduleList((Array.isArray(data) ? data : []).map(mapSchedule))
  }

  function startEditSchedule(s: Schedule) {
    setEditingId(s.id)
    setEditHour(s.runAtHour ?? 6)
    setEditMinute(s.runAtMinute ?? 0)
    setEditFrequency(s.frequency === 'weekly' ? 'weekly' : s.frequency === 'daily' ? 'daily' : 'custom')
    setEditDayOfWeek('1')
    setEditCron(s.cron || '0 2 * * *')
  }

  async function saveScheduleTime(id: string) {
    setSavingSchedule(true)
    try {
      const body = editFrequency === 'daily'
        ? { frequency: 'daily', run_at_hour: editHour, run_at_minute: editMinute }
        : editFrequency === 'weekly'
          ? { frequency: 'cron', cron_expression: `${editMinute} ${editHour} * * ${editDayOfWeek}` }
          : { frequency: 'cron', cron_expression: editCron }
      await fetch(`/api/schedules/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await refreshSchedules()
      setEditingId(null)
    } catch {
      // ignore — list simply won't reflect the change
    } finally {
      setSavingSchedule(false)
    }
  }

  async function setRuleStatus(ruleId: string, status: 'active' | 'disabled') {
    setPausingRuleId(ruleId)
    try {
      await fetch(`/api/rules/${ruleId}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await refreshSchedules()
    } catch {
      // ignore — list simply won't reflect the change
    } finally {
      setPausingRuleId(null)
    }
  }

  async function runRule(ruleId: string) {
    setRunningRuleId(ruleId)
    try {
      await fetch(`/api/rules/${ruleId}/run`, { method: 'POST' })
      await refreshSchedules()
    } catch {
      // ignore — list simply won't reflect the change
    } finally {
      setRunningRuleId(null)
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
    if (schedForm.frequency === 'custom') {
      const cronErr = validateCron(schedForm.cron)
      if (cronErr) { setCreateError(`Invalid cron expression: ${cronErr}`); return }
    }
    const cronExpression = buildCronExpression(schedForm.frequency, schedForm.time, schedForm.dayOfWeek, schedForm.cron)
    if (!schedForm.name || !cronExpression) return
    setSchedSaving(true)
    try {
      const res = await fetch('/api/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          create: true,
          schedule_name: schedForm.name,
          asset_name: schedForm.dataset,
          cron_expression: cronExpression,
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
      setSchedForm({ name: '', dataset: '', cron: '0 2 * * *', connection: '', frequency: 'daily', time: '02:00', dayOfWeek: '1' })
    } catch (err) {
      console.error(err)
      setCreateError('Failed to create schedule. Please try again.')
    } finally {
      setSchedSaving(false)
    }
  }

  const CARDS = [
    { key: 'all',    label: 'Total',          value: scheduleList.length, rules: totalRules,      color: 'var(--accent)'            },
    { key: 'active', label: 'Active',          value: active,              rules: activeRules,     color: 'var(--status-ok-text)'    },
    { key: 'paused', label: 'Paused',          value: paused,              rules: pausedRules,     color: 'var(--text-muted)'        },
    { key: 'failed', label: 'Failed/Warning',  value: failed + warning,    rules: failedWarnRules, color: 'var(--status-error-text)' },
  ] as const

  return (
    <div style={{ paddingTop: '16px', paddingLeft: '24px', paddingBottom: '16px', paddingRight: '24px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

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
              style={{ background: on ? s.color : `color-mix(in srgb, ${s.color} 12%, var(--surface))`, border: `1px solid ${on ? s.color : `color-mix(in srgb, ${s.color} 35%, var(--border))`}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: on ? '#fff' : s.color, lineHeight: 1 }}>{loading ? '…' : s.value}</div>
              <div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: on ? '#fff' : s.color }}>{s.label}</div>
                <div style={{ fontSize: '10px', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>
                  {loading ? '…' : `${s.value} table${s.value !== 1 ? 's' : ''} · ${s.rules} rule${s.rules !== 1 ? 's' : ''}`}
                </div>
              </div>
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
          const isSelected = selectedId === s.id
          const rs         = s.lastRunStatus ? RUN_STYLE[s.lastRunStatus] : { background: 'var(--surface-muted)', color: 'var(--text-muted)' }
          const ss         = STATUS_STYLE[s.status]
          const hasIssues  = s.issues.length > 0
          const isEditing  = editingId === s.id

          return (
            <div key={s.id}>
              {/* schedule row */}
              <div onClick={() => setSelectedId(isSelected ? null : s.id)}
                style={{ display: 'grid', gridTemplateColumns: GRID, gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isSelected ? 'var(--surface-muted)' : hasIssues && s.lastRunStatus !== 'passed' ? 'rgba(254,242,242,0.4)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', minHeight: '30px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                  <span style={{ color: hasIssues ? (s.lastRunStatus === 'failed' ? 'var(--status-error-text)' : 'var(--status-warn-text)') : 'var(--text-muted)', fontSize: '9px', flexShrink: 0, transform: isSelected ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.tableFqn}</span>
                    {isEditing ? (
                      <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <select value={editFrequency} onChange={e => setEditFrequency(e.target.value)}
                          style={{ fontSize: '10px', padding: '1px 3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          {Object.entries(SCHED_FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        {editFrequency === 'weekly' && (
                          <select value={editDayOfWeek} onChange={e => setEditDayOfWeek(e.target.value)}
                            style={{ fontSize: '10px', padding: '1px 3px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                            {DOW_LABEL.map((label, i) => <option key={i} value={String(i)}>{label.slice(0, 3)}</option>)}
                          </select>
                        )}
                        {(editFrequency === 'daily' || editFrequency === 'weekly') && (
                          <>
                            <input type="number" min={0} max={23} value={editHour} onChange={e => setEditHour(Number(e.target.value))}
                              style={{ width: '36px', fontSize: '10px', padding: '1px 3px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>:</span>
                            <input type="number" min={0} max={59} value={editMinute} onChange={e => setEditMinute(Number(e.target.value))}
                              style={{ width: '36px', fontSize: '10px', padding: '1px 3px', borderRadius: '4px', border: '1px solid var(--border)' }} />
                          </>
                        )}
                        {editFrequency === 'custom' && (
                          <input value={editCron} onChange={e => setEditCron(e.target.value)} placeholder="0 2 * * *"
                            style={{ width: '90px', fontSize: '10px', padding: '1px 3px', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'monospace' }} />
                        )}
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
                    {s.lastRunStatus === null ? '—' : `${s.lastRunStatus === 'passed' ? '✓' : s.lastRunStatus === 'failed' ? '✕' : '⚠'} ${s.lastRunStatus}`}
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
                    style={{ padding: '3px 8px', borderRadius: '5px', border: '1px solid var(--status-info-bg)', background: runningId === s.id ? 'var(--status-info-bg)' : 'var(--surface)', color: 'var(--status-info-text)', fontSize: '10px', cursor: runningId === s.id ? 'not-allowed' : 'pointer' }}>
                    {runningId === s.id ? '⏳' : '▶ Run'}
                  </button>
                </div>
              </div>

              {isSelected && (
                <div style={{ padding: '12px 16px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                  <ScheduleJobTree
                    schedule={s}
                    runningRuleId={runningRuleId}
                    onRunRule={runRule}
                    pausingRuleId={pausingRuleId}
                    onSetRuleStatus={setRuleStatus}
                  />
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
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Frequency *</label>
              <select value={schedForm.frequency} onChange={e => setSchedForm(p => ({ ...p, frequency: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                {Object.entries(SCHED_FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {(schedForm.frequency === 'daily' || schedForm.frequency === 'weekly') && (
              <div style={{ display: 'flex', gap: '10px' }}>
                {schedForm.frequency === 'weekly' && (
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Day of Week</label>
                    <select value={schedForm.dayOfWeek} onChange={e => setSchedForm(p => ({ ...p, dayOfWeek: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                      {DOW_LABEL.map((label, i) => <option key={i} value={String(i)}>{label}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Time *</label>
                  <input type="time" value={schedForm.time} onChange={e => setSchedForm(p => ({ ...p, time: e.target.value }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
              </div>
            )}
            {schedForm.frequency === 'custom' && (
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Cron Expression *</label>
                <input value={schedForm.cron} onChange={e => setSchedForm(p => ({ ...p, cron: e.target.value }))}
                  placeholder="0 2 * * * (daily at 2am)"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'monospace' }} />
              </div>
            )}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Connection</label>
              <select value={schedForm.connection} onChange={e => setSchedForm(p => ({ ...p, connection: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                <option value="">— None —</option>
                {connOptions.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {createError && (
              <div style={{ fontSize: '11px', color: 'var(--status-error-text)', background: 'var(--status-error-bg)', padding: '6px 10px', borderRadius: '6px' }}>
                {createError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCreate(false); setSchedForm({ name: '', dataset: '', cron: '0 2 * * *', connection: '', frequency: 'daily', time: '02:00', dayOfWeek: '1' }); setCreateError(null) }}
                style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createSchedule} disabled={schedSaving || !schedForm.name || !buildCronExpression(schedForm.frequency, schedForm.time, schedForm.dayOfWeek, schedForm.cron)}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (schedSaving || !schedForm.name || !buildCronExpression(schedForm.frequency, schedForm.time, schedForm.dayOfWeek, schedForm.cron)) ? 'not-allowed' : 'pointer', opacity: (schedSaving || !schedForm.name || !buildCronExpression(schedForm.frequency, schedForm.time, schedForm.dayOfWeek, schedForm.cron)) ? 0.6 : 1 }}>
                {schedSaving ? 'Creating…' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
