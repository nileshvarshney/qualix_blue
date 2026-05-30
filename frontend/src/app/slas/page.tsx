'use client'
import { useState } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

type SLAStatus = 'healthy' | 'at-risk' | 'breached'
type FilterType = 'all' | 'healthy' | 'at-risk' | 'breached'

interface SLA {
  id: string; name: string; dataset: string; type: string
  target: string; current: string; adherence: number
  status: SLAStatus; owner: string; connection: string
  domain: string; breaches: number; trend: number[]
  rootCause: string; impact: string; recommendation: string
  affectedPipelines: string[]
  lastBreachDate?: string
  nextReview: string
}

const slas: SLA[] = [
  {
    id: 's1', name: 'Orders Freshness', dataset: 'fact_orders',
    type: 'Freshness', target: '< 4h delay', current: '1.2h',
    adherence: 99, status: 'healthy', owner: 'Bhaskar R.',
    connection: 'SF_Codex', domain: 'Finance', breaches: 0,
    trend: [99, 100, 99, 100, 100, 99, 99],
    nextReview: '2026-06-01',
    rootCause: 'No issues. The Orders pipeline runs on schedule — daily ETL completes within 1.2h on average, well below the 4h target. The pipeline has been stable for 30+ days.',
    impact: 'All downstream revenue models and Finance dashboards are receiving fresh data within SLA. No business impact.',
    recommendation: 'No action needed. Continue monitoring. Consider tightening the SLA to < 2h to improve data freshness for real-time use cases.',
    affectedPipelines: ['revenue_by_channel', 'finance_daily_report', 'orders_summary'],
  },
  {
    id: 's2', name: 'Customer Data Quality', dataset: 'dim_customers',
    type: 'Quality Score', target: '≥ 90%', current: '81%',
    adherence: 72, status: 'breached', owner: 'Priya M.',
    connection: 'SF_Codex', domain: 'Marketing', breaches: 3,
    trend: [95, 93, 90, 87, 83, 81, 81],
    lastBreachDate: '2026-05-05', nextReview: '2026-05-10',
    rootCause: 'A CRM batch import on 2026-05-05 loaded 363,000 records from a third-party lead-gen vendor without email validation or consent flag assignment. 220,000 records have malformed emails (missing "@" or TLD) and 143,000 have NULL consent_flag values. The import script bypassed the standard validation pipeline. Quality score has been declining for 7 days and breached the 90% SLA target on 2026-05-03.',
    impact: 'Marketing CDP exports are degraded — 363K customers cannot be contacted via email campaigns, representing an estimated $480K/month in missed re-engagement revenue. GDPR compliance is at risk for the 143K NULL consent_flag records. The breach has been flagged by Legal. Marketing attribution is broken for these users as they cannot be matched to GA4 session data.',
    recommendation: 'Quarantine the 363K affected records into dim_customers_review. Re-request corrected email + consent data from the vendor (SLA: 48h). Add mandatory email regex validation and consent_flag default to the CRM import pipeline. Re-validate after fix — target: restore quality score to ≥ 92% within 5 business days.',
    affectedPipelines: ['marketing_email_list', 'ga4_attribution', 'customer_segments', 'gdpr_consent_report', 'marketing_cdp_sync'],
  },
  {
    id: 's3', name: 'Payment Reconciliation', dataset: 'fact_payments',
    type: 'Accuracy', target: '< 0.01% variance', current: '0.04%',
    adherence: 61, status: 'breached', owner: 'Bhaskar R.',
    connection: 'SF_Codex', domain: 'Finance', breaches: 5,
    trend: [98, 97, 85, 75, 65, 62, 61],
    lastBreachDate: '2026-05-04', nextReview: '2026-05-08',
    rootCause: 'The payment processor API was upgraded to v3 on 2026-05-04. The new API returns empty strings (not 0.00) for declined transactions, which the ETL casts as NULL instead of zero. 1,482,000 rows (39%) now have NULL payment_amount_usd. Additionally, the schema migration (PR #3892) dropped the amount_usd column without updating 7 downstream reconciliation models, breaking the accuracy check entirely. Adherence has dropped 37 percentage points in 7 days — the fastest decline in this SLA\'s history.',
    impact: 'Finance reconciliation with bank statements is completely blocked. The weekly Finance report cannot be generated. $2.1M in payment data is unaccountable. This SLA is at 61% — 38.9 points below the 99.9% target. P0 incident declared. Month-end close is at risk. The Audit team has been notified.',
    recommendation: 'URGENT (P0): (1) Deploy hotfix for payment_amount_usd NULL handling in the ETL (branch fix/payment-v3-null). (2) Restore the amount_usd column alias in fact_payments with a virtual generated column. (3) Reprocess the affected batch for 2026-05-04 to 2026-05-05. (4) Run a full reconciliation validation before signing off. Target: restore to > 95% accuracy within 4 hours.',
    affectedPipelines: ['finance_weekly_report', 'payment_reconciliation', 'bank_recon_v2', 'fraud_detection', 'settlements_report'],
  },
  {
    id: 's4', name: 'Inventory Refresh Rate', dataset: 'fact_inventory',
    type: 'Freshness', target: '< 6h delay', current: '5.4h',
    adherence: 91, status: 'at-risk', owner: 'Rajan S.',
    connection: 'SF_Codex', domain: 'Supply Chain', breaches: 1,
    trend: [98, 97, 96, 94, 93, 92, 91],
    lastBreachDate: '2026-05-03', nextReview: '2026-05-09',
    rootCause: 'The inventory snapshot job has been gradually slowing over 7 days. At 5.4h it is 90% of the 6h SLA limit. Root cause: the fact_inventory table has grown 28% in the last 30 days (new warehouse zones added) but the Airflow DAG parallelism has not been updated. The job now processes 820K rows on a 4-worker cluster originally configured for 600K rows. One 2h breach occurred on 2026-05-03 when a worker node failed mid-job.',
    impact: 'At current trajectory (declining ~1% per day), this SLA will breach in 3–5 days without intervention. The SCM API v2 consumer may receive stale inventory data, causing incorrect reorder decisions. Current risk: $0 direct impact but a breach would affect supply chain confidence.',
    recommendation: 'Scale the Airflow worker cluster from 4 to 6 nodes to handle the increased table size. Partition the job by warehouse_zone to improve parallelism. Add a circuit-breaker alert at 4.5h (75% of SLA limit) for early warning. Review cluster sizing monthly as the table continues to grow.',
    affectedPipelines: ['inventory_kpis', 'scm_api_v2', 'reorder_recommendations', 'supply_chain_dashboard'],
  },
  {
    id: 's5', name: 'Web Sessions Completeness', dataset: 'web_sessions',
    type: 'Completeness', target: '≥ 99% non-null', current: '99.4%',
    adherence: 100, status: 'healthy', owner: 'Priya M.',
    connection: 'SF_Codex', domain: 'Marketing', breaches: 0,
    trend: [100, 100, 100, 99, 100, 100, 100],
    nextReview: '2026-06-01',
    rootCause: 'No issues. Web sessions completeness is at 99.4% — above the 99% target. The 0.6% non-null rate comes from bot sessions and direct-type traffic where utm fields are intentionally absent — exempt under the contract.',
    impact: 'All attribution model inputs are complete. No business impact.',
    recommendation: 'No action needed. The bot-session exemption should be formally documented in the SLA definition. Consider adding a separate completeness check for utm_source on paid sessions specifically.',
    affectedPipelines: ['attribution_model', 'session_kpis', 'engagement_dashboard'],
  },
  {
    id: 's6', name: 'Product Catalog Validity', dataset: 'dim_products',
    type: 'Validity', target: '≥ 95% valid SKUs', current: '98.1%',
    adherence: 100, status: 'healthy', owner: 'Anil K.',
    connection: 'SF_Codex', domain: 'Catalog', breaches: 0,
    trend: [100, 100, 100, 100, 99, 100, 100],
    nextReview: '2026-06-15',
    rootCause: 'No issues. 98.1% of product SKUs are valid — comfortably above the 95% target. The 1.9% invalid rate comes from seasonal products being temporarily deactivated, which is expected behavior.',
    impact: 'Product catalog is healthy. No impact on downstream pricing engine or order valuation.',
    recommendation: 'No action needed. Consider splitting the SLA into active SKUs and archived SKUs to get a cleaner signal, since archived SKUs inflate the "invalid" count by design.',
    affectedPipelines: ['pricing_engine', 'order_valuation', 'product_catalog_api'],
  },
]

