'use client'
import { useState } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

type FilterType = 'all' | 'failed' | 'system' | 'user'

interface AuditLog {
  id: string; user: string; action: string; resource: string
  ip: string; ts: string; category: string; result: 'success' | 'failed'
  detail: string; context: string; sessionId: string; duration: string
}

const logs: AuditLog[] = [
  {
    id: 'u1', user: 'Bhaskar R.', action: 'Connection Created', resource: 'SF_Codex (Snowflake)',
    ip: '192.168.1.10', ts: '2026-05-05 03:17', category: 'connection', result: 'success',
    sessionId: 'sess_8f2a1c', duration: '340ms',
    detail: 'Created new Snowflake connection "SF_Codex" with warehouse COMPUTE_WH, database ANALYTICS, schema PUBLIC. Connection test passed — query latency 120ms.',
    context: 'New Snowflake data warehouse onboarded for analytics platform. Connection replaces the legacy Redshift cluster. Admin accessed via web console from internal network.',
  },
  {
    id: 'u2', user: 'Bhaskar R.', action: 'Connection Tested', resource: 'SF_Codex',
    ip: '192.168.1.10', ts: '2026-05-05 03:18', category: 'connection', result: 'success',
    sessionId: 'sess_8f2a1c', duration: '125ms',
    detail: 'Connection test executed: SELECT 1. Returned in 120ms. Authentication via key-pair (RSA). SSL/TLS verified.',
    context: 'Standard connection validation after creation. All credentials verified.',
  },
  {
    id: 'u3', user: 'Priya M.', action: 'Rule Created', resource: 'Customer Email Format (dim_customers)',
    ip: '10.0.0.25', ts: '2026-05-04 14:30', category: 'rule', result: 'success',
    sessionId: 'sess_3c9d4e', duration: '210ms',
    detail: 'Created quality rule "Customer Email Format" of type regex on dim_customers.email. Pattern: ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$. Severity: Critical. Applied to connection SF_Codex.',
    context: 'Rule created in response to CRM import quality issue (ISS-002). Part of the data quality remediation plan for the Marketing team.',
  },
  {
    id: 'u4', user: 'Bhaskar R.', action: 'Rule Updated', resource: 'Orders NOT NULL Check',
    ip: '192.168.1.10', ts: '2026-05-04 11:00', category: 'rule', result: 'success',
    sessionId: 'sess_7a1b2f', duration: '180ms',
    detail: 'Updated rule "Orders NOT NULL Check": changed severity from high → critical. Added columns net_revenue and tax_amount to the NOT NULL check (previously only order_total). Threshold unchanged.',
    context: 'Severity escalated after Finance reported revenue dashboard impact from NULL values. Scope extended to cover all revenue-related columns.',
  },
  {
    id: 'u5', user: 'Rajan S.', action: 'Schedule Paused', resource: 'Inventory Snapshot Check',
    ip: '10.0.0.41', ts: '2026-05-04 09:15', category: 'schedule', result: 'success',
    sessionId: 'sess_5e8c1d', duration: '95ms',
    detail: 'Schedule "Inventory Snapshot Check" (cron: 0 */4 * * *) paused by Rajan S. Reason recorded: "Warehouse migration in progress — data will be unstable for 48h". Schedule will be resumed manually.',
    context: 'Planned pause during the W-North warehouse zone migration. Prevents false quality alerts during the transition period.',
  },
  {
    id: 'u6', user: 'System', action: 'Alert Fired', resource: 'Critical Quality Drop → fact_payments',
    ip: 'internal', ts: '2026-05-04 18:00', category: 'alert', result: 'success',
    sessionId: 'sys_auto', duration: '12ms',
    detail: 'Alert "Critical Quality Drop" triggered for fact_payments. Quality score dropped from 92% to 61% in one check cycle. Alert sent to: Slack #data-alerts, email bhaskar@company.com, PagerDuty P1 incident created (INC-4421).',
    context: 'Automated alert triggered by the quality monitoring engine. Root cause: payment processor API v3 migration introduced NULL payment_amount_usd for 1.48M rows.',
  },
  {
    id: 'u7', user: 'Anil K.', action: 'Login', resource: 'Web Console',
    ip: '10.0.0.88', ts: '2026-05-04 08:30', category: 'auth', result: 'success',
    sessionId: 'sess_2d7f9a', duration: '580ms',
    detail: 'Successful login via SSO (Google OAuth). Session created: sess_2d7f9a. Role: Analyst (read-only). MFA: not required (internal network). Session expires in 8h.',
    context: 'Regular work-hours login from internal network. No anomalies detected.',
  },
  {
    id: 'u8', user: 'Unknown', action: 'Login Failed', resource: 'Web Console',
    ip: '203.0.113.42', ts: '2026-05-03 23:14', category: 'auth', result: 'failed',
    sessionId: 'none', duration: '2,400ms',
    detail: 'Login attempt failed — invalid credentials. IP 203.0.113.42 is not in the internal IP range. This IP has attempted login 7 times in the last 24h (brute-force pattern detected). Account temporarily locked for 15 minutes. Security team notified.',
    context: 'SECURITY ALERT: External IP attempting authentication outside business hours. The IP block 203.0.113.0/24 is associated with a cloud VPS provider. No successful logins from this IP. Recommend adding to blocklist.',
  },
  {
    id: 'u9', user: 'Bhaskar R.', action: 'Report Generated', resource: 'Weekly Quality Summary',
    ip: '192.168.1.10', ts: '2026-05-03 09:00', category: 'report', result: 'success',
    sessionId: 'sess_1a3c5e', duration: '4,200ms',
    detail: 'Generated "Weekly Quality Summary" report for 2026-04-27 to 2026-05-03. Included 418 rules, 142 datasets, 7 connections. Overall score: 91.2%. PDF exported and emailed to stakeholders@company.com.',
    context: 'Scheduled weekly reporting. Report covers all active rules across the Analytics Platform workspace.',
  },
  {
    id: 'u10', user: 'Priya M.', action: 'Contract Created', resource: 'Customers → Marketing Platform',
    ip: '10.0.0.25', ts: '2026-05-02 15:45', category: 'contract', result: 'success',
    sessionId: 'sess_6b2e4c', duration: '310ms',
    detail: 'Created data contract "Customers → Marketing Platform" between producer dim_customers and consumer Marketing CDP. SLA target: 95% compliance. Terms: 5 quality checks defined. Owner: Priya M.',
    context: 'Contract established to formalise the Marketing CDP data quality requirements following the GDPR compliance review.',
  },
  {
    id: 'u11', user: 'Bhaskar R.', action: 'SLA Updated', resource: 'Payment Reconciliation SLA',
    ip: '192.168.1.10', ts: '2026-05-02 10:00', category: 'sla', result: 'success',
    sessionId: 'sess_9c4d7f', duration: '145ms',
    detail: 'Updated SLA "Payment Reconciliation": target tightened from < 0.1% variance to < 0.01% variance. SLA compliance target raised from 99% to 99.9%. Owner unchanged: Bhaskar R.',
    context: 'SLA tightened after Finance escalation. The payment reconciliation accuracy requirement increased following regulatory review.',
  },
  {
    id: 'u12', user: 'System', action: 'Anomaly Detected', resource: 'fact_orders volume spike',
    ip: 'internal', ts: '2026-05-05 14:22', category: 'anomaly', result: 'success',
    sessionId: 'sys_auto', duration: '8ms',
    detail: 'Anomaly detector identified a 340% row count spike in fact_orders (expected ~42K rows/hour, observed 184K). Type: Volume Spike. Severity: Critical. Auto-created Issue ISS-001 and dispatched alert to #data-alerts.',
    context: 'Caused by a duplicate-fire bug in the order confirmation webhook. The idempotency guard was bypassed during Redis cold-start after a deployment. 2,100 orders were inserted 4–5 times each.',
  },
]

