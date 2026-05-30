'use client'
import { useState } from 'react'

type Status   = 'open' | 'investigating' | 'resolved'
type Severity = 'critical' | 'warning'

type Activity = { by: string; action: string; time: string }
type Issue = {
  id: string; title: string; dataset: string; rule: string
  severity: Severity; status: Status; owner: string; opened: string
  count: number; rootCause: string; impact: string; recommendation: string
  affectedColumns: string[]; activity: Activity[]
}

const INIT: Issue[] = [
  {
    id: 'ISS-001', title: 'order_total > 0 failing on orders.transactions',
    dataset: 'orders.transactions', rule: 'order_total > 0',
    severity: 'critical', status: 'open', owner: 'Data Platform', opened: '2h ago', count: 412,
    rootCause: 'A batch ETL job from the legacy ERP ran at 01:00 UTC with a sign-flip bug — order_total was imported as its negative value for returns processed that night. 412 rows now carry negative totals.',
    impact: 'Revenue dashboards understate daily GMV by ~$38K. Downstream revenue_by_channel view aggregates these negative values, causing the Finance BI report to show incorrect channel splits.',
    recommendation: 'Rerun the ETL with the sign-fix patch (PR #4421). Re-validate after rerun. Add a pre-load assertion order_total > 0 to block future bad loads.',
    affectedColumns: ['order_total', 'net_revenue', 'tax_amount'],
    activity: [
      { by: 'System', action: 'Issue auto-detected by quality rule engine', time: '2h ago' },
      { by: 'System', action: 'Alert sent to #data-alerts Slack channel', time: '2h ago' },
    ],
  },
  {
    id: 'ISS-002', title: 'Email regex mismatch in crm.users',
    dataset: 'crm.users', rule: 'email matches regex',
    severity: 'critical', status: 'open', owner: 'Growth', opened: '3h ago', count: 287,
    rootCause: 'A CRM import from a third-party lead-gen vendor included 287 malformed email addresses (missing "@" or top-level domain). The import script skipped server-side email validation.',
    impact: 'Email campaigns sent to these addresses will hard-bounce, damaging sender reputation. Marketing attribution for these leads is broken — they cannot be matched to GA4 session data.',
    recommendation: 'Quarantine the 287 records into a crm.users_quarantine table. Request corrected data from vendor. Add server-side email validation regex to the import pipeline.',
    affectedColumns: ['email', 'user_id', 'lead_source'],
    activity: [
      { by: 'System', action: 'Issue auto-detected by quality rule engine', time: '3h ago' },
      { by: 'Priya M.', action: 'Assigned to Growth team for vendor follow-up', time: '2h ago' },
    ],
  },
  {
    id: 'ISS-003', title: 'ga.sessions_daily freshness SLA breached',
    dataset: 'ga.sessions_daily', rule: 'freshness < 6h',
    severity: 'warning', status: 'investigating', owner: 'Marketing', opened: '7h ago', count: 1,
    rootCause: 'The GA4 export to BigQuery pipeline stalled at 00:15 UTC — the Pub/Sub subscription hit its message retention limit (7 days) and stopped forwarding new events. The Dataflow job is alive but processing no new messages.',
    impact: 'Marketing team cannot see same-day campaign performance. Paid media bidding algorithms that rely on this table are running on 7h-old data, potentially overspending on underperforming channels.',
    recommendation: 'Purge the Pub/Sub backlog and restart the Dataflow job. Increase subscription retention to 14 days. Add a freshness alert for this pipeline at 2h (not just 6h SLA breach).',
    affectedColumns: ['session_date', 'utm_source', 'conversions'],
    activity: [
      { by: 'System', action: 'SLA breach detected — table not updated in 6h', time: '7h ago' },
      { by: 'Priya M.', action: 'Began investigation — checking Dataflow job status', time: '5h ago' },
      { by: 'Priya M.', action: 'Root cause identified: Pub/Sub retention exhausted', time: '3h ago' },
    ],
  },
  {
    id: 'ISS-004', title: 'SKU null values in inventory.items',
    dataset: 'inventory.items', rule: 'sku not null',
    severity: 'warning', status: 'open', owner: 'Supply Chain', opened: '5h ago', count: 94,
    rootCause: '94 inventory records were created via the warehouse mobile app without a SKU scan — operators manually entered items by name but the SKU field was left blank. No validation exists on the mobile app form.',
    impact: 'These 94 records cannot be matched to dim_products, causing NULL joins in inventory reports. Reorder point calculations exclude these items, creating risk of undetected stockouts.',
    recommendation: 'Add a mandatory SKU field validation to the warehouse mobile app (JIRA WH-892). Manually reconcile the 94 records with the products team. Add a NOT NULL constraint to the sku column.',
    affectedColumns: ['sku', 'product_id', 'reorder_point'],
    activity: [
      { by: 'System', action: 'Issue auto-detected by quality rule engine', time: '5h ago' },
      { by: 'Rajan S.', action: 'Confirmed — warehouse team notified', time: '4h ago' },
    ],
  },
  {
    id: 'ISS-005', title: 'Row count drop >20% in finance.ledger',
    dataset: 'finance.ledger', rule: 'row count Δ < 20%',
    severity: 'warning', status: 'open', owner: 'Finance', opened: '1h ago', count: 1,
    rootCause: 'The nightly ledger snapshot dropped from 2.4M to 1.87M rows — a 22% decrease. Preliminary investigation points to a WHERE clause added to the snapshot query in a recent deployment (commit a3f9b2) that accidentally filters out inter-company transactions.',
    impact: 'Inter-company eliminations missing from the ledger will cause the consolidated P&L to overstate gross revenue. Month-end close is at risk if not resolved before EOD.',
    recommendation: 'Roll back commit a3f9b2 or hotfix the WHERE clause to restore inter-company transaction inclusion. Re-run the nightly snapshot. Notify the Finance Controller.',
    affectedColumns: ['transaction_id', 'entity_code', 'intercompany_flag'],
    activity: [
      { by: 'System', action: 'Anomaly detector flagged row count drop >20%', time: '1h ago' },
      { by: 'System', action: 'Alert sent to Finance team channel', time: '1h ago' },
    ],
  },
  {
    id: 'ISS-006', title: 'Null customer IDs in prod.orders_fact',
    dataset: 'prod.orders_fact', rule: 'customer_id not null',
    severity: 'critical', status: 'open', owner: 'Data Platform', opened: '4h ago', count: 1843,
    rootCause: 'Guest checkout orders are flowing into prod.orders_fact without a customer_id because the identity-resolution service (IDR) was deployed without the guest-order handler. IDR returns NULL for guest sessions.',
    impact: '1,843 orders (~4.4% of daily volume) have no customer linkage. LTV models exclude these orders, understating revenue per customer. Retargeting audiences miss these buyers entirely.',
    recommendation: 'Deploy the IDR guest-order handler (hotfix available in branch fix/idr-guest). Backfill the 1,843 NULL records using session_id → email matching. Add a NOT NULL alert for this column at 0.5% threshold.',
    affectedColumns: ['customer_id', 'session_id', 'order_value'],
    activity: [
      { by: 'System', action: 'Issue auto-detected — 1,843 NULLs found', time: '4h ago' },
      { by: 'Bhaskar R.', action: 'Identified root cause: IDR guest handler missing', time: '3h ago' },
    ],
  },
  {
    id: 'ISS-007', title: 'Duplicate order_ids in prod.orders_fact',
    dataset: 'prod.orders_fact', rule: 'order_id unique',
    severity: 'critical', status: 'resolved', owner: 'Data Platform', opened: '1d ago', count: 0,
    rootCause: 'A double-fire in the order confirmation webhook caused 2,100 orders to be inserted twice. The idempotency key check was bypassed during a brief 4-minute window when Redis was unavailable.',
    impact: 'Revenue was double-counted for ~$180K. Resolved by deduplication and Redis failover implementation. No external reporting was affected.',
    recommendation: 'Resolved. Added Redis cluster with automatic failover. Idempotency key check now uses DB-level upsert as fallback. Post-mortem completed.',
    affectedColumns: ['order_id', 'order_value', 'customer_id'],
    activity: [
      { by: 'System', action: 'Issue detected — 2,100 duplicate order_ids', time: '1d ago' },
      { by: 'Bhaskar R.', action: 'Root cause: Redis outage bypassed idempotency', time: '23h ago' },
      { by: 'Bhaskar R.', action: 'Deduplication script run — 2,100 duplicates removed', time: '20h ago' },
      { by: 'Bhaskar R.', action: 'Marked as resolved — Redis failover deployed', time: '18h ago' },
    ],
  },
  {
    id: 'ISS-008', title: 'Revenue values outside expected range',
    dataset: 'fin.revenue', rule: 'revenue range check',
    severity: 'warning', status: 'resolved', owner: 'Finance', opened: '2d ago', count: 0,
    rootCause: 'A currency conversion rate for JPY was entered as 0.073 instead of 0.0073 USD/JPY — a trailing-zero data entry error caused ~340 transactions to show revenue 10× higher than expected.',
    impact: 'Finance report showed inflated international revenue for 6 hours before detection. No external reporting was affected — caught before month-end close.',
    recommendation: 'Resolved. Corrected the exchange rate table. Added a range check (±3σ from 30-day average) as a standing quality rule on fin.revenue.',
    affectedColumns: ['revenue_usd', 'currency_code', 'fx_rate'],
    activity: [
      { by: 'System', action: 'Range check flagged 340 out-of-band revenue records', time: '2d ago' },
      { by: 'Anil K.', action: 'Found root cause: JPY fx_rate entry error', time: '2d ago' },
      { by: 'Anil K.', action: 'Corrected exchange rate — records recalculated', time: '2d ago' },
      { by: 'Anil K.', action: 'Marked as resolved', time: '1d 22h ago' },
    ],
  },
]

