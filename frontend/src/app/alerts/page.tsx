'use client'
import { useState, useEffect } from 'react'

type Severity = 'critical' | 'high' | 'medium' | 'info'
type AlertFilter = 'all' | 'unacked' | 'critical' | 'high'
type RuleFilter = 'all' | 'active' | 'critical' | 'triggered'

interface RecentAlert {
  id: string; rule: string; dataset: string; severity: Severity
  message: string; channel: string; ts: string; ack: boolean
  rootCause: string; impact: string; recommendation: string
  affectedRecords: number; pipeline: string
}

interface AlertRule {
  id: string; name: string; condition: string; datasets: string
  channel: string; severity: Severity; enabled: boolean
  triggered: number; lastFired: string; description: string
  whenItFires: string; businessContext: string; remediation: string
  cooldown: string; owner: string
}

const SEV: Record<Severity, { bg: string; color: string; border: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',   border: '#fca5a5' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    border: '#fdba74' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',    border: '#fde68a' },
  info:     { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', border: '#bae6fd' },
}

function Section({ title, gradient, border, body }: { title: string; gradient: string; border: string; body: string }) {
  return (
    <div style={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid ${border}` }}>
      <div style={{ background: gradient, padding: '7px 12px' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em' }}>{title}</span>
      </div>
      <div style={{ padding: '10px 12px', fontSize: '12px', color: '#334155', lineHeight: '1.6' }}>{body || '—'}</div>
    </div>
  )
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<RecentAlert[]>([])
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'recent' | 'rules'>('recent')
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all')
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all')
  const [popupAlert, setPopupAlert] = useState<RecentAlert | null>(null)
  const [popupRule, setPopupRule] = useState<AlertRule | null>(null)

  useEffect(() => {
    fetch('/api/alerts')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setAlerts(items.map((a: Record<string, unknown>, i: number) => ({
          id: String(a.alert_id ?? a.id ?? i),
          rule: String(a.rule_name ?? a.rule ?? 'Alert'),
          dataset: String(a.asset_name ?? a.sf_table_name ?? a.dataset ?? ''),
          severity: (['critical','high','medium','info'] as const).includes(a.severity as Severity) ? (a.severity as Severity) : 'info',
          message: String(a.alert_message ?? a.message ?? ''),
          channel: String(a.channel ?? 'System'),
          ts: String(a.created_at ?? a.ts ?? ''),
          ack: a.alert_status === 'closed' || Boolean(a.ack),
          rootCause: String(a.root_cause ?? ''),
          impact: String(a.impact ?? ''),
          recommendation: String(a.recommendation ?? ''),
          affectedRecords: Number(a.affected_records ?? 0),
          pipeline: String(a.pipeline ?? ''),
        })))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const unacked = alerts.filter(a => !a.ack).length
  const critical = alerts.filter(a => a.severity === 'critical').length

  function toggleRule(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }
  function ack(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, ack: true } : a))
    fetch('/api/alerts', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'acknowledge' }),
    }).catch(() => {})
  }
  function ackAll() {
    setAlerts(prev => prev.map(a => ({ ...a, ack: true })))
    alerts.filter(a => !a.ack).forEach(a => {
      fetch('/api/alerts', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, action: 'acknowledge' }),
      }).catch(() => {})
    })
  }

  const filteredAlerts = alerts.filter(a => {
    if (alertFilter === 'unacked') return !a.ack
    if (alertFilter === 'critical') return a.severity === 'critical'
    if (alertFilter === 'high') return a.severity === 'high'
    return true
  })
  const filteredRules = rules.filter(r => {
    if (ruleFilter === 'active') return r.enabled
    if (ruleFilter === 'critical') return r.severity === 'critical'
    if (ruleFilter === 'triggered') return r.triggered > 0
    return true
  })

  const closePopup = () => { setPopupAlert(null); setPopupRule(null) }

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Alerts</span>
        {unacked > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{unacked} unacked</span>}
        {critical > 0 && <span style={{ background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{critical} critical</span>}
        {rules.length > 0 && <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{rules.length} rules</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {unacked > 0 && <button onClick={ackAll} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>✓ Ack All</button>}
          <button style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>+ Rule</button>
        </div>
      </div>

      {/* tabs + filter pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        {(['recent', 'rules'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: tab === t ? '#1a1a1a' : 'var(--surface-muted)',
            color: tab === t ? '#fff' : 'var(--text-secondary)',
            fontWeight: tab === t ? 600 : 400, fontSize: '11px',
          }}>
            {t === 'recent' ? `Recent (${filteredAlerts.length})` : `Rules (${filteredRules.length})`}
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
      </div>

      {/* column headers */}
      {tab === 'recent' && !loading && filteredAlerts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto auto', gap: '0 8px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Severity','Rule','Time',''].map((h, i) => <span key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
        </div>
      )}
      {tab === 'rules' && !loading && filteredRules.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto auto auto', gap: '0 8px', padding: '0 6px 4px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['Severity','Rule','Triggered','Last Fired',''].map((h, i) => <span key={i} style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>)}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>}

        {tab === 'recent' && !loading && filteredAlerts.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{alerts.length === 0 ? 'No alerts yet' : 'No alerts match filters'}</div>
        )}
        {tab === 'recent' && !loading && filteredAlerts.map(a => {
          const ss = SEV[a.severity]
          return (
            <div key={a.id} onClick={() => setPopupAlert(a)}
              style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto auto', gap: '0 8px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${!a.ack ? ss.color : 'var(--border)'}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', opacity: a.ack ? 0.65 : 1 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span style={{ background: ss.bg, color: ss.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{a.severity}</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.rule}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.ts}</span>
              {!a.ack
                ? <button onClick={e => ack(a.id, e)} style={{ fontSize: '9px', border: '1px solid var(--border)', background: 'var(--surface)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Ack</button>
                : <span style={{ fontSize: '9px', color: 'var(--status-ok-text)' }}>✓</span>
              }
            </div>
          )
        })}

        {tab === 'rules' && !loading && filteredRules.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>No alert rules yet</div>
        )}
        {tab === 'rules' && !loading && filteredRules.map(r => {
          const ss = SEV[r.severity]
          return (
            <div key={r.id} onClick={() => setPopupRule(r)}
              style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto auto auto', gap: '0 8px', alignItems: 'center', padding: '5px 6px', borderLeft: `2px solid ${r.enabled ? ss.color : 'var(--border)'}`, borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer', opacity: !r.enabled ? 0.65 : 1 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <span style={{ background: ss.bg, color: ss.color, padding: '1px 5px', borderRadius: '3px', fontSize: '9.5px', fontWeight: 600, textAlign: 'center' }}>{r.severity}</span>
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: r.triggered > 0 ? 'var(--status-error-text)' : 'var(--status-ok-text)' }}>{r.triggered}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.lastFired}</span>
              <button onClick={e => toggleRule(r.id, e)} style={{ width: '32px', height: '18px', borderRadius: '9px', border: 'none', background: r.enabled ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: '2px', left: r.enabled ? '16px' : '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s', display: 'block' }} />
              </button>
            </div>
          )
        })}
      </div>

      {/* popup */}
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
                    {[['Table', popupAlert.dataset], ['Pipeline', popupAlert.pipeline], ['Channel', popupAlert.channel]].map(([l, v], i) => (
                      <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
                    {[['Affected Records', popupAlert.affectedRecords.toLocaleString()], ['Fired At', popupAlert.ts]].map(([l, v], i) => (
                      <div key={i} style={{ padding: '6px 8px', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Section title="🔍 ROOT CAUSE" gradient="linear-gradient(135deg,#7c3aed,#6d28d9)" border="#e9d5ff" body={popupAlert.rootCause} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <Section title="⚠️ IMPACT" gradient={popupAlert.severity === 'critical' ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'linear-gradient(135deg,#ea580c,#c2410c)'} border={ss.border} body={popupAlert.impact} />
                      <Section title="✅ FIX" gradient="linear-gradient(135deg,#16a34a,#15803d)" border="#bbf7d0" body={popupAlert.recommendation} />
                    </div>
                  </div>
                </>
              )
            })()}
            {popupRule && (() => {
              const ss = SEV[popupRule.severity]
              return (
                <>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ background: ss.bg, color: ss.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{popupRule.severity}</span>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1 }}>{popupRule.name}</span>
                    <button onClick={closePopup} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
                    {[['Owner', popupRule.owner], ['Cooldown', popupRule.cooldown], ['Status', popupRule.enabled ? '✅ Active' : '⏸ Disabled']].map(([l, v], i) => (
                      <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
                    {[['Times Triggered', String(popupRule.triggered)], ['Last Fired', popupRule.lastFired]].map(([l, v], i) => (
                      <div key={i} style={{ padding: '6px 8px', borderRight: i === 0 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{l}</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Section title="📋 DESCRIPTION" gradient="linear-gradient(135deg,#7c3aed,#6d28d9)" border="#e9d5ff" body={`${popupRule.description}${popupRule.whenItFires ? `\n\nFires when: ${popupRule.whenItFires}` : ''}`} />
                    <Section title="⚠️ BUSINESS CONTEXT" gradient="linear-gradient(135deg,#b45309,#d97706)" border="#fde68a" body={popupRule.businessContext} />
                    <Section title="✅ REMEDIATION" gradient="linear-gradient(135deg,#16a34a,#15803d)" border="#bbf7d0" body={popupRule.remediation} />
                  </div>
                </>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