const catColor: Record<string, { bg: string; color: string }> = {
  connection: { bg: '#eff6ff', color: '#2563eb' },
  rule:       { bg: '#f5f3ff', color: '#7c3aed' },
  schedule:   { bg: '#f0fdf4', color: '#16a34a' },
  alert:      { bg: '#fee2e2', color: '#dc2626' },
  auth:       { bg: '#fff7ed', color: '#ea580c' },
  report:     { bg: '#fef9c3', color: '#ca8a04' },
  contract:   { bg: '#f0fdfa', color: '#0d9488' },
  sla:        { bg: '#fdf4ff', color: '#a21caf' },
  anomaly:    { bg: '#fff1f2', color: '#e11d48' },
}

const avatarColors: Record<string, string> = {
  'Bhaskar R.': '#6366f1', 'Priya M.': '#ec4899',
  'Rajan S.': '#f59e0b',   'Anil K.': '#10b981', 'System': '#94a3b8',
}

export default function AuditLogsPage() {
  const [filter, setFilter]     = useState<FilterType>('all')
  const [category, setCategory] = useState('all')
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const categories = ['all', ...Array.from(new Set(logs.map(l => l.category)))]
  const totalEvents  = logs.length
  const usersActive  = new Set(logs.filter(l => l.user !== 'System').map(l => l.user)).size
  const systemEvents = logs.filter(l => l.user === 'System').length
  const failedEvents = logs.filter(l => l.result === 'failed').length

  const filtered = logs.filter(l => {
    const matchFilter =
      filter === 'all'    ? true :
      filter === 'failed' ? l.result === 'failed' :
      filter === 'system' ? l.user === 'System' :
      filter === 'user'   ? l.user !== 'System' : true
    const matchCat    = category === 'all' || l.category === category
    const matchSearch = search === '' ||
      l.user.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.resource.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchCat && matchSearch
  })

  const statCards = [
    { key: 'all'    as FilterType, label: 'Total Events',    value: totalEvents,  icon: '📋', color: '#1a1a1a', activeBg: '#1a1a1a' },
    { key: 'user'   as FilterType, label: 'Users Active',    value: usersActive,  icon: '👥', color: '#2563eb', activeBg: '#2563eb' },
    { key: 'system' as FilterType, label: 'System Events',   value: systemEvents, icon: '⚙️', color: '#6366f1', activeBg: '#6366f1' },
    { key: 'failed' as FilterType, label: 'Failed Actions',  value: failedEvents, icon: '⚠️', color: '#dc2626', activeBg: '#dc2626' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <PageTabBar tabs={[
        { href: '/alerts',     label: 'Alerts' },
        { href: '/incidents',  label: 'Incidents' },
        { href: '/audit-logs', label: 'Audit Logs' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Audit Logs</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Complete record of all user and system actions — {logs.length} events in the last 7 days
            {failedEvents > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> · {failedEvents} failed action{failedEvents > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <button style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#475569', cursor: 'pointer' }}>
          ⬇ Export Log
        </button>
      </div>

      {/* Clickable stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map((card, idx) => {
          const isActive = filter === card.key && idx !== 0
          return (
            <div key={card.key}
              onClick={() => idx === 0 ? setFilter('all') : setFilter(isActive ? 'all' : card.key)}
              style={{
                background: isActive ? card.activeBg : '#fff',
                border: `2px solid ${isActive ? card.activeBg : '#ebe8df'}`,
                borderRadius: '12px', padding: '16px 20px',
                cursor: idx === 0 ? 'default' : 'pointer',
                boxShadow: isActive ? `0 4px 16px ${card.activeBg}40` : 'none',
                transition: 'all 0.18s',
              }}>
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{card.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: isActive ? '#fff' : card.color }}>{card.value}</div>
              <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.8)' : '#64748b', marginTop: '2px' }}>{card.label}</div>
              {isActive && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', marginTop: '3px' }}>Click to clear</div>}
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by user, action, resource…"
          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none' }} />
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#475569' }}>
          {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
      </div>

      {/* Filter label */}
      {filter !== 'all' && (
        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12.5px', color: '#64748b' }}>Showing:</span>
          <span style={{ background: '#f1f5f9', color: '#334155', padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{filter}</span>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          <button onClick={() => setFilter('all')} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>✕ Clear</button>
        </div>
      )}

      {/* Log list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filtered.map(l => {
          const cc     = catColor[l.category] || { bg: '#f8fafc', color: '#64748b' }
          const isOpen = expanded === l.id
          const isFail = l.result === 'failed'
          const avatarColor = avatarColors[l.user] || '#64748b'
          const initials = l.user === 'System' ? '⚙' : l.user.split(' ').map(w => w[0]).join('').slice(0, 2)

          return (
            <div key={l.id} style={{
              background: '#fff',
              border: `1.5px solid ${isOpen ? '#6366f1' : isFail ? '#fca5a5' : '#e2e8f0'}`,
              borderRadius: '10px', overflow: 'hidden',
              boxShadow: isOpen ? '0 4px 16px rgba(99,102,241,0.1)' : isFail ? '0 1px 4px rgba(220,38,38,0.06)' : 'none',
              transition: 'all 0.18s',
            }}>

              {/* Summary row */}
              <div onClick={() => setExpanded(isOpen ? null : l.id)}
                style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}>

                {/* Avatar */}
                <div style={{
                  width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                  background: avatarColor, color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: l.user === 'System' ? '14px' : '11px', fontWeight: 700,
                }}>{initials}</div>

                {/* Timestamp */}
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', flexShrink: 0, minWidth: '120px' }}>{l.ts}</div>

                {/* User */}
                <div style={{ fontWeight: 600, fontSize: '12.5px', color: l.user === 'System' ? '#6366f1' : '#1a1a1a', flexShrink: 0, minWidth: '90px' }}>{l.user}</div>

                {/* Category */}
                <div style={{ flexShrink: 0 }}>
                  <span style={{ ...cc, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>{l.category}</span>
                </div>

                {/* Action */}
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a1a1a', flexShrink: 0, minWidth: '150px' }}>{l.action}</div>

                {/* Resource */}
                <div style={{ flex: 1, fontSize: '12.5px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.resource}</div>

                {/* IP */}
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94a3b8', flexShrink: 0, minWidth: '110px' }}>{l.ip}</div>

                {/* Result */}
                <div style={{ flexShrink: 0 }}>
                  <span style={{ background: isFail ? '#fee2e2' : '#f0fdf4', color: isFail ? '#dc2626' : '#16a34a', padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                    {isFail ? '✕ failed' : '✓ success'}
                  </span>
                </div>

                {/* Toggle */}
                <div style={{
                  width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
                  background: isOpen ? '#6366f1' : '#f1f5f9',
                  color: isOpen ? '#fff' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', transition: 'all 0.18s',
                }}>{isOpen ? '▲' : '▼'}</div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: '1px solid #f1f5f9', background: '#f8fafd' }}>

                  {/* Metadata bar */}
                  <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                    {[
                      { label: 'Session ID', value: l.sessionId },
                      { label: 'Duration',   value: l.duration  },
                      { label: 'IP Address', value: l.ip        },
                      { label: 'Category',   value: l.category  },
                      { label: 'Result',     value: l.result    },
                    ].map((m, i) => (
                      <div key={i} style={{ flex: 1, padding: '10px 16px', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: m.label === 'Result' && l.result === 'failed' ? '#dc2626' : '#334155', fontFamily: m.label === 'Session ID' || m.label === 'IP Address' ? 'monospace' : 'inherit' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

                    {/* Action detail */}
                    <div style={{ background: '#fff', borderRadius: '10px', border: `1px solid ${isFail ? '#fca5a5' : '#e0e7ff'}`, overflow: 'hidden' }}>
                      <div style={{ background: isFail ? '#fee2e2' : 'linear-gradient(90deg,#eef2ff,#f5f3ff)', padding: '9px 14px', borderBottom: `1px solid ${isFail ? '#fca5a5' : '#e0e7ff'}`, display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span>{isFail ? '🚨' : '📝'}</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: isFail ? '#dc2626' : '#4338ca', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Event Detail</span>
                      </div>
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{l.detail}</div>
                    </div>

                    {/* Context */}
                    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      <div style={{ background: '#fafaf9', padding: '9px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span>💬</span>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Context & Notes</span>
                      </div>
                      <div style={{ padding: '12px 14px', fontSize: '13px', color: '#475569', lineHeight: '1.7' }}>{l.context}</div>
                    </div>

                    <div>
                      <button onClick={() => setExpanded(null)} style={{ padding: '6px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                        ▲ Collapse
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
            No audit events match your filters
          </div>
        )}
      </div>
    </div>
  )
}
