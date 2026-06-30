'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import CreateIssueModal from '@/components/issues/CreateIssueModal'
import { apiFetch } from '@/lib/apiFetch'

type Severity = 'critical' | 'high' | 'medium' | 'info'
type AlertFilter = 'all' | 'unacked' | 'critical' | 'high'
type RuleFilter = 'all' | 'active' | 'critical' | 'triggered'
type TriggerType = 'rule_failure' | 'score_drop' | 'freshness_breach' | 'anomaly'

interface RecentAlert {
  id: string; rule: string; dataset: string; severity: Severity
  message: string; channel: string; ts: string; ack: boolean
  rootCause: string; impact: string; recommendation: string
  affectedRecords: number; pipeline: string; alertType: string
  runId: string | null; assetId: string | null; ruleId: string | null
}

interface AlertDefinition {
  definition_id: string; name: string; description: string
  trigger_type: TriggerType; threshold_value: number | null
  asset_id: string | null; asset_name: string
  domain_id: string | null; domain_name: string
  severity_override: Severity | null; cooldown_minutes: number
  notification_channels: { channel: string; address: string; label?: string }[]
  is_active: boolean; triggered_count: number; last_fired_at: string | null
  created_by: string | null; created_at: string
}

const SEV: Record<Severity, { bg: string; color: string; border: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   border: '#fca5a5' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    border: '#fdba74' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    border: '#fde68a' },
  info:     { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', border: '#bae6fd' },
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  rule_failure:     'Rule Failure',
  score_drop:       'Score Drop',
  freshness_breach: 'Freshness',
  anomaly:          'Anomaly',
}

const TRIGGER_COLORS: Record<TriggerType, string> = {
  rule_failure:     '#7c3aed',
  score_drop:       '#dc2626',
  freshness_breach: '#0ea5e9',
  anomaly:          '#f59e0b',
}

const CHANNEL_ICONS: Record<string, string> = {
  slack: '💬', email: '✉️', teams: '🔵', pagerduty: '🔔', webhook: '🔗',
}

