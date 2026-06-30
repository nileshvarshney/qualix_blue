'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'

const STEP_TYPE_LABELS: Record<string, string> = {
  scan_job: 'Scan Job', dbt_run: 'dbt Run', fivetran_sync: 'Fivetran Sync',
  airbyte_sync: 'Airbyte Sync', custom_sql: 'Custom SQL', webhook: 'Webhook', wait: 'Wait',
}

const STEP_TYPE_COLOR: Record<string, string> = {
  scan_job: '#6366f1', dbt_run: '#f59e0b', fivetran_sync: '#22c55e',
  airbyte_sync: '#3b82f6', custom_sql: '#8b5cf6', webhook: '#f97316', wait: '#6b7280',
}

const STATUS_COLOR: Record<string, string> = {
  queued: '#6b7280', running: '#3b82f6', succeeded: '#22c55e',
  failed: '#dc2626', cancelled: '#6b7280', pending: '#6b7280', skipped: '#6b7280', retrying: '#f97316',
}

interface PipelineStep {
  step_id: string
  name: string
  step_order: number
  step_type: string
  depends_on: string[]
  timeout_seconds: number
}

interface Pipeline {
  pipeline_id: string
  name: string
  description: string | null
  trigger_type: string
  cron_expr: string | null
  is_active: boolean
  timeout_seconds: number
  step_count: number
  steps?: PipelineStep[]
  created_at: string | null
  updated_at: string | null
}

interface Run {
  run_id: string
  status: string
  triggered_by: string | null
  trigger_type: string
  started_at: string | null
  finished_at: string | null
  created_at: string | null
}

function fmt(dt: string | null | undefined) {
  if (!dt) return '—'
  try { return new Date(dt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) } catch { return dt }
}

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? '#6b7280'
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 5 }} />
}

