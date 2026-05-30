'use client'
import { useState } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

type RunStatus = 'passed' | 'failed' | 'warning'
type StatFilter = 'all' | 'passed' | 'failed' | 'warning'

interface ExecLog {
  id: string
  rule: string
  dataset: string
  connection: string
  status: RunStatus
  score: number
  checked: number
  failed: number
  duration: string
  ts: string
  trigger: string
  runBy: string
  ruleType: string
  failureReason: string
  rootCause: string
  impact: string
  recommendation: string
  query: string
  errorSample: string
}

const logs: ExecLog[] = [
  {
    id: 'l1', rule: 'Orders NOT NULL Check', dataset: 'fact_orders', connection: 'SF_Codex',
    status: 'passed', score: 100, checked: 4200000, failed: 0, duration: '12s',
    ts: '2026-05-05 17:00:01', trigger: 'Scheduled', runBy: 'scheduler', ruleType: 'Not Null',
    failureReason: 'N/A — all records passed.',
    rootCause: 'All 4,200,000 order records have non-null values in the checked columns (order_id, customer_id, order_date, status). The ETL pipeline ran cleanly at the scheduled time with no source data gaps.',
    impact: 'No impact — this is a healthy run.',
    recommendation: 'No action required. Continue monitoring on the current schedule.',
    query: 'SELECT COUNT(*) FROM fact_orders WHERE order_id IS NULL OR customer_id IS NULL OR order_date IS NULL',
    errorSample: 'None',
  },
  {
    id: 'l2', rule: 'Revenue > 0 Validity', dataset: 'fact_orders', connection: 'SF_Codex',
    status: 'passed', score: 99.8, checked: 4200000, failed: 8400, duration: '18s',
    ts: '2026-05-05 17:00:13', trigger: 'Scheduled', runBy: 'scheduler', ruleType: 'Range Check',
    failureReason: '8,400 records (0.2%) have revenue ≤ 0. These are refunds and adjustments with negative amounts that are expected.',
    rootCause: 'The rule checks revenue > 0 across all order types. Refund orders and promotional adjustments legitimately carry negative or zero revenue values. These 8,400 records are correctly classified as refunds in the "order_type" column.',
    impact: 'Minimal — the 0.2% failure rate is within acceptable bounds for refund records. Revenue aggregations are not affected because refunds are excluded in reporting views.',
    recommendation: 'Update the rule to add an exception: `WHERE order_type NOT IN (\'refund\', \'adjustment\')`. This will bring the pass rate to 100% while still catching genuinely invalid zero-revenue transactions.',
    query: 'SELECT COUNT(*) FROM fact_orders WHERE revenue <= 0',
    errorSample: 'order_id: ORD-8821934, revenue: -49.99, order_type: refund\norder_id: ORD-8821901, revenue: 0.00, order_type: adjustment',
  },
  {
    id: 'l3', rule: 'Customer Email Format', dataset: 'dim_customers', connection: 'SF_Codex',
    status: 'failed', score: 80, checked: 1100000, failed: 220000, duration: '9s',
    ts: '2026-05-05 12:00:05', trigger: 'Scheduled', runBy: 'scheduler', ruleType: 'Regex Pattern',
    failureReason: '220,000 records (20%) have email values that do not match the standard RFC-5322 email format regex.',
    rootCause: 'A HubSpot CRM connector upgrade (v2 → v3) changed the field mapping for the "email" property. In the new API version, contacts updated after 2026-05-04 00:00 UTC have their email field path changed from "properties.email.value" to "properties.email". The connector wrote NULL for these contacts, and the format check is also failing because NULLs do not match the email regex.',
    impact: 'Marketing campaign targeting is broken for 220,000 customers. Email automation workflows (Marketo, transactional emails) will silently skip these customers. The next campaign send is scheduled for 2026-05-06, giving a narrow window to fix this before significant revenue impact.',
    recommendation: '1. Update HubSpot connector field mapping: change "properties.email.value" → "properties.email". 2. Re-sync affected contacts (updated_at >= 2026-05-04). 3. Re-run this quality check to validate. 4. Add a null rate alert (<5%) specifically for PII fields like email and phone.',
    query: "SELECT COUNT(*) FROM dim_customers WHERE email NOT REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'",
    errorSample: 'customer_id: CUST-110293, email: NULL (updated 2026-05-04)\ncustomer_id: CUST-110441, email: NULL (updated 2026-05-04)\ncustomer_id: CUST-110558, email: "john.doe" (missing domain)',
  },
  {
    id: 'l4', rule: 'Payment Null Check', dataset: 'fact_payments', connection: 'SF_Codex',
    status: 'failed', score: 61, checked: 3800000, failed: 1482000, duration: '1m 2s',
    ts: '2026-05-05 05:30:10', trigger: 'Scheduled', runBy: 'scheduler', ruleType: 'Not Null',
    failureReason: '1,482,000 records (39%) have NULL values in critical payment columns: amount_usd, currency_code, or transaction_status.',
    rootCause: 'The Stripe ETL job (stripe_etl_v3) failed mid-batch at 04:47 UTC due to a Stripe API rate-limit error. The partial batch was committed to the warehouse with 1.48M rows missing core payment fields. The ETL job does not have a rollback mechanism — it writes rows in micro-batches and partial commits survive job failure.',
    impact: 'Critical: Revenue reporting dashboards show understated totals by approximately $2.1M. The AR team\'s daily close process is blocked. Downstream dbt models (rpt_revenue_daily, fct_mrr) are producing incorrect output used in investor reporting. The CFO dashboard is showing incorrect figures.',
    recommendation: '1. Immediately pause downstream dbt models: rpt_revenue_daily, fct_mrr. 2. Delete the partial batch: DELETE FROM fact_payments WHERE batch_id = \'stripe_2026_05_05_0447\'. 3. Re-trigger the Stripe ETL job for the 04:00–05:30 UTC window. 4. Add exponential backoff + retry logic to the ETL for rate-limit errors. 5. Implement rollback on partial batch failure.',
    query: 'SELECT COUNT(*) FROM fact_payments WHERE amount_usd IS NULL OR currency_code IS NULL OR transaction_status IS NULL',
    errorSample: 'payment_id: PAY-9928110, amount_usd: NULL, currency_code: NULL, transaction_status: NULL\npayment_id: PAY-9928111, amount_usd: NULL, currency_code: "USD", transaction_status: NULL',
  },
  {
    id: 'l5', rule: 'Inventory Stock ≥ 0', dataset: 'fact_inventory', connection: 'SF_Codex',
    status: 'passed', score: 100, checked: 820000, failed: 0, duration: '7s',
    ts: '2026-05-05 16:00:03', trigger: 'Scheduled', runBy: 'scheduler', ruleType: 'Range Check',
    failureReason: 'N/A — all records passed.',
    rootCause: 'All 820,000 inventory records have non-negative stock quantities. The inventory sync ran cleanly at 16:00 UTC.',
    impact: 'No impact — healthy run.',
    recommendation: 'No action required.',
    query: 'SELECT COUNT(*) FROM fact_inventory WHERE stock_quantity < 0',
    errorSample: 'None',
  },
  {
    id: 'l6', rule: 'Orders Volume Anomaly', dataset: 'fact_orders', connection: 'SF_Codex',
    status: 'failed', score: 0, checked: 1, failed: 1, duration: '3s',
    ts: '2026-05-05 14:22:00', trigger: 'Anomaly Detector', runBy: 'system', ruleType: 'Volume Anomaly',
    failureReason: 'Row count of 2,120,000 (new batch) is 341% above the 7-day baseline of 620,000 rows.',
    rootCause: 'A data backfill job was triggered manually by a Data Engineer to recover 3 months of missing order history from a legacy system migration. The backfill inserted 2.1M historical records into fact_orders in a single batch. The anomaly detector does not distinguish between regular loads and planned backfills, so it flagged the volume spike.',
    impact: 'This is a controlled, intentional backfill — not a data quality issue. However, without proper handling, downstream aggregation models will show inflated metrics for the backfill period. Historical trend charts in BI dashboards will display a misleading spike on May 5th if not annotated.',
    recommendation: '1. Acknowledge this alert — the spike is expected. 2. Coordinate with BI team to add a "backfill" annotation to trend dashboards. 3. Run incremental dbt models with the backfill date range scoped correctly to avoid double-counting. 4. Add a "planned_backfill" flag to suppress volume anomaly alerts for known operations.',
    query: 'SELECT COUNT(*) as row_count, AVG(row_count) OVER (ORDER BY run_date ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as baseline FROM fact_orders_daily_stats',
    errorSample: 'Detected row count: 2,120,000\n7-day baseline (P50): 620,000\nDeviation: +341.9% (threshold: ±50%)',
  },
  {
    id: 'l7', rule: 'Session Duration Check', dataset: 'web_sessions', connection: 'SF_Codex',
    status: 'passed', score: 98, checked: 9500000, failed: 190000, duration: '8s',
    ts: '2026-05-05 17:00:01', trigger: 'Scheduled', runBy: 'scheduler', ruleType: 'Range Check',
    failureReason: '190,000 sessions (2%) have duration values outside the expected 1s–4h range. These are bot sessions and timed-out connections.',
    rootCause: 'Web session data includes bot traffic and network timeout events that generate sessions with 0-second or extremely long (>4 hour) durations. These are expected noise in raw clickstream data and are filtered out in the analytics layer.',
    impact: 'Low — the 2% anomaly rate is within normal tolerance for raw session data. Downstream session analytics models already apply the duration filter, so reported metrics are unaffected.',
    recommendation: 'Update the rule threshold to allow for bot-filter noise: flag only when the anomaly rate exceeds 5%. Alternatively, run this check against the cleaned sessions view rather than the raw table.',
    query: 'SELECT COUNT(*) FROM web_sessions WHERE session_duration_seconds < 1 OR session_duration_seconds > 14400',
    errorSample: 'session_id: SES-2291033, duration: 0s, user_agent: "Googlebot/2.1"\nsession_id: SES-2291089, duration: 86400s (24h timeout)',
  },
  {
    id: 'l8', rule: 'Product SKU Unique', dataset: 'dim_products', connection: 'SF_Codex',
    status: 'passed', score: 100, checked: 45000, failed: 0, duration: '2s',
    ts: '2026-05-05 14:00:01', trigger: 'Manual', runBy: 'Bhaskar R.', ruleType: 'Uniqueness',
    failureReason: 'N/A — all SKUs are unique.',
    rootCause: 'All 45,000 product SKUs are unique with no duplicates. This check was run manually after a bulk product import to verify data integrity.',
    impact: 'No impact — data integrity confirmed.',
    recommendation: 'No action required. The manual run confirms the bulk import was clean.',
    query: 'SELECT sku, COUNT(*) as cnt FROM dim_products GROUP BY sku HAVING cnt > 1',
    errorSample: 'None',
  },
  {
    id: 'l9', rule: 'Customer Consent Flag', dataset: 'dim_customers', connection: 'SF_Codex',
    status: 'warning', score: 87, checked: 1100000, failed: 143000, duration: '11s',
    ts: '2026-05-05 12:00:16', trigger: 'Scheduled', runBy: 'scheduler', ruleType: 'Completeness',
    failureReason: '143,000 customers (13%) have a NULL or missing consent_flag, which is required for GDPR compliance.',
    rootCause: 'A batch of 143,000 customers imported from the legacy CRM system during the Q1 migration were not assigned a consent_flag value. The legacy system did not have a consent tracking field, so the migration script left the field NULL rather than defaulting to a value.',
    impact: 'GDPR compliance risk: customers without a consent flag cannot be contacted for marketing and must be excluded from all campaigns. This is flagged as a warning (not failure) because the business has 30 days to remediate legacy records per legal guidance.',
    recommendation: '1. Contact the Data Governance team to define the default consent value for legacy customers. 2. Update the migration script to set consent_flag = FALSE for all legacy customers (opt-out by default). 3. Trigger a re-consent campaign for the affected 143,000 customers. 4. Add a NOT NULL constraint on consent_flag for future imports.',
    query: "SELECT COUNT(*) FROM dim_customers WHERE consent_flag IS NULL OR consent_flag NOT IN ('granted', 'denied', 'pending')",
    errorSample: 'customer_id: CUST-88201, consent_flag: NULL, source: legacy_crm_migration\ncustomer_id: CUST-88334, consent_flag: NULL, source: legacy_crm_migration',
  },
  {
    id: 'l10', rule: 'Orders Freshness Check', dataset: 'fact_orders', connection: 'SF_Codex',
    status: 'passed', score: 100, checked: 1, failed: 0, duration: '1s',
    ts: '2026-05-05 06:00:01', trigger: 'Scheduled', runBy: 'scheduler', ruleType: 'Freshness',
    failureReason: 'N/A — table was refreshed within the expected window.',
    rootCause: 'The fact_orders table was last updated at 05:58 UTC, 2 minutes before this check ran. The freshness threshold is 6 hours. All good.',
    impact: 'No impact — freshness confirmed.',
    recommendation: 'No action required.',
    query: "SELECT DATEDIFF('hour', MAX(updated_at), CURRENT_TIMESTAMP) as lag_hours FROM fact_orders",
    errorSample: 'None',
  },
]

