'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

interface Incident {
  id: string; title: string; asset: string; severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'investigating' | 'resolved'
  createdAt: string; resolvedAt: string | null
  description: string; owner: string; ttrMinutes: number | null; alertId: string | null
}

const SEV: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)', border: '#fca5a5' },
  high:     { bg: 'var(--status-warn-bg)',  color: '#ea580c',                  border: '#fdba74' },
  medium:   { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)',  border: '#fde68a' },
  low:      { bg: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)',    border: '#86efac' },
}
const ST: Record<string, { bg: string; color: string }> = {
  open:          { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
  investigating: { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
  resolved:      { bg: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)'    },
}

interface EscalationPolicy {
  policy_id: string; name: string; severity: string; is_active: boolean
  steps: Record<string, unknown>[] | null; repeat_interval_minutes: number; max_escalations: number
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'investigating' | 'resolved'>('all')
  const [popup, setPopup] = useState<Incident | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [incForm, setIncForm] = useState({ title: '', severity: 'medium', asset: '', description: '' })
  const [incSaving, setIncSaving] = useState(false)
  const [tab, setTab] = useState<'incidents' | 'escalation'>('incidents')
  const [policies, setPolicies] = useState<EscalationPolicy[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(false)

  useEffect(() => {
    if (tab === 'escalation' && policies.length === 0 && !policiesLoading) {
      setPoliciesLoading(true)
      apiFetch('/api/escalation-policies').then(r => r.json()).then(data => {
        setPolicies(Array.isArray(data) ? data : [])
      }).catch(() => {}).finally(() => setPoliciesLoading(false))
    }
  }, [tab, policies.length, policiesLoading])

  useEffect(() => {
    apiFetch('/api/incidents')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setIncidents(items.map((inc: Record<string, unknown>, i: number) => {
          const rcaReport = inc.rca_report as Record<string, unknown> | null
          return {
            id: String(inc.incident_id ?? inc.id ?? `INC-${i + 1}`),
            title: String(inc.title ?? inc.incident_title ?? inc.name ?? ''),
            asset: String(inc.asset_name ?? inc.asset ?? inc.sf_table_name ?? ''),
            severity: (['critical','high','medium','low'] as const).includes(inc.severity as 'critical') ? (inc.severity as Incident['severity']) : 'medium',
            status: (['open','investigating','resolved'] as const).includes(inc.status as 'open') ? (inc.status as Incident['status']) : 'open',
            createdAt: String(inc.created_at ?? inc.createdAt ?? ''),
            resolvedAt: inc.resolved_at ? String(inc.resolved_at) : null,
            description: String(inc.description ?? rcaReport?.description ?? inc.message ?? ''),
            owner: String(inc.owner ?? inc.assigned_to ?? ''),
            ttrMinutes: inc.ttr_minutes != null ? Number(inc.ttr_minutes) : null,
            alertId: inc.alert_id ? String(inc.alert_id) : null,
          }
        }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function createIncident() {
    if (!incForm.title) return
    setIncSaving(true)
    try {
      const res = await apiFetch('/api/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: incForm.title,
          severity: incForm.severity,
          asset: incForm.asset,
          description: incForm.description,
          status: 'open',
        }),
      })
      if (!res.ok) throw new Error(`Failed to create incident: ${res.status}`)
      const listRes = await apiFetch('/api/incidents')
      if (!listRes.ok) throw new Error('Failed to reload incidents')
      const data2: Record<string, unknown>[] = await listRes.json()
      const items = Array.isArray(data2) ? data2 : []
      setIncidents(items.map((inc: Record<string, unknown>, i: number) => {
        const rcaReport = inc.rca_report as Record<string, unknown> | null
        return {
          id: String(inc.incident_id ?? inc.id ?? `INC-${i + 1}`),
          title: String(inc.title ?? inc.incident_title ?? inc.name ?? ''),
          asset: String(inc.asset_name ?? inc.asset ?? inc.sf_table_name ?? ''),
          severity: (['critical','high','medium','low'] as const).includes(inc.severity as 'critical') ? (inc.severity as Incident['severity']) : 'medium',
          status: (['open','investigating','resolved'] as const).includes(inc.status as 'open') ? (inc.status as Incident['status']) : 'open',
          createdAt: String(inc.created_at ?? inc.createdAt ?? ''),
          resolvedAt: inc.resolved_at ? String(inc.resolved_at) : null,
          description: String(inc.description ?? rcaReport?.description ?? inc.message ?? ''),
          owner: String(inc.owner ?? inc.assigned_to ?? ''),
          ttrMinutes: inc.ttr_minutes != null ? Number(inc.ttr_minutes) : null,
          alertId: inc.alert_id ? String(inc.alert_id) : null,
        }
      }))
      setShowCreate(false)
      setIncForm({ title: '', severity: 'medium', asset: '', description: '' })
    } catch (err) {
      console.error(err)
    } finally {
      setIncSaving(false)
    }
  }

  async function updateIncidentStatus(id: string, action: 'investigate' | 'resolve') {
    try {
      await apiFetch('/api/incidents', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      setIncidents(prev => prev.map(inc => {
        if (inc.id !== id) return inc
        const status = action === 'investigate' ? 'investigating' : 'resolved'
        return { ...inc, status: status as Incident['status'] }
      }))
      setPopup(prev => {
        if (!prev || prev.id !== id) return prev
        const status = action === 'investigate' ? 'investigating' : 'resolved'
        return { ...prev, status: status as Incident['status'] }
      })
    } catch (err) { console.error(err) }
  }

  const openCount          = incidents.filter(i => i.status === 'open').length
  const investigatingCount = incidents.filter(i => i.status === 'investigating').length
  const resolvedCount      = incidents.filter(i => i.status === 'resolved').length
  const avgTTR = (() => {
    const r = incidents.filter(i => i.ttrMinutes != null)
    return r.length ? Math.round(r.reduce((s, i) => s + (i.ttrMinutes ?? 0), 0) / r.length) : null
  })()

  const filtered = incidents.filter(i => filter === 'all' || i.status === filter)

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Incidents</span>
        {openCount > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{openCount} open</span>}
        {investigatingCount > 0 && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{investigatingCount} investigating</span>}
        {resolvedCount > 0 && <span style={{ background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{resolvedCount} resolved</span>}
        {avgTTR != null && <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>avg {avgTTR}m TTR</span>}
        <button onClick={() => setShowCreate(true)} style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Report</button>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        {([['incidents', `Incidents (${incidents.length})`], ['escalation', 'Escalation Policies']] as [string, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t as typeof tab)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--foreground)' : 'var(--surface-muted)',
            color: tab === t ? 'var(--background)' : 'var(--text-secondary)',
            fontWeight: tab === t ? 600 : 400, fontSize: '11px',
          }}>{label}</button>
        ))}
      </div>

      {/* filter pills (only for incidents tab) */}
      {tab === 'incidents' && <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        {(['all','open','investigating','resolved'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: filter === f ? 'var(--foreground)' : 'var(--surface-muted)',
            color: filter === f ? 'var(--background)' : 'var(--text-secondary)',
            fontWeight: filter === f ? 600 : 400, fontSize: '11px',
          }}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
      </div>}

      {/* column header — incidents only */}
      {tab === 'incidents' && !loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '4px 64px 1fr 90px auto', gap: '0 8px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['', 'Severity', 'Title', 'Status', 'Time'].map((h, i) => <span key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
        </div>
      )}

      {/* escalation policies tab */}
      {tab === 'escalation' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {policiesLoading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>}
          {!policiesLoading && policies.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No escalation policies configured yet.
              <br /><span style={{ fontSize: 11 }}>Use the API to create policies: <code>POST /escalation-policies</code></span>
            </div>
          )}
          {!policiesLoading && policies.map(p => {
            const sevColor: Record<string, string> = { critical: '#dc2626', high: '#f97316', medium: '#eab308', low: '#22c55e', all: '#6366f1' }
            const color = sevColor[p.severity] ?? '#6b7280'
            return (
              <div key={p.policy_id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--surface-muted)', borderLeft: `2px solid ${p.is_active ? color : 'var(--border)'}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)' }}>{p.name}</span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${color}18`, color, fontWeight: 600 }}>{p.severity}</span>
                    {!p.is_active && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>inactive</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                    {p.steps?.length ?? 0} escalation step{(p.steps?.length ?? 0) !== 1 ? 's' : ''} · repeats every {p.repeat_interval_minutes}m · max {p.max_escalations} escalations
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* scrollable list — incidents only */}
      {tab === 'incidents' && <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{incidents.length === 0 ? 'No incidents yet' : 'No incidents match filters'}</div>
        )}
        {!loading && filtered.map(inc => {
          const sev = SEV[inc.severity] ?? SEV.medium
          const st  = ST[inc.status]  ?? ST.open
          return (
            <div key={inc.id} onClick={() => setPopup(inc)}
              style={{ display: 'grid', gridTemplateColumns: '4px 64px 1fr 90px auto', gap: '0 8px', alignItems: 'center', padding: '5px 6px', borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <div style={{ width: '4px', alignSelf: 'stretch', background: sev.color, borderRadius: '2px' }} />
              <span style={{ background: sev.bg, color: sev.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{inc.severity}</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title}</span>
              <span style={{ background: st.bg, color: st.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{inc.status}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{inc.createdAt ? new Date(inc.createdAt).toLocaleString() : '—'}</span>
            </div>
          )
        })}
      </div>}

      {/* create incident modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--foreground)' }}>Report Incident</div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Title *</label>
              <input value={incForm.title} onChange={e => setIncForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Brief description of the incident"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Severity</label>
              <select value={incForm.severity} onChange={e => setIncForm(p => ({ ...p, severity: e.target.value }))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }}>
                {['critical','high','medium','low'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Affected Asset</label>
              <input value={incForm.asset} onChange={e => setIncForm(p => ({ ...p, asset: e.target.value }))}
                placeholder="e.g. ORDERS table or pipeline name"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Description</label>
              <textarea value={incForm.description} onChange={e => setIncForm(p => ({ ...p, description: e.target.value }))} rows={3}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: 'var(--text-xs)', outline: 'none', resize: 'vertical' as const, boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowCreate(false); setIncForm({ title: '', severity: 'medium', asset: '', description: '' }) }}
                style={{ padding: '7px 16px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={createIncident} disabled={incSaving || !incForm.title}
                style={{ padding: '7px 16px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: (incSaving || !incForm.title) ? 'not-allowed' : 'pointer', opacity: (incSaving || !incForm.title) ? 0.6 : 1 }}>
                {incSaving ? 'Reporting…' : 'Report Incident'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* popup */}
      {popup && (
        <>
          <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ background: SEV[popup.severity]?.bg ?? 'var(--surface-muted)', color: SEV[popup.severity]?.color ?? 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{popup.severity}</span>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{popup.title}</span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
              {([['ID', popup.id], ['Asset', popup.asset || '—'], ['Owner', popup.owner || '—']] as [string, string][]).map(([l, v], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
              {([['Status', popup.status], ['TTR', popup.ttrMinutes != null ? `${popup.ttrMinutes} min` : '—']] as [string, string][]).map(([l, v], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v}</div>
                </div>
              ))}
            </div>
            {popup.description && (
              <div style={{ margin: '12px 14px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', padding: '7px 12px' }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>📋 DESCRIPTION</span>
                </div>
                <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{popup.description}</div>
              </div>
            )}
            {popup.ttrMinutes != null && (
              <div style={{ margin: '8px 14px', padding: '8px 12px', background: 'var(--status-ok-bg)', borderRadius: '6px', fontSize: '12px', color: 'var(--status-ok-text)', fontWeight: 500 }}>
                ✅ Resolved in {popup.ttrMinutes} minutes
              </div>
            )}
            <div style={{ margin: '12px 14px 14px', display: 'flex', gap: '6px' }}>
              {popup.status === 'open' && (
                <button onClick={() => updateIncidentStatus(popup.id, 'investigate')}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  🔍 Investigate
                </button>
              )}
              {popup.status !== 'resolved' && (
                <button onClick={() => updateIncidentStatus(popup.id, 'resolve')}
                  style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--status-ok-bg)', color: 'var(--status-ok-text)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  ✅ Resolve
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
