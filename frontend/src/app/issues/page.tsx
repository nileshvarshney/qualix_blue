'use client'
import { useState, useEffect } from 'react'

type Status   = 'open' | 'investigating' | 'resolved'
type Severity = 'critical' | 'warning'

type Activity = { by: string; action: string; time: string }
type Issue = {
  id: string; title: string; dataset: string; rule: string
  severity: Severity; status: Status; owner: string; opened: string
  count: number; rootCause: string; impact: string; recommendation: string
  affectedColumns: string[]; activity: Activity[]
}

const SEV_CFG = {
  critical: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', label: 'Critical', barColor: '#dc2626' },
  warning:  { bg: '#fef3c7', color: '#d97706', border: '#fde68a', label: 'Warning',  barColor: '#f59e0b' },
}
const ST_CFG = {
  open:          { background: '#fee2e2', color: '#dc2626', label: 'Open'          },
  investigating: { background: '#fef3c7', color: '#d97706', label: 'Investigating' },
  resolved:      { background: '#dcfce7', color: '#16a34a', label: 'Resolved'      },
}
const STATUS_FLOW: Record<Status, Status[]> = {
  open:          ['investigating', 'resolved'],
  investigating: ['open', 'resolved'],
  resolved:      ['open', 'investigating'],
}

function avatarInitial(name: string) {
  return name === 'System' ? '⚙' : name.split(' ').map(w => w[0]).join('').slice(0, 2)
}