const STAT: Record<RunStatus, { bg: string; color: string; border: string }> = {
  passed:  { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  failed:  { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  warning: { bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
}

export default function ExecutionLogsPage() {
  const [statusFilter, setStatusFilter] = useState<StatFilter>('all')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const totalRuns = logs.length
  const passed = logs.filter(l => l.status === 'passed').length
  const failed = logs.filter(l => l.status === 'failed').length
  const warnings = logs.filter(l => l.status === 'warning').length
  const avgScore = Math.round(logs.reduce((a, l) => a + l.score, 0) / logs.length)

  const filtered = logs.filter(l =>
    (statusFilter === 'all' || l.status === statusFilter) &&
    (search === '' || l.rule.toLowerCase().includes(search.toLowerCase()) || l.dataset.toLowerCase().includes(search.toLowerCase()))
  )

  const statCards = [
    { label: 'Total Runs (24h)', value: totalRuns, icon: '🔄', color: '#2563eb', filter: 'all' as StatFilter },
    { label: 'Passed',           value: passed,    icon: '✅', color: '#16a34a', filter: 'passed' as StatFilter },
    { label: 'Failed',           value: failed,    icon: '❌', color: '#dc2626', filter: 'failed' as StatFilter },
    { label: 'Warnings',         value: warnings,  icon: '⚠️', color: '#ca8a04', filter: 'warning' as StatFilter },
    { label: 'Avg Score',        value: avgScore + '%', icon: '📊', color: '#7c3aed', filter: null },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1400px' }}>
      <PageTabBar tabs={[
        { href: '/schedules',      label: 'Schedules' },
        { href: '/execution-logs', label: 'Execution Logs' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>
        Workspace · <span style={{ color: '#475569' }}>Analytics platform</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Execution Logs</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>
            Full history of every quality check run · {logs.length} runs today
          </p>
        </div>
        <button style={{
          background: '#fff', border: '1px solid #e2e8f0', padding: '8px 14px',
          borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: '#475569', cursor: 'pointer'
        }}>⬇ Export CSV</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map(s => {
          const isActive = s.filter !== null && statusFilter === s.filter
          return (
            <div
              key={s.label}
              onClick={() => s.filter !== null && setStatusFilter(prev => prev === s.filter ? 'all' : s.filter!)}
              style={{
                background: isActive ? s.color : '#fff',
                border: `1px solid ${isActive ? s.color : '#ebe8df'}`,
                borderRadius: '12px', padding: '16px 20px',
                cursor: s.filter !== null ? 'pointer' : 'default',
                transition: 'all 0.18s',
                boxShadow: isActive ? `0 4px 16px ${s.color}33` : 'none',
              }}
            >
              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{s.icon}</div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: isActive ? '#fff' : s.color }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.85)' : '#64748b', marginTop: '2px' }}>{s.label}</div>
              {isActive && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '4px', fontWeight: 500 }}>▼ filtered</div>}
            </div>
          )
        })}
      </div>

      {/* Search + filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by rule or dataset…"
          style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#0f172a', outline: 'none' }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatFilter)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fafaf9', color: '#475569' }}
        >
          <option value="all">All Statuses</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="warning">Warning</option>
        </select>
      </div>

      {/* Log rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #ebe8df' }}>
            No logs match your filters.
          </div>
        )}

        {filtered.map(l => {
          const ss = STAT[l.status]
          const scoreColor = l.score >= 95 ? '#16a34a' : l.score >= 80 ? '#ca8a04' : '#dc2626'
          const isExpanded = expanded === l.id

          return (
            <div
              key={l.id}
              onClick={() => setExpanded(isExpanded ? null : l.id)}
              style={{
                background: '#fff',
                border: `1px solid ${l.status === 'failed' ? '#fca5a5' : l.status === 'warning' ? '#fde68a' : '#ebe8df'}`,
                borderLeft: `3px solid ${ss.color}`,
                borderRadius: '12px', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {/* Row summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px 100px 90px 70px 110px 100px 120px 130px auto', gap: '0', alignItems: 'center', padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{l.ts}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#1a1a1a' }}>{l.rule}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{l.ruleType}</div>
                </div>
                <div style={{ fontSize: '12.5px', color: '#475569' }}>{l.dataset}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{l.connection}</div>
                <div>
                  <span style={{ background: ss.bg, color: ss.color, padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>
                    {l.status}
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: scoreColor, fontSize: '13px' }}>{l.score}%</div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{l.checked.toLocaleString('en-US')}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, fontFamily: 'monospace', color: l.failed > 0 ? '#dc2626' : '#16a34a' }}>
                  {l.failed.toLocaleString('en-US')}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>{l.duration}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{l.trigger} · <span style={{ color: '#475569' }}>{l.runBy}</span></div>
                <span style={{ color: '#94a3b8', fontSize: '14px', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', justifySelf: 'end' }}>▾</span>
              </div>

              {/* Column headers (shown inside row to align with values) */}
              {!isExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 130px 100px 90px 70px 110px 100px 120px 130px auto', gap: '0', padding: '0 16px 8px', borderTop: '1px solid #f8fafc' }}>
                  {['Timestamp','Rule','Dataset','Connection','Status','Score','Checked','Failed','Duration','Trigger / Run By',''].map((h, i) => (
                    <div key={i} style={{ fontSize: '10px', color: '#cbd5e1', fontWeight: 600, letterSpacing: '0.04em' }}>{h}</div>
                  ))}
                </div>
              )}

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #f1f5f9' }} onClick={e => e.stopPropagation()}>
                  {/* Metadata bar */}
                  <div style={{ display: 'flex', background: '#fafaf9', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                    {[
                      { label: 'Rule Type',       value: l.ruleType },
                      { label: 'Checked Records', value: l.checked.toLocaleString('en-US') },
                      { label: 'Failed Records',  value: l.failed.toLocaleString('en-US') },
                      { label: 'Duration',        value: l.duration },
                      { label: 'Trigger',         value: l.trigger },
                      { label: 'Run By',          value: l.runBy },
                    ].map((m, i, arr) => (
                      <div key={i} style={{
                        flex: 1, minWidth: '120px', padding: '10px 16px',
                        borderRight: i < arr.length - 1 ? '1px solid #f1f5f9' : 'none'
                      }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', marginTop: '2px' }}>{m.value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Failure reason (shown when not passed) */}
                    {l.status !== 'passed' && (
                      <div style={{ background: ss.bg, border: `1px solid ${ss.border}`, borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: ss.color, fontWeight: 500 }}>
                        ⚡ <strong>Failure Reason:</strong> {l.failureReason}
                      </div>
                    )}

                    {/* Root Cause */}
                    <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e9d5ff' }}>
                      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: '10px 16px' }}>
                        <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>🔍 ROOT CAUSE</span>
                      </div>
                      <div style={{ padding: '14px 16px', background: '#faf5ff', fontSize: '13px', color: '#3b1f6e', lineHeight: '1.65' }}>
                        {l.rootCause}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {/* Business Impact */}
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: `1px solid ${ss.border}` }}>
                        <div style={{ background: l.status === 'failed' ? '#dc2626' : l.status === 'warning' ? '#ca8a04' : '#16a34a', padding: '10px 16px' }}>
                          <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>⚠️ BUSINESS IMPACT</span>
                        </div>
                        <div style={{ padding: '14px 16px', background: ss.bg, fontSize: '13px', color: '#334155', lineHeight: '1.65' }}>
                          {l.impact}
                        </div>
                      </div>

                      {/* Recommended Fix */}
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #bbf7d0' }}>
                        <div style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', padding: '10px 16px' }}>
                          <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>✅ RECOMMENDED FIX</span>
                        </div>
                        <div style={{ padding: '14px 16px', background: '#f0fdf4', fontSize: '13px', color: '#14532d', lineHeight: '1.65' }}>
                          {l.recommendation}
                        </div>
                      </div>
                    </div>

                    {/* SQL Query + Error Sample */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                        <div style={{ background: '#1e293b', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>⌗ RULE QUERY</span>
                        </div>
                        <div style={{ padding: '12px 16px', background: '#0f172a', fontFamily: 'monospace', fontSize: '11.5px', color: '#7dd3fc', lineHeight: '1.6', whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                          {l.query}
                        </div>
                      </div>
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                        <div style={{ background: '#334155', padding: '10px 16px' }}>
                          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>📋 ERROR SAMPLE</span>
                        </div>
                        <div style={{ padding: '12px 16px', background: '#1e293b', fontFamily: 'monospace', fontSize: '11.5px', color: '#fca5a5', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                          {l.errorSample}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