const statStyle: Record<SLAStatus, { bg: string; color: string; dot: string; border: string; activeBg: string }> = {
  healthy:  { bg: '#f0fdf4', color: '#16a34a', dot: '#16a34a', border: '#bbf7d0', activeBg: '#16a34a' },
  'at-risk':{ bg: '#fff7ed', color: '#ea580c', dot: '#ea580c', border: '#fdba74', activeBg: '#ea580c' },
  breached: { bg: '#fee2e2', color: '#dc2626', dot: '#dc2626', border: '#fca5a5', activeBg: '#dc2626' },
}

function MiniTrend({ data, color }: { data: number[]; color: string }) {
  const max = 100, min = Math.min(...data) - 2
  const w = 80, h = 28
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`)
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SLAsPage() {
  const [filter, setFilter]     = useState<FilterType>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [allSlas, setAllSlas] = useState(slas)
  const [showAdd, setShowAdd] = useState(false)
  const [sForm, setSForm] = useState({ name: '', dataset: '', type: 'Freshness', target: '', owner: '', domain: 'Finance', connection: 'SF_Codex' })

  const addSla = () => {
    if (!sForm.name) return
    const ns: SLA = {
      id: `s${Date.now()}`, name: sForm.name, dataset: sForm.dataset,
      type: sForm.type, target: sForm.target, current: 'Pending',
      adherence: 100, status: 'healthy', owner: sForm.owner || 'Unassigned',
      connection: sForm.connection, domain: sForm.domain, breaches: 0,
      trend: [100, 100, 100, 100, 100, 100, 100],
      rootCause: 'No issues yet — newly created SLA.',
      impact: 'No impact — monitoring has not started.',
      recommendation: 'Configure monitoring and set up alerting thresholds.',
      affectedPipelines: [], nextReview: '2026-06-15',
    }
    setAllSlas(prev => [ns, ...prev])
    setShowAdd(false)
    setSForm({ name: '', dataset: '', type: 'Freshness', target: '', owner: '', domain: 'Finance', connection: 'SF_Codex' })
  }

  const overall  = Math.round(allSlas.reduce((acc, s) => acc + s.adherence, 0) / allSlas.length)
  const healthy  = allSlas.filter(s => s.status === 'healthy').length
  const atRisk   = allSlas.filter(s => s.status === 'at-risk').length
  const breached = allSlas.filter(s => s.status === 'breached').length

  const filtered = allSlas.filter(s => filter === 'all' || s.status === filter)

  const statCards = [
    { key: 'all'      as FilterType, label: 'Overall Adherence', value: overall + '%', icon: '📊', color: overall >= 90 ? '#16a34a' : '#ea580c', activeBg: '#475569' },
    { key: 'healthy'  as FilterType, label: 'Healthy',           value: healthy,        icon: '✅', color: '#16a34a',  activeBg: '#16a34a'  },
    { key: 'at-risk'  as FilterType, label: 'At Risk',           value: atRisk,         icon: '⚠️', color: '#ea580c',  activeBg: '#ea580c'  },
    { key: 'breached' as FilterType, label: 'Breached',          value: breached,       icon: '🚨', color: '#dc2626',  activeBg: '#dc2626'  },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <PageTabBar tabs={[
        { href: '/contracts', label: 'Contracts' },
        { href: '/slas',      label: 'SLAs' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>SLA Management</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Track service-level agreements across all data assets — {overall}% overall adherence
            {breached > 0 && <span style={{ color: '#dc2626', fontWeight: 600 }}> · {breached} SLA{breached > 1 ? 's' : ''} breached</span>}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: '#E8541A', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#fff', cursor: 'pointer' }}>
          + New SLA
        </button>
      </div>

      {/* Clickable stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map((card, idx) => {
          const isActive = filter === card.key && idx !== 0
          return (
            <div key={card.key + idx}
              onClick={() => idx === 0 ? undefined : setFilter(isActive ? 'all' : card.key)}
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
              {isActive && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', marginTop: '3px' }}>Click to clear filter</div>}
            </div>
          )
        })}
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

      {/* SLA list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.map(s => {
          const ss = statStyle[s.status]
          const adColor = s.adherence >= 95 ? '#16a34a' : s.adherence >= 80 ? '#ca8a04' : '#dc2626'
          const isOpen  = expanded === s.id

          return (
            <div key={s.id} style={{
              background: '#fff',
              border: `1.5px solid ${isOpen ? '#6366f1' : s.status === 'breached' ? '#fca5a5' : s.status === 'at-risk' ? '#fdba74' : '#e2e8f0'}`,
              borderRadius: '14px', overflow: 'hidden',
              boxShadow: isOpen ? '0 6px 24px rgba(99,102,241,0.13)' : s.status === 'breached' ? '0 2px 8px rgba(220,38,38,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'all 0.2s',
            }}>

              {/* Summary row */}
              <div onClick={() => setExpanded(isOpen ? null : s.id)}
                style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', userSelect: 'none' }}>

                {/* Status bar */}
                <div style={{ width: '4px', alignSelf: 'stretch', background: ss.dot, borderRadius: '2px', flexShrink: 0 }} />

                {/* Name + dataset */}
                <div style={{ minWidth: '180px', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#1a1a1a' }}>{s.name}</div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>{s.dataset} · {s.domain}</div>
                </div>

                {/* Type */}
                <div style={{ minWidth: '100px', flexShrink: 0, color: '#64748b', fontSize: '12px' }}>{s.type}</div>

                {/* Target */}
                <div style={{ minWidth: '110px', flexShrink: 0, fontFamily: 'monospace', fontSize: '12px', color: '#475569' }}>{s.target}</div>

                {/* Current */}
                <div style={{ minWidth: '60px', flexShrink: 0, fontWeight: 700, fontFamily: 'monospace', fontSize: '12.5px', color: adColor }}>{s.current}</div>

                {/* Adherence bar */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: '120px' }}>
                  <div style={{ flex: 1, height: '5px', background: '#f1f5f9', borderRadius: '3px' }}>
                    <div style={{ height: '100%', width: `${s.adherence}%`, background: adColor, borderRadius: '3px', transition: 'width 0.4s' }} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: adColor, minWidth: '38px' }}>{s.adherence}%</span>
                </div>

                {/* Mini trend */}
                <div style={{ flexShrink: 0 }}><MiniTrend data={s.trend} color={adColor} /></div>

                {/* Breaches */}
                <div style={{ minWidth: '40px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: s.breaches > 0 ? '#dc2626' : '#16a34a', flexShrink: 0 }}>{s.breaches}</div>

                {/* Status badge */}
                <div style={{ flexShrink: 0 }}>
                  <span style={{ background: ss.bg, color: ss.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: ss.dot, display: 'inline-block' }} />
                    {s.status}
                  </span>
                </div>

                {/* Owner */}
                <div style={{ fontSize: '11.5px', color: '#94a3b8', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>{s.owner}</div>

                {/* Toggle */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
                  background: isOpen ? '#6366f1' : '#f1f5f9',
                  color: isOpen ? '#fff' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', transition: 'all 0.18s',
                }}>
                  {isOpen ? '▲' : '▼'}
                </div>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop: '2px solid #f1f5f9', background: '#f8fafd' }}>

                  {/* Metadata bar */}
                  <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #f1f5f9' }}>
                    {[
                      { label: 'Connection',   value: s.connection },
                      { label: 'Owner',        value: s.owner },
                      { label: 'Breaches (30d)', value: String(s.breaches) },
                      { label: 'Last Breach',  value: s.lastBreachDate || 'None' },
                      { label: 'Next Review',  value: s.nextReview },
                    ].map((m, i) => (
                      <div key={i} style={{ flex: 1, padding: '10px 16px', borderRight: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '3px' }}>{m.label}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: m.label === 'Breaches (30d)' && Number(m.value) > 0 ? '#dc2626' : '#334155' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                    {/* Root Cause */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e0e7ff', overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg,#eef2ff,#f5f3ff)', padding: '10px 16px', borderBottom: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>🔍</span>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Root Cause — Why is this SLA in this state?</span>
                      </div>
                      <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{s.rootCause}</div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      {/* Business Impact */}
                      <div style={{ background: '#fff', borderRadius: '12px', border: `1px solid ${ss.border}`, overflow: 'hidden' }}>
                        <div style={{ background: ss.bg, padding: '10px 16px', borderBottom: `1px solid ${ss.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>💥</span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: ss.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Business Impact</span>
                        </div>
                        <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{s.impact}</div>
                      </div>

                      {/* Recommended Fix */}
                      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #bbf7d0', overflow: 'hidden' }}>
                        <div style={{ background: '#f0fdf4', padding: '10px 16px', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px' }}>✅</span>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            {s.status === 'healthy' ? 'Observations & Optimisations' : 'Recommended Fix'}
                          </span>
                        </div>
                        <div style={{ padding: '14px 16px', fontSize: '13px', color: '#1e293b', lineHeight: '1.7' }}>{s.recommendation}</div>
                      </div>
                    </div>

                    {/* Affected pipelines */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9eef5', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                        🔗 Affected Pipelines & Models
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {s.affectedPipelines.map(p => (
                          <code key={p} style={{ background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', border: '1px solid #e2e8f0' }}>{p}</code>
                        ))}
                      </div>
                    </div>

                    {/* 7-day trend chart */}
                    <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e9eef5', padding: '14px 16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '12px' }}>
                        📈 7-Day Adherence Trend
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '48px' }}>
                        {s.trend.map((v, i) => {
                          const barColor = v >= 95 ? '#16a34a' : v >= 80 ? '#ca8a04' : '#dc2626'
                          const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                              <div style={{ fontSize: '10px', fontWeight: 600, color: barColor }}>{v}%</div>
                              <div style={{ width: '100%', background: `${barColor}25`, borderRadius: '4px', overflow: 'hidden', height: '28px', display: 'flex', alignItems: 'flex-end' }}>
                                <div style={{ width: '100%', height: `${v}%`, background: barColor, borderRadius: '4px', transition: 'height 0.4s' }} />
                              </div>
                              <div style={{ fontSize: '9px', color: '#94a3b8' }}>{days[i]}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <button onClick={() => setExpanded(null)} style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '12px', cursor: 'pointer' }}>
                        ▲ Collapse
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* New SLA Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowAdd(false)} />
          <div style={{ background: '#fff', borderRadius: '14px', width: '520px', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #ebe8df' }}>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#1a1a1a' }}>New SLA</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Define a service-level agreement for a data asset</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>SLA Name *</label>
                <input value={sForm.name} onChange={e => setSForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Orders Freshness" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Dataset *</label>
                  <input value={sForm.dataset} onChange={e => setSForm(f => ({ ...f, dataset: e.target.value }))} placeholder="e.g. fact_orders" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Type</label>
                  <select value={sForm.type} onChange={e => setSForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }}>
                    {['Freshness', 'Quality Score', 'Accuracy', 'Completeness', 'Validity', 'Volume'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Target *</label>
                <input value={sForm.target} onChange={e => setSForm(f => ({ ...f, target: e.target.value }))} placeholder="e.g. < 4h delay, ≥ 95%" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Domain</label>
                  <select value={sForm.domain} onChange={e => setSForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none' }}>
                    {['Finance', 'Marketing', 'Supply Chain', 'Sales', 'Engineering', 'Catalog'].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12.5px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Owner</label>
                  <input value={sForm.owner} onChange={e => setSForm(f => ({ ...f, owner: e.target.value }))} placeholder="Name" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #ebe8df', display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addSla} disabled={!sForm.name || !sForm.dataset || !sForm.target} style={{
                flex: 2, padding: '10px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                cursor: sForm.name && sForm.dataset && sForm.target ? 'pointer' : 'not-allowed',
                background: sForm.name && sForm.dataset && sForm.target ? '#E8541A' : '#e2e8f0',
                color: sForm.name && sForm.dataset && sForm.target ? '#fff' : '#94a3b8'
              }}>Create SLA</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