function Section({ title, gradient, border, body }: { title: string; gradient: string; border: string; body: string }) {
  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid ${border}` }}>
      <div style={{ background: gradient, padding: '7px 12px' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>{title}</span>
      </div>
      <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{body || '—'}</div>
    </div>
  )
}

/* ─── Create Alert Definition Modal ─── */
interface CreateModalProps {
  onClose: () => void
  onCreated: (def: AlertDefinition) => void
}

function CreateAlertDefinitionModal({ onClose, onCreated }: CreateModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<TriggerType>('rule_failure')
  const [threshold, setThreshold] = useState('')
  const [severityOverride, setSeverityOverride] = useState<string>('')
  const [cooldown, setCooldown] = useState('240')
  const [channelType, setChannelType] = useState('slack')
  const [channelAddress, setChannelAddress] = useState('')
  const [channels, setChannels] = useState<{ channel: string; address: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addChannel() {
    if (!channelAddress.trim()) return
    setChannels(prev => [...prev, { channel: channelType, address: channelAddress.trim() }])
    setChannelAddress('')
  }

  function removeChannel(i: number) {
    setChannels(prev => prev.filter((_, idx) => idx !== i))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: triggerType,
        threshold_value: threshold ? parseFloat(threshold) : null,
        severity_override: severityOverride || null,
        cooldown_minutes: parseInt(cooldown) || 240,
        notification_channels: channels.length ? channels : null,
      }
      const res = await apiFetch('/api/alert-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) { setError('Failed to create alert definition'); setSaving(false); return }
      const created = await res.json()
      onCreated(created)
      onClose()
    } catch { setError('Network error'); setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: '6px',
    border: '1px solid var(--border)', background: 'var(--background)',
    color: 'var(--foreground)', fontSize: '12px', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', display: 'block',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 299 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)', zIndex: 300, width: 'min(500px,92vw)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)' }}>New Alert Definition</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>
        <form onSubmit={submit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Orders table quality drop" />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '56px' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this alert watch for?" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Trigger Type</label>
              <select style={inputStyle} value={triggerType} onChange={e => setTriggerType(e.target.value as TriggerType)}>
                <option value="rule_failure">Rule Failure</option>
                <option value="score_drop">Score Drop</option>
                <option value="freshness_breach">Freshness Breach</option>
                <option value="anomaly">Anomaly</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                {triggerType === 'score_drop' ? 'Min Score (0–100)' : triggerType === 'freshness_breach' ? 'Max Age (hours)' : 'Threshold (optional)'}
              </label>
              <input style={inputStyle} type="number" value={threshold} onChange={e => setThreshold(e.target.value)}
                placeholder={triggerType === 'score_drop' ? 'e.g. 80' : triggerType === 'freshness_breach' ? 'e.g. 24' : '—'}
                disabled={triggerType === 'rule_failure' || triggerType === 'anomaly'} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Severity Override</label>
              <select style={inputStyle} value={severityOverride} onChange={e => setSeverityOverride(e.target.value)}>
                <option value="">— inherit —</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Cooldown (minutes)</label>
              <input style={inputStyle} type="number" value={cooldown} onChange={e => setCooldown(e.target.value)} placeholder="240" />
            </div>
          </div>

          {/* Notification channels */}
          <div>
            <label style={labelStyle}>Notification Channels</label>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
              <select style={{ ...inputStyle, width: '110px', flexShrink: 0 }} value={channelType} onChange={e => setChannelType(e.target.value)}>
                <option value="slack">Slack</option>
                <option value="email">Email</option>
                <option value="teams">Teams</option>
                <option value="pagerduty">PagerDuty</option>
                <option value="webhook">Webhook</option>
              </select>
              <input style={{ ...inputStyle, flex: 1 }} value={channelAddress} onChange={e => setChannelAddress(e.target.value)}
                placeholder={channelType === 'email' ? 'user@example.com' : channelType === 'slack' ? 'https://hooks.slack.com/...' : 'URL or key'} />
              <button type="button" onClick={addChannel} style={{ padding: '6px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>+ Add</button>
            </div>
            {channels.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {channels.map((ch, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-muted)', borderRadius: '6px', padding: '4px 8px' }}>
                    <span style={{ fontSize: '12px' }}>{CHANNEL_ICONS[ch.channel] || '📡'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.channel}: {ch.address}</span>
                    <button type="button" onClick={() => removeChannel(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', padding: '0 2px' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '6px 10px', borderRadius: '6px', fontSize: '11px' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button type="button" onClick={onClose} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

/* ─── Main Page ─── */
function AlertsPageInner() {
  const searchParams = useSearchParams()
  const initialFilter = searchParams.get('severity')
  const [activeConnectionId, setActiveConnectionId] = useState<string>(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('qualix-active-conn') : null
      return (v && v !== '__all__') ? v : ''
    } catch { return '' }
  })
  const [alerts, setAlerts] = useState<RecentAlert[]>([])
  const [rules, setRules] = useState<AlertDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [rulesLoading, setRulesLoading] = useState(true)
  const [tab, setTab] = useState<'recent' | 'rules' | 'routing' | 'maintenance' | 'flap'>('recent')
  const [routingRules, setRoutingRules] = useState<Record<string, unknown>[]>([])
  const [maintenanceWindows, setMaintenanceWindows] = useState<Record<string, unknown>[]>([])
  const [flapConfig, setFlapConfig] = useState<Record<string, unknown> | null>(null)
  const [alertFilter, setAlertFilter] = useState<AlertFilter>(
    initialFilter === 'critical' || initialFilter === 'high' || initialFilter === 'unacked' ? initialFilter : 'all'
  )
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all')
  const [search, setSearch] = useState('')
  const [popupAlert, setPopupAlert] = useState<RecentAlert | null>(null)
  const [popupRule, setPopupRule] = useState<AlertDefinition | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateIssue, setShowCreateIssue] = useState(false)
  const [issueCreatedMsg, setIssueCreatedMsg] = useState<string | null>(null)
  const [incidentCreatedMsg, setIncidentCreatedMsg] = useState<string | null>(null)

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
    apiFetch(`/api/alerts${activeConnectionId ? `?${params}` : ''}`)
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setAlerts(items.map((a: Record<string, unknown>, i: number) => {
          const db = a.sf_database_name ? String(a.sf_database_name) : ''
          const schema = a.sf_schema_name ? String(a.sf_schema_name) : ''
          const table = a.sf_table_name ? String(a.sf_table_name) : ''
          const dataPath = [db, schema, table].filter(Boolean).join('.') || String(a.asset_name ?? a.dataset ?? '')
          return {
            id: String(a.alert_id ?? a.id ?? i),
            rule: String(a.rule_name ?? a.rule ?? 'Alert'),
            dataset: dataPath,
            severity: (['critical','high','medium','info'] as const).includes(a.severity as Severity) ? (a.severity as Severity) : 'info',
            message: String(a.alert_message ?? a.message ?? ''),
            channel: String(a.notification_channel ?? a.channel ?? 'System'),
            ts: String(a.created_at ?? a.ts ?? ''),
            ack: a.alert_status === 'acknowledged' || a.alert_status === 'closed' || Boolean(a.ack),
            rootCause: String(a.root_cause ?? ''),
            impact: String(a.impact ?? ''),
            recommendation: String(a.recommendation ?? ''),
            affectedRecords: Number(a.affected_records ?? 0),
            pipeline: String(a.pipeline ?? ''),
            alertType: String(a.alert_type ?? 'rule_failure'),
            runId: a.run_id ? String(a.run_id) : null,
            assetId: a.asset_id ? String(a.asset_id) : null,
            ruleId: a.rule_id ? String(a.rule_id) : null,
          }
        }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeConnectionId])

  useEffect(() => {
    const params = new URLSearchParams()
    if (activeConnectionId) params.set('connection_id', activeConnectionId)
    apiFetch(`/api/alert-definitions${activeConnectionId ? `?${params}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setRules(Array.isArray(data) ? data : [])
        setRulesLoading(false)
      })
      .catch(() => setRulesLoading(false))
  }, [activeConnectionId])

  useEffect(() => {
    Promise.allSettled([
      apiFetch('/api/alert-routing/rules').then(r => r.json()),
      apiFetch('/api/alert-routing/maintenance-windows').then(r => r.json()),
      apiFetch('/api/alert-routing/flap-detection').then(r => r.json()),
    ]).then(([rules, windows, flap]) => {
      if (rules.status === 'fulfilled') setRoutingRules(Array.isArray(rules.value) ? rules.value : [])
      if (windows.status === 'fulfilled') setMaintenanceWindows(Array.isArray(windows.value) ? windows.value : [])
      if (flap.status === 'fulfilled' && flap.value) setFlapConfig(flap.value)
    }).catch(() => {})
  }, [])

  const unacked = alerts.filter(a => !a.ack).length
  const critical = alerts.filter(a => a.severity === 'critical').length

  function ack(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, ack: true } : a))
    apiFetch('/api/alerts', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'acknowledge' }),
    }).catch(() => {})
  }

  function ackAll() {
    setAlerts(prev => prev.map(a => ({ ...a, ack: true })))
    alerts.filter(a => !a.ack).forEach(a => {
      apiFetch('/api/alerts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, action: 'acknowledge' }),
      }).catch(() => {})
    })
  }

  function toggleRule(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    const current = rules.find(r => r.definition_id === id)
    if (!current) return
    const next = !current.is_active
    setRules(prev => prev.map(r => r.definition_id === id ? { ...r, is_active: next } : r))
    setPopupRule(prev => prev?.definition_id === id ? { ...prev, is_active: next } : prev)
    apiFetch('/api/alert-definitions', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definition_id: id, is_active: next }),
    }).catch(() => {})
  }

  function deleteRule(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this alert definition?')) return
    setRules(prev => prev.filter(r => r.definition_id !== id))
    setPopupRule(null)
    apiFetch(`/api/alert-definitions?id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  const lowerSearch = search.toLowerCase()
  const filteredAlerts = alerts.filter(a => {
    if (alertFilter === 'unacked') return !a.ack
    if (alertFilter === 'critical') return a.severity === 'critical'
    if (alertFilter === 'high') return a.severity === 'high'
    return true
  }).filter(a => !search || a.rule.toLowerCase().includes(lowerSearch) || a.dataset.toLowerCase().includes(lowerSearch) || a.message.toLowerCase().includes(lowerSearch))

  const filteredRules = rules.filter(r => {
    if (ruleFilter === 'active') return r.is_active
    if (ruleFilter === 'critical') return r.severity_override === 'critical'
    if (ruleFilter === 'triggered') return r.triggered_count > 0
    return true
  }).filter(r => !search || r.name.toLowerCase().includes(lowerSearch) || r.trigger_type.includes(lowerSearch))

  const closePopup = () => { setPopupAlert(null); setPopupRule(null); setShowCreateIssue(false); setIssueCreatedMsg(null); setIncidentCreatedMsg(null) }

  async function createIncidentFromAlert(alert: RecentAlert) {
    try {
      const res = await apiFetch('/api/incidents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Alert: ${alert.rule}`,
          severity: alert.severity === 'info' ? 'low' : alert.severity,
          asset_id: alert.assetId,
          asset: alert.dataset,
          description: alert.message,
          alert_id: alert.id,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const inc = await res.json()
      setIncidentCreatedMsg(`Incident ${String(inc.incident_id ?? '').slice(0, 8)} created`)
    } catch { setIncidentCreatedMsg('Failed to create incident') }
  }

  function fmtTs(ts: string | null) {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) }
    catch { return ts }
  }

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Alerts</span>
        {unacked > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{unacked} unacked</span>}
        {critical > 0 && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{critical} critical</span>}
        {rules.length > 0 && <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{rules.length} definitions</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {unacked > 0 && <button onClick={ackAll} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✓ Ack All</button>}
          <button onClick={() => setShowCreate(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Rule</button>
        </div>
      </div>

      {/* tabs + filter pills + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        {([
          ['recent', `Recent (${filteredAlerts.length})`],
          ['rules', `Definitions (${filteredRules.length})`],
          ['routing', `Routing (${routingRules.length})`],
          ['maintenance', `Maintenance (${maintenanceWindows.length})`],
          ['flap', 'Flap Detection'],
        ] as [string, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t as typeof tab)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--foreground)' : 'var(--surface-muted)',
            color: tab === t ? 'var(--background)' : 'var(--text-secondary)',
            fontWeight: tab === t ? 600 : 400, fontSize: '11px',
          }}>
            {label}
          </button>
        ))}
        <div style={{ width: '1px', height: '14px', background: 'var(--border)', margin: '0 4px' }} />
        {tab === 'recent' && ([['all','All'],['unacked','Unacked'],['critical','Critical'],['high','High']] as [AlertFilter,string][]).map(([f,l]) => (
          <button key={f} onClick={() => setAlertFilter(f)} style={{
            padding: '3px 8px', borderRadius: '5px', border: `1px solid ${alertFilter === f ? 'var(--accent)' : 'var(--border)'}`,
            background: alertFilter === f ? 'var(--accent-bg)' : 'transparent',
            color: alertFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer',
          }}>{l}</button>
        ))}
        {tab === 'rules' && ([['all','All'],['active','Active'],['critical','Critical'],['triggered','Triggered']] as [RuleFilter,string][]).map(([f,l]) => (
          <button key={f} onClick={() => setRuleFilter(f)} style={{
            padding: '3px 8px', borderRadius: '5px', border: `1px solid ${ruleFilter === f ? 'var(--accent)' : 'var(--border)'}`,
            background: ruleFilter === f ? 'var(--accent-bg)' : 'transparent',
            color: ruleFilter === f ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer',
          }}>{l}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--foreground)', fontSize: '11px', width: '140px' }}
        />
      </div>

      {/* column headers */}
      {tab === 'recent' && !loading && filteredAlerts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 1fr 112px 40px', gap: '0 8px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Sev','Rule','Asset','Time',''].map((h, i) => <span key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
        </div>
      )}
      {tab === 'rules' && !rulesLoading && filteredRules.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto auto auto', gap: '0 8px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Trigger','Name','Fired','Last Fired',''].map((h, i) => <span key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {(tab === 'recent' ? loading : rulesLoading) && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>
        )}

        {tab === 'recent' && !loading && filteredAlerts.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            {alerts.length === 0 ? 'No alerts yet' : 'No alerts match filters'}
          </div>
        )}
        {tab === 'recent' && !loading && filteredAlerts.map(a => {
          const ss = SEV[a.severity]
          return (
            <div key={a.id} onClick={() => setPopupAlert(a)}
              style={{ display: 'grid', gridTemplateColumns: '58px 1fr 1fr 112px 40px', gap: '0 8px', alignItems: 'center', padding: '3px 6px', borderLeft: `2px solid ${!a.ack ? ss.color : 'var(--border)'}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', opacity: a.ack ? 0.6 : 1 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span style={{ background: ss.bg, color: ss.color, padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, textAlign: 'center', letterSpacing: '0.02em' }}>{a.severity}</span>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.rule}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.dataset || '—'}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTs(a.ts)}</span>
              {!a.ack
                ? <button onClick={e => ack(a.id, e)} style={{ fontSize: '9px', border: '1px solid var(--border)', background: 'var(--surface)', padding: '1px 5px', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Ack</button>
                : <span style={{ fontSize: '10px', color: 'var(--status-ok-text)', textAlign: 'center' }}>✓</span>
              }
            </div>
          )
        })}

        {tab === 'rules' && !rulesLoading && filteredRules.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            No alert definitions yet — click <strong>+ Rule</strong> to create one
          </div>
        )}
        {tab === 'rules' && !rulesLoading && filteredRules.map(r => {
          const trigColor = TRIGGER_COLORS[r.trigger_type] || '#7c3aed'
          return (
            <div key={r.definition_id} onClick={() => setPopupRule(r)}
              style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto auto auto', gap: '0 8px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${r.is_active ? trigColor : 'var(--border)'}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', opacity: !r.is_active ? 0.65 : 1 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span style={{ background: trigColor + '1a', color: trigColor, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center', border: `1px solid ${trigColor}33` }}>
                {TRIGGER_LABELS[r.trigger_type]}
              </span>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                {(r.asset_name || r.domain_name) && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.asset_name || r.domain_name}</div>}
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: r.triggered_count > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)' }}>{r.triggered_count}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTs(r.last_fired_at)}</span>
              <button onClick={e => toggleRule(r.definition_id, e)} style={{ width: '32px', height: '18px', borderRadius: '9px', border: 'none', background: r.is_active ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: '2px', left: r.is_active ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block' }} />
              </button>
            </div>
          )
        })}

        {/* ── Routing Rules ── */}
        {tab === 'routing' && (
          routingRules.length === 0
            ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No routing rules configured. Use the API to create routing rules.</div>
            : routingRules.map((r, i) => (
              <div key={String(r.rule_id ?? i)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--surface-muted)', borderLeft: `2px solid ${r.is_active ? '#6366f1' : 'var(--border)'}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', width: 24, textAlign: 'right', flexShrink: 0 }}>#{String(r.priority ?? i + 1)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r.name ?? 'Rule')}</div>
                  {!!r.description && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{String(r.description)}</div>}
                </div>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: r.is_active ? '#dcfce7' : 'var(--surface-muted)', color: r.is_active ? '#16a34a' : 'var(--text-muted)', fontWeight: 600 }}>
                  {r.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))
        )}

        {/* ── Maintenance Windows ── */}
        {tab === 'maintenance' && (
          maintenanceWindows.length === 0
            ? <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No maintenance windows configured.</div>
            : maintenanceWindows.map((w, i) => {
              const start = w.start_at ? new Date(String(w.start_at)) : null
              const end = w.end_at ? new Date(String(w.end_at)) : null
              const now = new Date()
              const isActive = start && end && now >= start && now <= end
              return (
                <div key={String(w.window_id ?? i)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--surface-muted)', borderLeft: `2px solid ${isActive ? '#f97316' : 'var(--border)'}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>{String(w.name ?? 'Window')}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {start?.toLocaleString()} → {end?.toLocaleString()} · {String(w.recurrence ?? 'none')}
                    </div>
                  </div>
                  {isActive && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fff7ed', color: '#f97316', fontWeight: 600 }}>Active Now</span>}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {w.suppress_alerts ? '🔕 Alerts suppressed' : ''}
                    {w.suppress_scans ? ' · 🚫 Scans suppressed' : ''}
                  </div>
                </div>
              )
            })
        )}

        {/* ── Flap Detection ── */}
        {tab === 'flap' && (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)' }}>Flap Detection</div>
                <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, background: flapConfig?.is_enabled ? '#dcfce7' : 'var(--surface-muted)', color: flapConfig?.is_enabled ? '#16a34a' : 'var(--text-muted)', fontWeight: 600 }}>
                  {flapConfig?.is_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { label: 'Flap Threshold', value: String(flapConfig?.flap_threshold ?? 3), sub: 'fire/recover cycles' },
                  { label: 'Detection Window', value: `${flapConfig?.window_minutes ?? 30}m`, sub: 'time window' },
                  { label: 'Suppress Duration', value: `${flapConfig?.suppress_duration_minutes ?? 60}m`, sub: 'suppression period' },
                ].map(k => (
                  <div key={k.label} style={{ background: 'var(--surface-muted)', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--foreground)' }}>{k.value}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginTop: 2 }}>{k.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{k.sub}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16, marginBottom: 0, lineHeight: '1.6' }}>
                When an alert fires and recovers {String(flapConfig?.flap_threshold ?? 3)} or more times within {String(flapConfig?.window_minutes ?? 30)} minutes,
                it is classified as flapping and suppressed for {String(flapConfig?.suppress_duration_minutes ?? 60)} minutes to reduce noise.
                Update via the API: <code style={{ background: 'var(--surface-muted)', padding: '1px 4px', borderRadius: 3 }}>PUT /alert-routing/flap-detection</code>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* detail popup */}
      {(popupAlert ?? popupRule) && (
        <>
          <div onClick={closePopup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            {popupAlert && (() => {
              const ss = SEV[popupAlert.severity]
              return (
                <>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ background: ss.bg, color: ss.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{popupAlert.severity}</span>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{popupAlert.rule}</span>
                    <button onClick={closePopup} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
                    {[['Table', popupAlert.dataset], ['Type', popupAlert.alertType.replace('_',' ')], ['Channel', popupAlert.channel]].map(([l, v], i) => (
                      <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
                    {[['Affected Records', popupAlert.affectedRecords.toLocaleString()], ['Fired At', fmtTs(popupAlert.ts)]].map(([l, v], i) => (
                      <div key={i} style={{ padding: '6px 8px', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Section title="📋 MESSAGE" gradient="linear-gradient(135deg,var(--text-secondary),var(--text-secondary))" border="var(--border)" body={popupAlert.message} />
                    {popupAlert.rootCause && <Section title="🔍 ROOT CAUSE" gradient="linear-gradient(135deg,#7c3aed,#6d28d9)" border="#e9d5ff" body={popupAlert.rootCause} />}
                    {(popupAlert.impact || popupAlert.recommendation) && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {popupAlert.impact && <Section title="⚠️ IMPACT" gradient={popupAlert.severity === 'critical' ? 'linear-gradient(135deg,var(--status-error-text),var(--status-error-text))' : 'linear-gradient(135deg,var(--status-warn-text),var(--status-warn-text))'} border={ss.border} body={popupAlert.impact} />}
                        {popupAlert.recommendation && <Section title="✅ FIX" gradient="linear-gradient(135deg,var(--status-ok-text),var(--status-ok-text))" border="var(--status-ok-bg)" body={popupAlert.recommendation} />}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '0 14px 14px', display: 'flex', gap: '6px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!popupAlert.ack && (
                        <button onClick={e => { ack(popupAlert.id, e); closePopup() }} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>✓ Acknowledge</button>
                      )}
                      {popupAlert.runId && (
                        <Link href={`/rule-runs/${popupAlert.runId}`} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--accent-bg)', background: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '11px', textDecoration: 'none', fontWeight: 600 }}>
                          🔍 View Evidence
                        </Link>
                      )}
                      <button onClick={() => setShowCreateIssue(true)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                        🐞 Create Issue
                      </button>
                      {!incidentCreatedMsg && (
                        <button onClick={() => createIncidentFromAlert(popupAlert)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--status-error-text)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
                          🚨 Create Incident
                        </button>
                      )}
                    </div>
                    {issueCreatedMsg && (
                      <div style={{ fontSize: '11px', color: 'var(--status-ok-text)' }}>{issueCreatedMsg}</div>
                    )}
                    {incidentCreatedMsg && (
                      <div style={{ fontSize: '11px', color: incidentCreatedMsg.startsWith('Failed') ? 'var(--status-error-text)' : 'var(--status-ok-text)' }}>{incidentCreatedMsg}</div>
                    )}
                  </div>
                </>
              )
            })()}
            {popupRule && (() => {
              const trigColor = TRIGGER_COLORS[popupRule.trigger_type] || '#7c3aed'
              return (
                <>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ background: trigColor + '1a', color: trigColor, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, border: `1px solid ${trigColor}33` }}>
                      {TRIGGER_LABELS[popupRule.trigger_type]}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{popupRule.name}</span>
                    <button onClick={closePopup} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
                    {[
                      ['Scope', popupRule.asset_name || popupRule.domain_name || 'Global'],
                      ['Cooldown', `${popupRule.cooldown_minutes}m`],
                      ['Status', popupRule.is_active ? '✅ Active' : '⏸ Paused'],
                    ].map(([l, v], i) => (
                      <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
                    {[['Times Fired', String(popupRule.triggered_count)], ['Last Fired', fmtTs(popupRule.last_fired_at)]].map(([l, v], i) => (
                      <div key={i} style={{ padding: '6px 8px', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {popupRule.description && <Section title="📋 DESCRIPTION" gradient="linear-gradient(135deg,var(--text-secondary),var(--text-secondary))" border="var(--border)" body={popupRule.description} />}
                    {popupRule.threshold_value !== null && (
                      <Section title="⚙️ CONDITION"
                        gradient="linear-gradient(135deg,#7c3aed,#6d28d9)" border="#e9d5ff"
                        body={
                          popupRule.trigger_type === 'score_drop'
                            ? `Fire when quality score drops below ${popupRule.threshold_value}%`
                            : popupRule.trigger_type === 'freshness_breach'
                            ? `Fire when asset not refreshed for more than ${popupRule.threshold_value} hours`
                            : `Threshold: ${popupRule.threshold_value}`
                        }
                      />
                    )}
                    {popupRule.notification_channels.length > 0 && (
                      <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <div style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', padding: '7px 12px' }}>
                          <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>📡 NOTIFICATION CHANNELS</span>
                        </div>
                        <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {popupRule.notification_channels.map((ch, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <span>{CHANNEL_ICONS[ch.channel] || '📡'}</span>
                              <span style={{ fontWeight: 600 }}>{ch.channel}:</span>
                              <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.address}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '0 14px 14px', display: 'flex', gap: '6px' }}>
                    <button onClick={e => toggleRule(popupRule.definition_id, e)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>
                      {popupRule.is_active ? '⏸ Pause' : '▶ Activate'}
                    </button>
                    <button onClick={e => deleteRule(popupRule.definition_id, e)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--status-error-text)', background: 'var(--status-error-bg)', color: 'var(--status-error-text)', fontSize: '11px', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </>
      )}

      {showCreateIssue && popupAlert && (
        <CreateIssueModal
          prefill={{
            issueType: 'alert',
            alertId: popupAlert.id,
            assetId: popupAlert.assetId,
            ruleId: popupAlert.ruleId,
            runId: popupAlert.runId,
            severity: popupAlert.severity === 'info' ? 'low' : popupAlert.severity,
            title: popupAlert.rule,
          }}
          onClose={() => setShowCreateIssue(false)}
          onCreated={issue => {
            setShowCreateIssue(false)
            setIssueCreatedMsg(`Issue ${issue.issue_id.slice(0, 8)} created`)
          }}
        />
      )}

      {showCreate && (
        <CreateAlertDefinitionModal
          onClose={() => setShowCreate(false)}
          onCreated={def => setRules(prev => [def, ...prev])}
        />
      )}
    </div>
  )
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}>
      <AlertsPageInner />
    </Suspense>
  )
}