const sevCfg = {
  critical: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', label: 'Critical', barColor: '#dc2626' },
  warning:  { bg: '#fef3c7', color: '#d97706', border: '#fde68a', label: 'Warning',  barColor: '#f59e0b' },
}
const stCfg = {
  open:          { bg: '#fee2e2', color: '#dc2626', label: 'Open'          },
  investigating: { bg: '#fef3c7', color: '#d97706', label: 'Investigating' },
  resolved:      { bg: '#dcfce7', color: '#16a34a', label: 'Resolved'      },
}
const STATUS_FLOW: Record<Status, Status[]> = {
  open:          ['investigating', 'resolved'],
  investigating: ['open', 'resolved'],
  resolved:      ['open', 'investigating'],
}

function avatarInitial(name: string) {
  return name === 'System' ? '⚙' : name.split(' ').map(w => w[0]).join('').slice(0, 2)
}
const avatarColors: Record<string, string> = {
  'System': '#94a3b8', 'Bhaskar R.': '#6366f1', 'Priya M.': '#ec4899',
  'Rajan S.': '#f59e0b', 'Anil K.': '#10b981',
}

export default function IssuesPage() {
  const [issues, setIssues]     = useState<Issue[]>(INIT)
  const [statusF, setStatusF]   = useState<'all' | Status>('all')
  const [sevF, setSevF]         = useState<'all' | Severity>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing]   = useState<Issue | null>(null)
  const [editForm, setEditForm] = useState({ title: '', owner: '', severity: 'critical' as Severity, status: 'open' as Status })

  const open = issues.filter(i => i.status === 'open').length
  const inv  = issues.filter(i => i.status === 'investigating').length
  const res  = issues.filter(i => i.status === 'resolved').length
  const crit = issues.filter(i => i.severity === 'critical' && i.status !== 'resolved').length

  const filtered = issues
    .filter(i => statusF === 'all' || i.status === statusF)
    .filter(i => sevF === 'all' || i.severity === sevF)

  function changeStatus(id: string, newStatus: Status) {
    setIssues(prev => prev.map(i => {
      if (i.id !== id) return i
      const entry: Activity = { by: 'Bhaskar R.', action: `Status changed to ${newStatus}`, time: 'just now' }
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
      const entry: Activity = { by: 'Bhaskar R.', action: 'Issue details updated', time: 'just now' }
      return { ...i, ...editForm, activity: [...i.activity, entry] }
    }))
    setEditing(null)
  }

  const statCards = [
    { key: 'open'          as 'all' | Status, label: 'Open',          value: open, color: '#dc2626', bg: '#fff1f2', activeBg: '#dc2626' },
    { key: 'investigating' as 'all' | Status, label: 'Investigating', value: inv,  color: '#d97706', bg: '#fffbeb', activeBg: '#d97706' },
    { key: 'resolved'      as 'all' | Status, label: 'Resolved',      value: res,  color: '#16a34a', bg: '#f0fdf4', activeBg: '#16a34a' },
    { key: 'all'           as 'all' | Status, label: 'Critical',      value: crit, color: '#dc2626', bg: '#fff1f2', activeBg: '#dc2626' },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1200px' }}>
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Issues</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
            {open + inv} open · <span style={{ color: '#dc2626', fontWeight: 600 }}>{crit} critical</span>
          </p>
        </div>
        <button style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)', border: 'none', padding: '9px 18px', borderRadius: '9px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,0.3)' }}>
          + Create Issue
        </button>
      </div>

      {/* Clickable stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '20px' }}>
        {statCards.map(s => {
          const isActive = statusF === s.key && s.key !== 'all'
          return (
            <button key={s.label} onClick={() => setStatusF(isActive || s.key === 'all' ? 'all' : s.key)}
              style={{
                background: isActive ? s.activeBg : s.bg,
                border: `2px solid ${isActive ? s.activeBg : 'transparent'}`,
                borderRadius: '14px', padding: '18px 20px', cursor: 'pointer', textAlign: 'left',
                boxShadow: isActive ? `0 6px 20px ${s.activeBg}40` : '0 1px 4px rgba(0,0,0,0.04)',
                transition: 'all 0.18s',
              }}>
              <div style={{ fontSize: '11.5px', color: isActive ? 'rgba(255,255,255,0.8)' : '#64748b', marginBottom: '6px', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: isActive ? '#fff' : s.color, lineHeight: 1 }}>{s.value}</div>
              {isActive && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '5px' }}>Click to clear filter</div>}
            </button>
          )
        })}
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(['all', 'open', 'investigating', 'resolved'] as const).map(f => (
          <button key={f} onClick={() => setStatusF(f)} style={{
            padding: '6px 14px', borderRadius: '20px', border: '1.5px solid', fontSize: '12.5px', cursor: 'pointer',
            fontWeight: statusF === f ? 600 : 400,
            borderColor: statusF === f ? '#1a1a1a' : '#e2e8f0',
            background: statusF === f ? '#1a1a1a' : '#fff',
            color: statusF === f ? '#fff' : '#475569',
          }}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
        ))}
        <div style={{ width: '1px', background: '#e2e8f0', margin: '0 4px' }} />
        {(['all', 'critical', 'warning'] as const).map(s => (
          <button key={s} onClick={() => setSevF(s)} style={{
            padding: '6px 14px', borderRadius: '20px', border: '1.5px solid', fontSize: '12.5px', cursor: 'pointer',
            fontWeight: sevF === s ? 600 : 400,
            borderColor: sevF === s ? (s === 'critical' ? '#dc2626' : s === 'warning' ? '#d97706' : '#1a1a1a') : '#e2e8f0',
            background: sevF === s ? (s === 'critical' ? '#fee2e2' : s === 'warning' ? '#fef3c7' : '#1a1a1a') : '#fff',
            color: sevF === s ? (s === 'critical' ? '#dc2626' : s === 'warning' ? '#d97706' : '#fff') : '#475569',
          }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      {/* Issues list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '14px', border: '2px dashed #e2e8f0' }}>
            No issues match your filters 🎉
          </div>
        )}

        {filtered.map(issue => {
          const sc = sevCfg[issue.severity]
          const st = stCfg[issue.status]
          const isOpen = expanded === issue.id
          const nextStatuses = STATUS_FLOW[issue.status]

          return (
            <div key={issue.id} style={{
              background: '#fff',
              border: `1.5px solid ${isOpen ? '#6366f1' : issue.status === 'resolved' ? '#d1fae5' : sc.border}`,
              borderRadius: '14px', overflow: 'hidden',
              boxShadow: isOpen ? '0 8px 30px rgba(99,102,241,0.14)' : '0 1px 3px rgba(0,0,0,0.05)',
              transition: 'all 0.2s',
            }}>

              {/* ── Summary row ── */}
              <div
                onClick={() => setExpanded(isOpen ? null : issue.id)}
                style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}
              >
                {/* Severity bar */}
                <div style={{ width: '4px', alignSelf: 'stretch', background: sc.barColor, borderRadius: '2px', flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700 }}>{issue.id}</span>
                    <span style={{ background: sc.bg, color: sc.color, padding: '2px 9px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700 }}>{sc.label}</span>
                    <span style={{ background: st.bg, color: st.color, padding: '2px 9px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700 }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a1a1a', marginBottom: '5px' }}>{issue.title}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <code style={{ background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', color: '#475569' }}>{issue.dataset}</code>
                    <span>· Rule: <em>{issue.rule}</em></span>
                    {issue.count > 0
                      ? <span style={{ color: sc.color, fontWeight: 600 }}>· {issue.count.toLocaleString('en-US')} records affected</span>
                      : <span style={{ color: '#16a34a', fontWeight: 600 }}>· all records clean</span>}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 500 }}>{issue.owner}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Opened {issue.opened}</div>
                </div>

                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: isOpen ? '#6366f1' : '#f1f5f9',
                  color: isOpen ? '#fff' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', flexShrink: 0, transition: 'all 0.2s',
                }}>
                  {isOpen ? '▲' : '▼'}
                </div>
              </div>

              {/* ── Expanded detail panel ── */}
              {isOpen && (
                <div style={{ borderTop: '2px solid #f1f5f9', background: '#f8fafd' }}>

                  {/* Metadata bar */}
                  <div style={{
                    display: 'flex', gap: '0', borderBottom: '1px solid #e9eef5',
                    background: '#fff',
                  }}>
                    {[
                      { icon: '🗂', label: 'Dataset',  value: issue.dataset },
                      { icon: '📏', label: 'Rule',      value: issue.rule },
                      { icon: '👤', label: 'Owner',     value: issue.owner },
                      { icon: '📅', label: 'Opened',    value: issue.opened },
                      { icon: '⚠️', label: 'Records',   value: issue.count > 0 ? issue.count.toLocaleString('en-US') + ' affected' : 'All clean' },
                    ].map((m, i) => (
                      <div key={i} style={{
                        flex: 1, padding: '10px 16px',
                        borderRight: i < 4 ? '1px solid #f1f5f9' : 'none',
                      }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>
                          {m.icon} {m.label}
                        </div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* Root Cause */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e0e7ff', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #eef2ff, #f5f3ff)', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>🔍</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Root Cause — Why did this happen?</span>
                      </div>
                      <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>
                        {issue.rootCause}
                      </div>
                    </div>

                    {/* Business Impact */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${sc.border}`, overflow: 'hidden' }}>
                      <div style={{ background: sc.bg, padding: '10px 16px', borderBottom: `1px solid ${sc.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>💥</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: sc.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Business Impact — What is broken?</span>
                      </div>
                      <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>
                        {issue.impact}
                      </div>
                    </div>

                    {/* Recommended Fix */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #bbf7d0', overflow: 'hidden' }}>
                      <div style={{ background: '#f0fdf4', padding: '10px 16px', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>✅</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Recommended Fix — What to do next</span>
                      </div>
                      <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>
                        {issue.recommendation}
                      </div>
                    </div>

                    {/* Affected columns + Activity side by side */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

                      {/* Affected columns */}
                      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9eef5', padding: '14px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>📋</span> Affected Columns
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {issue.affectedColumns.map(c => (
                            <code key={c} style={{ background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid #e2e8f0' }}>{c}</code>
                          ))}
                        </div>
                      </div>

                      {/* Activity timeline */}
                      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9eef5', padding: '14px 16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🕐</span> Activity Timeline
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '140px', overflowY: 'auto' }}>
                          {[...issue.activity].reverse().map((a, i) => {
                            const initials = avatarInitial(a.by)
                            const avatarColor = avatarColors[a.by] || '#94a3b8'
                            return (
                              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <div style={{
                                  width: '24px', height: '24px', borderRadius: '50%',
                                  background: avatarColor, color: '#fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '9px', fontWeight: 700, flexShrink: 0,
                                }}>{initials}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>{a.by}</span>
                                    <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>{a.time}</span>
                                  </div>
                                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '1px' }}>{a.action}</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Move to:</span>
                      {nextStatuses.map(ns => (
                        <button key={ns} onClick={e => { e.stopPropagation(); changeStatus(issue.id, ns) }} style={{
                          padding: '7px 16px', borderRadius: '8px',
                          border: `1.5px solid ${stCfg[ns].color}`,
                          background: stCfg[ns].bg, color: stCfg[ns].color,
                          fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                        }}>→ {stCfg[ns].label}</button>
                      ))}
                      <div style={{ flex: 1 }} />
                      <button onClick={e => { e.stopPropagation(); openEdit(issue) }} style={{
                        padding: '7px 16px', borderRadius: '8px',
                        border: '1.5px solid #6366f1', background: '#f5f3ff',
                        color: '#6366f1', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                      }}>✏️ Edit Issue</button>
                      <button onClick={e => { e.stopPropagation(); setExpanded(null) }} style={{
                        padding: '7px 14px', borderRadius: '8px',
                        border: '1.5px solid #e2e8f0', background: '#fff',
                        color: '#64748b', fontSize: '12.5px', cursor: 'pointer',
                      }}>▲ Collapse</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Edit Modal ── */}
      {editing && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }}
          onClick={() => setEditing(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: '16px', width: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>Edit Issue</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{editing.id}</div>
              </div>
              <button onClick={() => setEditing(null)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Issue Title</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Owner / Team</label>
                <input value={editForm.owner} onChange={e => setEditForm(f => ({ ...f, owner: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Severity</label>
                  <select value={editForm.severity} onChange={e => setEditForm(f => ({ ...f, severity: e.target.value as Severity }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9' }}>
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>Status</label>
                  <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Status }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9' }}>
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
                <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveEdit} style={{ flex: 2, padding: '10px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