function DAGView({ steps }: { steps: PipelineStep[] }) {
  if (steps.length === 0) return (
    <div style={{ textAlign: 'center', padding: '24px', fontSize: 12, color: 'var(--text-muted)' }}>No steps yet</div>
  )

  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order)

  return (
    <div style={{ overflowX: 'auto', padding: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 'max-content' }}>
        {sorted.map((step, i) => {
          const color = STEP_TYPE_COLOR[step.step_type] ?? '#6b7280'
          return (
            <div key={step.step_id} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                background: `${color}12`, border: `2px solid ${color}`,
                borderRadius: 10, padding: '10px 14px', minWidth: 120, textAlign: 'center',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.04em', marginBottom: 4 }}>
                  {STEP_TYPE_LABELS[step.step_type] ?? step.step_type}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{step.name}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>#{step.step_order + 1}</div>
              </div>
              {i < sorted.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 4px', flexShrink: 0 }}>
                  <div style={{ width: 24, height: 2, background: 'var(--border)' }} />
                  <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: `7px solid var(--border)` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RunHistory({ runs }: { runs: Run[] }) {
  if (runs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '24px', fontSize: 12, color: 'var(--text-muted)' }}>No runs yet</div>
  )
  return (
    <div>
      {runs.slice(0, 8).map(r => (
        <div key={r.run_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--surface-muted)' }}>
          <StatusDot status={r.status} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{r.status}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>by {r.triggered_by ?? 'system'} · {fmt(r.created_at)}</div>
          </div>
          {r.started_at && r.finished_at && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
              {Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const BLANK_PIPELINE = { name: '', description: '', trigger_type: 'manual', cron_expr: '', is_active: true, timeout_seconds: 3600 }
const BLANK_STEP = { name: '', step_type: 'scan_job', timeout_seconds: 1800 }

export default function PipelinesPage() {
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selected, setSelected] = useState<Pipeline | null>(null)
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showAddStep, setShowAddStep] = useState(false)
  const [form, setForm] = useState(BLANK_PIPELINE)
  const [stepForm, setStepForm] = useState(BLANK_STEP)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'dag' | 'runs'>('dag')

  useEffect(() => {
    function onConnChanged(e: Event) {
      setActiveConnectionId((e as CustomEvent<string>).detail ?? '')
    }
    window.addEventListener('qualix-active-conn-changed', onConnChanged)
    return () => window.removeEventListener('qualix-active-conn-changed', onConnChanged)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (activeConnectionId) params.set('connection_id', activeConnectionId)
      const res = await apiFetch(`/api/pipelines?${params}`)
      const data = await res.json()
      setPipelines(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }, [activeConnectionId])

  useEffect(() => { load() }, [load])

  const selectPipeline = useCallback(async (p: Pipeline) => {
    const [det, runsRes] = await Promise.all([
      apiFetch(`/api/pipelines/${p.pipeline_id}`).then(r => r.json()),
      apiFetch(`/api/pipelines/${p.pipeline_id}/runs`).then(r => r.json()),
    ])
    setSelected(det)
    setRuns(Array.isArray(runsRes) ? runsRes : [])
    setTab('dag')
  }, [])

  const trigger = useCallback(async () => {
    if (!selected) return
    setTriggering(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/pipelines/${selected.pipeline_id}/trigger`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setError(d.detail ?? 'Trigger failed'); return }
      const run = await res.json()
      setRuns(prev => [run, ...prev])
    } catch (e) { setError(String(e)) } finally { setTriggering(false) }
  }, [selected])

  const createPipeline = useCallback(async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    try {
      const res = await apiFetch('/api/pipelines', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, timeout_seconds: Number(form.timeout_seconds) }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.detail ?? 'Create failed'); return }
      const created = await res.json()
      setPipelines(prev => [created, ...prev])
      setShowCreate(false); setForm(BLANK_PIPELINE)
      setSelected(created); setRuns([])
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }, [form])

  const addStep = useCallback(async () => {
    if (!selected || !stepForm.name.trim()) { setError('Step name is required'); return }
    setSaving(true); setError(null)
    try {
      const res = await apiFetch(`/api/pipelines/${selected.pipeline_id}/steps`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...stepForm, timeout_seconds: Number(stepForm.timeout_seconds) }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.detail ?? 'Add step failed'); return }
      const det = await apiFetch(`/api/pipelines/${selected.pipeline_id}`).then(r => r.json())
      setSelected(det)
      setPipelines(prev => prev.map(p => p.pipeline_id === det.pipeline_id ? det : p))
      setShowAddStep(false); setStepForm(BLANK_STEP)
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }, [selected, stepForm])

  const deletePipeline = useCallback(async (id: string) => {
    if (!confirm('Delete this pipeline and all its runs?')) return
    await apiFetch(`/api/pipelines/${id}`, { method: 'DELETE' })
    setPipelines(prev => prev.filter(p => p.pipeline_id !== id))
    if (selected?.pipeline_id === id) setSelected(null)
  }, [selected])

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)',
    fontSize: 12, color: 'var(--foreground)', background: 'var(--surface-muted)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.07em', display: 'block', marginBottom: 4,
  }
  const btnPrimary: React.CSSProperties = {
    padding: '7px 16px', borderRadius: 7, border: 'none', background: 'var(--brand-primary)',
    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }
  const btnSecondary: React.CSSProperties = {
    padding: '7px 16px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)',
    color: 'var(--foreground)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div style={{ paddingLeft: 88, paddingTop: 72, minHeight: '100vh', background: 'var(--background)' }}>
      <div style={{ display: 'flex', height: 'calc(100vh - 72px)' }}>

        {/* Left: pipeline list */}
        <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)' }}>Pipelines</span>
            <button onClick={() => { setShowCreate(true); setError(null) }} style={{ ...btnPrimary, padding: '5px 12px', fontSize: 11 }}>+ New</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
            ) : pipelines.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                No pipelines yet. Create your first one.
              </div>
            ) : pipelines.map(p => (
              <div key={p.pipeline_id}
                onClick={() => selectPipeline(p)}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer',
                  background: selected?.pipeline_id === p.pipeline_id ? 'var(--surface-muted)' : 'transparent',
                }}
                onMouseEnter={e => { if (selected?.pipeline_id !== p.pipeline_id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-muted)' }}
                onMouseLeave={e => { if (selected?.pipeline_id !== p.pipeline_id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.is_active ? '#22c55e' : '#6b7280', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 16 }}>
                  {p.step_count} step{p.step_count !== 1 ? 's' : ''} · {p.trigger_type}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: detail */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#dc2626' }}>
              {error} <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>✕</button>
            </div>
          )}

          {/* Create pipeline modal */}
          {showCreate && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 28, width: 480, boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--foreground)', marginBottom: 20 }}>New Pipeline</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div><label style={labelStyle}>Name</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My Pipeline" /></div>
                  <div><label style={labelStyle}>Description</label><input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" /></div>
                  <div><label style={labelStyle}>Trigger Type</label>
                    <select style={inputStyle} value={form.trigger_type} onChange={e => setForm(f => ({ ...f, trigger_type: e.target.value }))}>
                      <option value="manual">Manual</option>
                      <option value="schedule">Schedule (cron)</option>
                      <option value="event">Event</option>
                    </select>
                  </div>
                  {form.trigger_type === 'schedule' && (
                    <div><label style={labelStyle}>Cron Expression</label><input style={inputStyle} value={form.cron_expr} onChange={e => setForm(f => ({ ...f, cron_expr: e.target.value }))} placeholder="0 6 * * *" /></div>
                  )}
                  <div><label style={labelStyle}>Timeout (seconds)</label><input style={inputStyle} type="number" value={form.timeout_seconds} onChange={e => setForm(f => ({ ...f, timeout_seconds: Number(e.target.value) }))} /></div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                  <button style={btnSecondary} onClick={() => { setShowCreate(false); setError(null) }}>Cancel</button>
                  <button style={btnPrimary} onClick={createPipeline} disabled={saving}>{saving ? 'Creating…' : 'Create Pipeline'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Add step modal */}
          {showAddStep && selected && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--foreground)', marginBottom: 20 }}>Add Step</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div><label style={labelStyle}>Step Name</label><input style={inputStyle} value={stepForm.name} onChange={e => setStepForm(f => ({ ...f, name: e.target.value }))} placeholder="Run dbt models" /></div>
                  <div><label style={labelStyle}>Step Type</label>
                    <select style={inputStyle} value={stepForm.step_type} onChange={e => setStepForm(f => ({ ...f, step_type: e.target.value }))}>
                      {Object.entries(STEP_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div><label style={labelStyle}>Timeout (seconds)</label><input style={inputStyle} type="number" value={stepForm.timeout_seconds} onChange={e => setStepForm(f => ({ ...f, timeout_seconds: Number(e.target.value) }))} /></div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                  <button style={btnSecondary} onClick={() => { setShowAddStep(false); setError(null) }}>Cancel</button>
                  <button style={btnPrimary} onClick={addStep} disabled={saving}>{saving ? 'Adding…' : 'Add Step'}</button>
                </div>
              </div>
            </div>
          )}

          {!selected ? (
            <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-muted)', fontSize: 13 }}>
              Select a pipeline or create a new one to get started
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>{selected.name}</h2>
                  {selected.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{selected.description}</p>}
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Trigger: <strong>{selected.trigger_type}</strong>{selected.cron_expr ? ` (${selected.cron_expr})` : ''}</span>
                    <span style={{ fontSize: 11, color: selected.is_active ? '#22c55e' : '#6b7280', fontWeight: 600 }}>● {selected.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={btnSecondary} onClick={() => { setShowAddStep(true); setError(null) }}>+ Add Step</button>
                  <button style={{ ...btnPrimary, background: '#22c55e', opacity: triggering ? 0.7 : 1 }} onClick={trigger} disabled={triggering || !selected.is_active}>
                    {triggering ? 'Triggering…' : '▶ Run Now'}
                  </button>
                  <button style={{ ...btnSecondary, color: '#dc2626', borderColor: '#fecaca' }} onClick={() => deletePipeline(selected.pipeline_id)}>Delete</button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
                {(['dag', 'runs'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    color: tab === t ? 'var(--brand-primary)' : 'var(--text-muted)',
                    borderBottom: tab === t ? '2px solid var(--brand-primary)' : '2px solid transparent',
                    marginBottom: -2,
                  }}>
                    {t === 'dag' ? 'Pipeline DAG' : 'Run History'}
                  </button>
                ))}
              </div>

              {tab === 'dag' && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>Steps ({selected.steps?.length ?? 0})</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Left-to-right execution order</span>
                  </div>
                  <div style={{ padding: '16px 20px' }}>
                    <DAGView steps={selected.steps ?? []} />
                  </div>
                </div>
              )}

              {tab === 'runs' && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>Run History</span>
                  </div>
                  <div style={{ padding: '16px 20px' }}>
                    <RunHistory runs={runs} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