export default function IssuesPage() {
  const [issues, setIssues]     = useState<Issue[]>([])
  const [loading, setLoading]   = useState(true)
  const [statusF, setStatusF]   = useState<'all' | Status>('all')
  const [sevF, setSevF]         = useState<'all' | Severity>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing]   = useState<Issue | null>(null)
  const [editForm, setEditForm] = useState({ title: '', owner: '', severity: 'critical' as Severity, status: 'open' as Status })
  const [collapsedDatasets, setCollapsedDatasets] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/issues')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        const items: Issue[] = (Array.isArray(data) ? data : []).map((inc, i) => ({
          id: String(inc.incident_id ?? inc.id ?? `ISS-${String(i + 1).padStart(3, '0')}`),
          title: String(inc.title ?? inc.name ?? ''),
          dataset: String(inc.asset_name ?? inc.dataset ?? ''),
          rule: String(inc.rule_name ?? inc.rule ?? ''),
          severity: ((inc.severity as Severity) ?? 'warning'),
          status: ((inc.status as Status) ?? 'open'),
          owner: String(inc.owner ?? inc.assigned_to ?? ''),
          opened: String(inc.created_at ?? inc.opened ?? ''),
          count: Number(inc.affected_rows ?? inc.count ?? 0),
          rootCause: String(inc.root_cause ?? inc.rootCause ?? ''),
          impact: String(inc.impact ?? ''),
          recommendation: String(inc.recommendation ?? ''),
          affectedColumns: Array.isArray(inc.affected_columns) ? inc.affected_columns as string[] : [],
          activity: Array.isArray(inc.activity) ? inc.activity as Activity[] : [],
        }))
        setIssues(items)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const openCount = issues.filter(i => i.status === 'open').length
  const inv       = issues.filter(i => i.status === 'investigating').length
  const res       = issues.filter(i => i.status === 'resolved').length
  const crit      = issues.filter(i => i.severity === 'critical' && i.status !== 'resolved').length

  const filtered = issues
    .filter(i => statusF === 'all' || i.status === statusF)
    .filter(i => sevF === 'all' || i.severity === sevF)

  // Group by dataset
  const byDataset = filtered.reduce<Record<string, Issue[]>>((acc, i) => {
    const key = i.dataset || '(no dataset)'
    ;(acc[key] ??= []).push(i); return acc
  }, {})
  const datasets = Object.keys(byDataset).sort()

  function toggleDataset(ds: string) {
    setCollapsedDatasets(prev => { const s = new Set(prev); s.has(ds) ? s.delete(ds) : s.add(ds); return s })
  }

  function changeStatus(id: string, newStatus: Status) {
    setIssues(prev => prev.map(i => {
      if (i.id !== id) return i
      const entry: Activity = { by: 'You', action: `Status changed to ${newStatus}`, time: 'just now' }
      return { ...i, status: newStatus, activity: [...i.activity, entry] }
    }))
  }

  function openEdit(issue: Issue) {
    setEditForm({ title: issue.title, owner: issue.owner, severity: issue.severity, status: issue.status })
    setEditing(issue)
  }

  function saveEdit() {
    if (!editing) return
    setIssues(prev => prev.map(i => {
      if (i.id !== editing.id) return i
      const entry: Activity = { by: 'You', action: 'Issue details updated', time: 'just now' }
      return { ...i, ...editForm, activity: [...i.activity, entry] }
    }))
    setEditing(null)
  }

  const CARDS = [
    { key: 'open'          as 'all' | Status, label: 'Open',          value: openCount, color: '#dc2626' },
    { key: 'investigating' as 'all' | Status, label: 'Investigating', value: inv,        color: '#d97706' },
    { key: 'resolved'      as 'all' | Status, label: 'Resolved',      value: res,        color: '#16a34a' },
    { key: 'all'           as 'all' | Status, label: 'Critical',      value: crit,       color: '#dc2626' },
  ]

  return (
    <div style={{ padding: '16px 24px', height: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '10px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Issues</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
            {loading ? 'Loading…' : `${openCount + inv} open · ${crit} critical · ${datasets.length} dataset${datasets.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        <button style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
          + Create Issue
        </button>
      </div>

      {/* stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px', flexShrink: 0 }}>
        {CARDS.map(s => {
          const on = statusF === s.key && s.key !== 'all'
          return (
            <div key={s.label} onClick={() => setStatusF(on || s.key === 'all' ? 'all' : s.key)}
              style={{ background: on ? s.color : 'var(--surface)', border: `1px solid ${on ? s.color : 'var(--border)'}`, borderRadius: '8px', padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: on ? '#fff' : s.color, lineHeight: 1 }}>{loading ? '…' : s.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: on ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)' }}>{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* filter pills */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'open', 'investigating', 'resolved'] as const).map(f => (
          <button key={f} onClick={() => setStatusF(f)} style={{
            padding: '4px 12px', borderRadius: '20px', border: '1px solid', fontSize: 'var(--text-xs)', cursor: 'pointer',
            fontWeight: statusF === f ? 600 : 400,
            borderColor: statusF === f ? 'var(--foreground)' : 'var(--border)',
            background: statusF === f ? 'var(--foreground)' : 'var(--surface)',
            color: statusF === f ? 'var(--background)' : 'var(--text-secondary)',
          }}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
        <div style={{ width: '1px', background: 'var(--border)', margin: '0 2px', height: '16px' }} />
        {(['all', 'critical', 'warning'] as const).map(s => (
          <button key={s} onClick={() => setSevF(s as 'all' | Severity)} style={{
            padding: '4px 12px', borderRadius: '20px', border: '1px solid', fontSize: 'var(--text-xs)', cursor: 'pointer',
            fontWeight: sevF === s ? 600 : 400,
            borderColor: sevF === s ? (s === 'critical' ? '#dc2626' : s === 'warning' ? '#d97706' : 'var(--foreground)') : 'var(--border)',
            background: sevF === s ? (s === 'critical' ? '#fee2e2' : s === 'warning' ? '#fef3c7' : 'var(--foreground)') : 'var(--surface)',
            color: sevF === s ? (s === 'critical' ? '#dc2626' : s === 'warning' ? '#d97706' : 'var(--background)') : 'var(--text-secondary)',
          }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      {/* column header */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '4px auto auto 1fr auto auto 24px', gap: '0 8px', padding: '0 24px', flexShrink: 0, borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {['', 'ID', 'Severity · Status', 'Title · Rule', 'Records', 'Owner · Opened', ''].map((h, i) => (
            <span key={i} style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list grouped by dataset */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</div>}
        {!loading && issues.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '8px', border: '1px dashed var(--border)' }}>No issues yet</div>
        )}
        {!loading && issues.length > 0 && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No issues match your filters</div>
        )}

        {!loading && datasets.map(ds => {
          const dsIssues  = byDataset[ds]
          const collapsed = collapsedDatasets.has(ds)
          const dsOpen    = dsIssues.filter(i => i.status === 'open').length

          return (
            <div key={ds} style={{ marginBottom: '3px' }}>
              {/* dataset group header */}
              <div onClick={() => toggleDataset(ds)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', userSelect: 'none', marginBottom: '2px' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'inline-block', transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform 0.12s', lineHeight: 1, width: '8px', flexShrink: 0 }}>▶</span>
                <span style={{ fontSize: '11px', flexShrink: 0 }}>🗂</span>
                <code style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)', color: 'var(--foreground)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ds}</code>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{dsIssues.length} issue{dsIssues.length !== 1 ? 's' : ''}</span>
                {dsOpen > 0 && <span style={{ fontSize: '10px', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{dsOpen} open</span>}
              </div>

              {!collapsed && (
                <div style={{ marginLeft: '16px', marginBottom: '2px', borderLeft: '2px solid var(--border)' }}>
                  {dsIssues.map(issue => {
                    const sc     = SEV_CFG[issue.severity]
                    const st     = ST_CFG[issue.status]
                    const isOpen = expanded === issue.id
                    const nextStatuses = STATUS_FLOW[issue.status]

                    return (
                      <div key={issue.id}>
                        {/* single-line row */}
                        <div onClick={() => setExpanded(isOpen ? null : issue.id)}
                          style={{ display: 'grid', gridTemplateColumns: '4px auto auto 1fr auto auto 24px', gap: '0 8px', alignItems: 'center', padding: '4px 8px', background: isOpen ? 'var(--surface-muted)' : 'var(--surface)', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', minHeight: '28px' }}>
                          <div style={{ width: '4px', alignSelf: 'stretch', background: sc.barColor, borderRadius: '2px', minHeight: '16px' }} />
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{issue.id}</span>
                          <div style={{ display: 'flex', gap: '4px', whiteSpace: 'nowrap' }}>
                            <span style={{ background: sc.bg, color: sc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{sc.label}</span>
                            <span style={{ background: st.background, color: st.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{st.label}</span>
                          </div>
                          <div style={{ minWidth: 0, overflow: 'hidden' }}>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}
                              title={issue.title + (issue.rule ? ` · Rule: ${issue.rule}` : '')}>
                              {issue.title}
                              {issue.rule && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {issue.rule}</span>}
                            </span>
                          </div>
                          <span style={{ fontSize: '10px', whiteSpace: 'nowrap', color: issue.count > 0 ? sc.color : 'var(--status-ok-text)', fontWeight: 600 }}>
                            {issue.count > 0 ? `${issue.count.toLocaleString('en-US')} rows` : 'all clean'}
                          </span>
                          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block' }}>{issue.owner}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{issue.opened}</span>
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: '10px', textAlign: 'center', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
                        </div>

                        {/* expanded detail */}
                        {isOpen && (
                          <div style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                              {[
                                { label: 'Dataset',  value: issue.dataset || '—' },
                                { label: 'Rule',     value: issue.rule || '—' },
                                { label: 'Owner',    value: issue.owner || '—' },
                                { label: 'Opened',   value: issue.opened || '—' },
                                { label: 'Records',  value: issue.count > 0 ? `${issue.count.toLocaleString('en-US')} affected` : 'All clean' },
                              ].map((m, i) => (
                                <div key={i} style={{ flex: 1, padding: '8px 12px', borderRight: i < 4 ? '1px solid var(--border)' : 'none' }}>
                                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{m.label}</div>
                                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)' }}>{m.value}</div>
                                </div>
                              ))}
                            </div>

                            {issue.rootCause && (
                              <div style={{ background: 'var(--surface)', border: '1px solid #e0e7ff', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                <span style={{ color: '#4338ca', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>{issue.rootCause}
                              </div>
                            )}
                            {(issue.impact || issue.recommendation) && (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                {issue.impact && (
                                  <div style={{ background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                    <span style={{ color: sc.color, fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>{issue.impact}
                                  </div>
                                )}
                                {issue.recommendation && (
                                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--foreground)', lineHeight: 1.6 }}>
                                    <span style={{ color: '#15803d', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fix · </span>{issue.recommendation}
                                  </div>
                                )}
                              </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              {issue.affectedColumns.length > 0 && (
                                <div style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', padding: '10px 14px' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Affected Columns</div>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {issue.affectedColumns.map(c => (
                                      <code key={c} style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '10.5px', fontFamily: 'monospace', border: '1px solid var(--border)' }}>{c}</code>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {issue.activity.length > 0 && (
                                <div style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', padding: '10px 14px' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Activity</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                                    {[...issue.activity].reverse().map((a, i) => (
                                      <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#94a3b8', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: 700, flexShrink: 0 }}>
                                          {avatarInitial(a.by)}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--foreground)' }}>{a.by}</span>
                                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>{a.time}</span>
                                          <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>{a.action}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Move to:</span>
                              {nextStatuses.map(ns => (
                                <button key={ns} onClick={e => { e.stopPropagation(); changeStatus(issue.id, ns) }} style={{
                                  padding: '4px 12px', borderRadius: '6px', border: `1px solid ${ST_CFG[ns].color}`,
                                  background: ST_CFG[ns].background, color: ST_CFG[ns].color,
                                  fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
                                }}>→ {ST_CFG[ns].label}</button>
                              ))}
                              <div style={{ flex: 1 }} />
                              <button onClick={e => { e.stopPropagation(); openEdit(issue) }} style={{
                                padding: '4px 12px', borderRadius: '6px', border: '1px solid #c7d2fe', background: '#eef2ff',
                                color: '#4f46e5', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
                              }}>✏ Edit</button>
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

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}
          onClick={() => setEditing(null)}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', width: '460px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--foreground)' }}>Edit Issue</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>{editing.id}</div>
              </div>
              <button onClick={() => setEditing(null)} style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', width: '26px', height: '26px', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Issue Title</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', boxSizing: 'border-box', outline: 'none', background: 'var(--surface-muted)', color: 'var(--foreground)' }} />
              </div>
              <div>
                <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Owner / Team</label>
                <input value={editForm.owner} onChange={e => setEditForm(f => ({ ...f, owner: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', boxSizing: 'border-box', outline: 'none', background: 'var(--surface-muted)', color: 'var(--foreground)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Severity</label>
                  <select value={editForm.severity} onChange={e => setEditForm(f => ({ ...f, severity: e.target.value as Severity }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Status }))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: 'var(--text-xs)', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
                <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveEdit} style={{ flex: 2, padding: '8px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
