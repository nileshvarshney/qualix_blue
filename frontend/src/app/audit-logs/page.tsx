'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/apiFetch'

type FilterType = 'all' | 'failed' | 'system' | 'user'

interface AuditLog {
  id: string; user: string; action: string; resource: string
  ip: string; ts: string; category: string; result: 'success' | 'failed'
  detail: string; context: string; sessionId: string; duration: string
  _suspicious?: boolean; _suspiciousReason?: string
}

const catColor: Record<string, { bg: string; color: string }> = {
  connection: { bg: 'var(--status-info-bg)',  color: 'var(--status-info-text)'  }, rule:      { bg: 'rgba(124,58,237,0.08)',  color: '#7c3aed' },
  schedule:   { bg: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)'    }, alert:     { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
  auth:       { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  }, report:    { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
  contract:   { bg: 'rgba(13,148,136,0.10)', color: '#0d9488'                   }, sla:       { bg: 'rgba(162,28,175,0.08)', color: '#a21caf' },
  anomaly:    { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)' }, issue:     { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
  asset:      { bg: 'var(--status-info-bg)',  color: 'var(--status-info-text)'  }, domain:    { bg: 'var(--status-ok-bg)',    color: 'var(--status-ok-text)'    },
  glossary:   { bg: 'rgba(126,34,206,0.08)', color: '#7e22ce'                   }, team:      { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
  user:       { bg: 'rgba(15,118,110,0.10)', color: '#0f766e'                   }, ownership: { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)'  },
}

const AVATAR_PALETTE = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6']
function avatarColor(user: string) {
  if (user === 'System') return '#94a3b8'
  let h = 0
  for (let i = 0; i < user.length; i++) h = (h * 31 + user.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}

function userInitials(user: string) {
  if (user === 'System') return '⚙'
  if (user.includes('@')) return user.split('@')[0].slice(0, 2).toUpperCase()
  return user.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function shortId(id: string) {
  const clean = id.replace(/-/g, '')
  return clean.length > 8 ? clean.slice(0, 8) : clean
}

function fmtTime(ts: string) {
  if (!ts) return '—'
  try {
    const d = new Date(ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z')
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  } catch { return ts }
}

function tsToDay(ts: string) {
  try {
    const d = new Date(ts.includes('Z') || ts.includes('+') ? ts : ts + 'Z')
    return d.toISOString().slice(0, 10)
  } catch { return '' }
}

const COL = '150px 110px 1fr 148px 72px'

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [suspiciousOnly, setSuspiciousOnly] = useState(false)
  const [popup, setPopup] = useState<AuditLog | null>(null)
  const [anomalies, setAnomalies] = useState<Array<{pattern:string; severity:string; user_email:string; event_count:number; description:string}>>([])
  const [coverage, setCoverage] = useState<{coverage_pct:number; uncovered_types:string[]} | null>(null)
  const [verifyResult, setVerifyResult] = useState<{total_hashed:number; total_unverified:number; intact:number; tampered:number; tampered_ids:string[]} | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [alertConfig, setAlertConfig] = useState({ slack_webhook: '', email_recipients: '', alert_types: ['off_hours', 'bulk_access', 'repeated_failures'] as string[], min_severity: 'medium', enabled: false })
  const [alertConfigOpen, setAlertConfigOpen] = useState(false)
  const [alertSaving, setAlertSaving] = useState(false)
  const [alertSaved, setAlertSaved] = useState(false)
  const [alertTestResult, setAlertTestResult] = useState<string | null>(null)
  const [alertTestLoading, setAlertTestLoading] = useState(false)

  useEffect(() => {
    apiFetch('/api/audit')
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setLogs(items.map((l: Record<string, unknown>, i: number) => {
          const entityType = String(l.entity_type ?? '')
          const entityId   = String(l.entity_id ?? '')
          const resourceStr = l.resource ?? l.resource_name
            ?? (entityId ? `${entityType}/${entityId}` : entityType)

          let detail = String(l.detail ?? l.description ?? '')
          if (!detail) {
            const parts: string[] = []
            if (l.old_value && typeof l.old_value === 'object')
              parts.push(`Before: ${JSON.stringify(l.old_value)}`)
            if (l.new_value && typeof l.new_value === 'object')
              parts.push(`After: ${JSON.stringify(l.new_value)}`)
            detail = parts.join('\n')
          }

          return {
            id: String(l.audit_id ?? l.id ?? i),
            user: String(l.user_email ?? l.user_name ?? l.user ?? 'System'),
            action: String(l.action ?? l.action_type ?? ''),
            resource: String(resourceStr),
            ip: String(l.ip_address ?? l.ip ?? 'internal'),
            ts: String(l.created_at ?? l.ts ?? l.timestamp ?? ''),
            category: String(l.entity_type ?? l.category ?? l.event_type ?? 'system'),
            result: l.result === 'failed' || l.status === 'failed' ? 'failed' : 'success',
            detail,
            context: String(l.context ?? l.notes ?? ''),
            sessionId: String(l.session_id ?? l.sessionId ?? ''),
            duration: l.duration_ms ? `${l.duration_ms}ms` : String(l.duration ?? ''),
            _suspicious: l._suspicious === true ? true : undefined,
            _suspiciousReason: typeof l._suspiciousReason === 'string' ? l._suspiciousReason : undefined,
          }
        }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    apiFetch('/api/audit/anomalies')
      .then(r => r.json())
      .then(data => setAnomalies(Array.isArray(data) ? data : []))
      .catch(() => {})
    apiFetch('/api/audit/alert-config').then(r => r.ok ? r.json() : null).then(d => { if (d) setAlertConfig(d) }).catch(() => {})
  }, [])

  useEffect(() => {
    apiFetch('/api/audit/coverage')
      .then(r => r.json())
      .then(data => data && typeof data.coverage_pct === 'number' ? setCoverage(data) : null)
      .catch(() => {})
  }, [])

  const categories   = ['all', ...Array.from(new Set(logs.map(l => l.category)))]
  const failedEvents = logs.filter(l => l.result === 'failed').length
  const usersActive  = new Set(logs.filter(l => l.user !== 'System').map(l => l.user)).size
  const systemEvents = logs.filter(l => l.user === 'System').length

  function exportAuditCsv(rows: typeof filtered) {
    const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Category', 'Result', 'IP']
    const lines = rows.map(r => [r.ts, r.user, r.action, r.resource, r.category, r.result, r.ip]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv' }))
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function exportAuditJson(rows: typeof filtered) {
    const payload = rows.map(r => ({
      timestamp: r.ts, user: r.user, action: r.action, resource: r.resource,
      category: r.category, result: r.result, ip: r.ip, session_id: r.sessionId,
      duration: r.duration, detail: r.detail, context: r.context,
    }))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function handleVerify() {
    setVerifyLoading(true)
    setShowVerifyModal(true)
    try {
      const r = await apiFetch('/api/audit/verify')
      if (!r.ok) { setVerifyResult(null); return; }
      const data = await r.json()
      setVerifyResult(data)
    } catch { setVerifyResult(null) }
    finally { setVerifyLoading(false) }
  }

  async function saveAlertConfig() {
    setAlertSaving(true)
    try {
      const res = await apiFetch('/api/audit/alert-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(alertConfig) })
      if (res.ok) setAlertConfig(await res.json())
      setAlertSaved(true); setTimeout(() => setAlertSaved(false), 2500)
    } finally { setAlertSaving(false) }
  }

  async function testAlertConfig() {
    setAlertTestLoading(true); setAlertTestResult(null)
    try {
      const res = await apiFetch('/api/audit/alert-config/test', { method: 'POST' })
      const d = await res.json()
      setAlertTestResult(d.message ?? (d.ok ? 'Test sent' : 'Failed'))
    } catch { setAlertTestResult('Could not reach backend') }
    finally { setAlertTestLoading(false) }
  }

  const filtered = logs.filter(l => {
    const matchFilter =
      filter === 'failed' ? l.result === 'failed' :
      filter === 'system' ? l.user === 'System' :
      filter === 'user'   ? l.user !== 'System' : true
    const matchCat    = category === 'all' || l.category === category
    const matchSearch = !search || [l.user, l.action, l.resource].some(v => v.toLowerCase().includes(search.toLowerCase()))
    const day = tsToDay(l.ts)
    const matchDate   = (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo)
    const matchSuspicious = !suspiciousOnly || l._suspicious
    return matchFilter && matchCat && matchSearch && matchDate && matchSuspicious
  })

  return (
    <div style={{ padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', gap: '8px', background: 'var(--background)' }}>

      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Audit Logs</span>
        <span style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{logs.length} events</span>
        {usersActive > 0 && <span style={{ background: 'var(--status-info-bg)', color: 'var(--status-info-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{usersActive} users</span>}
        {systemEvents > 0 && <span style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{systemEvents} system</span>}
        {failedEvents > 0 && <span style={{ background: 'var(--status-error-bg)', color: 'var(--status-error-text)', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{failedEvents} failed</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          <button onClick={handleVerify} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>🔒 Verify Integrity</button>
          <button onClick={() => exportAuditCsv(filtered)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>⬇ CSV</button>
          <button onClick={() => exportAuditJson(filtered)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer' }}>⬇ JSON</button>
        </div>
      </div>

      {/* Security alerts */}
      {anomalies.length > 0 && (
        <div style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error-text)', borderRadius: '8px', padding: '10px 14px', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-error-text)', marginBottom: '6px' }}>⚠ Security Alerts ({anomalies.length})</div>
          {anomalies.map((a, i) => (
            <div key={i} style={{ fontSize: '11px', color: 'var(--status-error-text)', padding: '2px 0', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{a.pattern.replace(/_/g, ' ')}</span>
              {' · '}{a.description}
            </div>
          ))}
        </div>
      )}

      {/* ── Suspicious Activity Alert Config ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0', flexShrink: 0, overflow: 'hidden' }}>
        <button onClick={() => setAlertConfigOpen(o => !o)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--foreground)' }}>🔔 Suspicious Activity Alert Config</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{alertConfigOpen ? '▲ collapse' : '▼ expand'}</span>
          <span style={{ background: alertConfig.enabled ? 'var(--status-ok-bg)' : 'var(--surface-muted)', color: alertConfig.enabled ? 'var(--status-ok-text)' : 'var(--text-muted)', fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '10px', flexShrink: 0 }}>
            {alertConfig.enabled ? 'Active' : 'Disabled'}
          </span>
        </button>
        {alertConfigOpen && (
          <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Enable alerts</span>
              <button onClick={() => setAlertConfig(c => ({ ...c, enabled: !c.enabled }))}
                style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', background: alertConfig.enabled ? '#16a34a' : 'var(--border)', cursor: 'pointer', position: 'relative' }}>
                <span style={{ position: 'absolute', top: '2px', left: alertConfig.enabled ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
              </button>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Slack Webhook URL</label>
              <input value={alertConfig.slack_webhook} onChange={e => setAlertConfig(c => ({ ...c, slack_webhook: e.target.value }))}
                placeholder="https://hooks.slack.com/services/…"
                style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '3px' }}>Email Recipients</label>
              <input value={alertConfig.email_recipients} onChange={e => setAlertConfig(c => ({ ...c, email_recipients: e.target.value }))}
                placeholder="alice@company.com, bob@company.com"
                style={{ width: '100%', padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Alert on</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {[['off_hours', 'Off-hours access'], ['bulk_access', 'Bulk data access'], ['repeated_failures', 'Repeated auth failures'], ['unusual_ip', 'Unusual IP']].map(([v, l]) => {
                  const active = alertConfig.alert_types.includes(v)
                  return (
                    <button key={v} onClick={() => setAlertConfig(c => ({ ...c, alert_types: active ? c.alert_types.filter(x => x !== v) : [...c.alert_types, v] }))}
                      style={{ padding: '2px 8px', borderRadius: '10px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-muted)', fontSize: '10px', cursor: 'pointer', fontWeight: active ? 600 : 400 }}>
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)' }}>Min severity</label>
              <select value={alertConfig.min_severity} onChange={e => setAlertConfig(c => ({ ...c, min_severity: e.target.value }))}
                style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--foreground)' }}>
                {['low', 'medium', 'high'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button onClick={saveAlertConfig} disabled={alertSaving}
                style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                {alertSaving ? 'Saving…' : alertSaved ? 'Saved ✓' : 'Save'}
              </button>
              <button onClick={testAlertConfig} disabled={alertTestLoading}
                style={{ padding: '5px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>
                {alertTestLoading ? 'Sending…' : 'Send Test Alert'}
              </button>
              {alertTestResult && <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{alertTestResult}</span>}
            </div>
          </div>
        )}
      </div>

      {/* search + category */}
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search user, action, resource…"
          style={{ flex: 1, padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', outline: 'none' }} />
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--text-secondary)' }}>
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* filter pills + date range */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, flexWrap: 'wrap' }}>
        {(['all','user','system','failed'] as FilterType[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
            background: filter === f ? 'var(--foreground)' : 'var(--surface-muted)',
            color: filter === f ? 'var(--background)' : 'var(--text-secondary)',
            fontWeight: filter === f ? 600 : 400, fontSize: '11px',
          }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
        <button
          onClick={() => setSuspiciousOnly(v => !v)}
          style={{
            fontSize: '11px', padding: '4px 10px', borderRadius: '5px',
            border: `1px solid ${suspiciousOnly ? 'var(--status-warn-text)' : 'var(--border)'}`,
            background: suspiciousOnly ? 'var(--status-warn-bg)' : 'var(--surface)',
            color: suspiciousOnly ? 'var(--status-warn-text)' : 'var(--text-secondary)',
            cursor: 'pointer', fontWeight: suspiciousOnly ? 700 : 400,
          }}
        >
          ⚠ Suspicious only
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Date range:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer' }} />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface)', color: 'var(--foreground)', cursor: 'pointer' }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ padding: '3px 7px', borderRadius: '5px', border: '1px solid var(--border)', fontSize: '11px', background: 'var(--surface-muted)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* column headers */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: COL, gap: '0 12px', padding: '0 10px 5px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {['User', 'Action', 'Entity', 'Date & Time', 'Status'].map((h, i) => (
            <span key={i} style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
          ))}
        </div>
      )}

      {/* scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{logs.length === 0 ? 'No audit logs yet' : 'No events match filters'}</div>
        )}
        {!loading && filtered.map(l => {
          const cc     = catColor[l.category] ?? { bg: 'var(--surface-muted)', color: 'var(--text-secondary)' }
          const isFail = l.result === 'failed'

          // "issue/abc123-de..." → entityLabel="issue", entityShort="ab12cd34"
          const slash = l.resource.indexOf('/')
          const entityLabel = slash >= 0 ? l.resource.slice(0, slash) : l.resource
          const entityShort = slash >= 0 ? shortId(l.resource.slice(slash + 1)) : ''

          return (
            <div key={l.id} onClick={() => setPopup(l)}
              style={{
                display: 'grid', gridTemplateColumns: COL, gap: '0 12px',
                alignItems: 'center', padding: '5px 10px',
                borderBottom: '1px solid var(--surface-muted)',
                borderLeft: l._suspicious ? '3px solid var(--status-warn-text)' : `3px solid ${isFail ? '#fca5a5' : 'transparent'}`,
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {/* user */}
              <span style={{ fontSize: '11px', color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.user}</span>

              {/* action */}
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--foreground)', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                {l.action.replace(/_/g, ' ')}
                {l._suspicious && (
                  <span
                    title={l._suspiciousReason ?? 'suspicious activity'}
                    style={{
                      background: 'var(--status-warn-bg)', color: 'var(--status-warn-text)',
                      fontSize: '9px', fontWeight: 700, padding: '1px 4px', borderRadius: '3px',
                      marginLeft: '4px', cursor: 'help',
                    }}
                  >
                    ⚠
                  </span>
                )}
              </span>

              {/* entity: colored badge + short ID */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <span style={{ background: cc.bg, color: cc.color, padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {entityLabel || l.category}
                </span>
                {entityShort && (
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    #{entityShort}
                  </span>
                )}
              </div>

              {/* time */}
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtTime(l.ts)}</span>

              {/* status */}
              <span style={{ background: isFail ? 'var(--status-error-bg)' : 'var(--status-ok-bg)', color: isFail ? 'var(--status-error-text)' : 'var(--status-ok-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>
                {isFail ? '✕ Failed' : '✓ OK'}
              </span>
            </div>
          )
        })}
      </div>

      {/* detail drawer */}
      {popup && (
        <>
          <div onClick={() => setPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--foreground)', flex: 1, textTransform: 'capitalize' }}>{popup.action.replace(/_/g, ' ')}</span>
              <span style={{ background: popup.result === 'failed' ? 'var(--status-error-bg)' : 'var(--status-ok-bg)', color: popup.result === 'failed' ? 'var(--status-error-text)' : 'var(--status-ok-text)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600 }}>{popup.result}</span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '12px 14px 0' }}>
              {([['User', popup.user], ['IP Address', popup.ip], ['Category', popup.category]] as [string, string][]).map(([lbl, val], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{lbl}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: lbl === 'IP Address' ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{val || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '6px 14px 0' }}>
              {([['Session ID', popup.sessionId], ['Duration', popup.duration], ['Timestamp', popup.ts]] as [string, string][]).map(([lbl, val], i) => (
                <div key={i} style={{ padding: '6px 8px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-muted)' }}>{lbl}</div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px', fontFamily: lbl === 'Session ID' ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{val || '—'}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {popup.detail && (
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: `1px solid ${popup.result === 'failed' ? 'var(--status-error-text)' : 'var(--border)'}` }}>
                  <div style={{ background: popup.result === 'failed' ? 'var(--status-error-bg)' : 'var(--surface-muted)', padding: '7px 12px' }}>
                    <span style={{ fontWeight: 700, fontSize: '11px', color: popup.result === 'failed' ? 'var(--status-error-text)' : 'var(--text-secondary)', letterSpacing: '0.04em' }}>EVENT DETAIL</span>
                  </div>
                  <pre style={{ padding: '10px 12px', fontSize: '11.5px', color: 'var(--foreground)', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' }}>{popup.detail}</pre>
                </div>
              )}
              {popup.context && (
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <div style={{ background: 'var(--surface-muted)', padding: '7px 12px' }}>
                    <span style={{ fontWeight: 700, fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>CONTEXT</span>
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>{popup.context}</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Verify integrity modal */}
      {showVerifyModal && (
        <>
          <div onClick={() => setShowVerifyModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 299, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px 28px', zIndex: 300, minWidth: '360px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--foreground)', marginBottom: '16px' }}>🔒 Log Integrity Check</div>
            {verifyLoading && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Verifying…</div>}
            {!verifyLoading && !verifyResult && <div style={{ color: 'var(--status-error-text)', fontSize: '13px' }}>Verification failed — backend unavailable.</div>}
            {!verifyLoading && verifyResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ background: verifyResult.tampered === 0 ? 'var(--status-ok-bg)' : 'var(--status-error-bg)', border: `1px solid ${verifyResult.tampered === 0 ? 'var(--status-ok-text)' : 'var(--status-error-text)'}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: verifyResult.tampered === 0 ? 'var(--status-ok-text)' : 'var(--status-error-text)' }}>
                  {verifyResult.tampered === 0
                    ? `✓ All ${verifyResult.intact} hashed records intact`
                    : `✕ ${verifyResult.tampered} records show hash mismatch`}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  Hashed: {verifyResult.total_hashed} · Unverified (legacy): {verifyResult.total_unverified}
                </div>
                {verifyResult.tampered_ids.length > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--status-error-text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    Tampered IDs: {verifyResult.tampered_ids.join(', ')}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setShowVerifyModal(false)} style={{ marginTop: '16px', padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-muted)', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>Close</button>
          </div>
        </>
      )}
    </div>
  )
}
