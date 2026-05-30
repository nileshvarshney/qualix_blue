'use client'
import { useState } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

type Severity = 'critical' | 'high' | 'medium' | 'info'
type AlertFilter = 'all' | 'unacked' | 'critical' | 'high'
type RuleFilter = 'all' | 'active' | 'critical' | 'triggered'

interface RecentAlert {
  id: string
  rule: string
  dataset: string
  severity: Severity
  message: string
  channel: string
  ts: string
  ack: boolean
  rootCause: string
  impact: string
  recommendation: string
  affectedRecords: number
  pipeline: string
}

interface AlertRule {
  id: string
  name: string
  condition: string
  datasets: string
  channel: string
  severity: Severity
  enabled: boolean
  triggered: number
  lastFired: string
  description: string
  whenItFires: string
  businessContext: string
  remediation: string
  cooldown: string
  owner: string
}

const recentAlerts: RecentAlert[] = [
  {
    id: 'a1', rule: 'Critical Quality Drop', dataset: 'fact_payments',
    severity: 'critical', channel: 'Slack + Email', ts: '2026-05-05 14:22', ack: false,
    message: 'Quality score dropped to 61% — 5 rules failing',
    rootCause: 'An upstream ETL job in the Stripe payment pipeline failed mid-batch on 2026-05-05 at 13:47. Partial data was written with NULL values in "amount_usd", "currency_code", and "transaction_status" columns. This caused 5 validation rules (null checks, range validation, format check) to fail simultaneously, dragging the dataset quality score from 94% to 61%.',
    impact: 'Revenue reporting dashboards used by Finance and C-Suite are showing understated transaction totals. Approximately $2.1M in payment records cannot be reconciled. The AR team\'s daily close process is blocked. Downstream models in dbt (rpt_revenue_daily, fct_mrr) are producing incorrect output used in investor reporting.',
    recommendation: 'Re-trigger the Stripe ETL job for the 13:00–14:30 UTC window. Validate row counts match source (expected: 18,420 rows). Run the quality check suite on fact_payments after the re-run. Temporarily pause downstream dbt models until the data is clean. Alert Finance not to use the revenue dashboard until 15:30 UTC.',
    affectedRecords: 4821, pipeline: 'stripe_etl_v3'
  },
  {
    id: 'a2', rule: 'Schema Change Detected', dataset: 'fact_payments',
    severity: 'critical', channel: 'PagerDuty', ts: '2026-05-04 18:00', ack: false,
    message: 'Column "amount_usd" removed — 2 downstream models affected',
    rootCause: 'A Fivetran schema migration for the Stripe connector auto-detected a schema change in the source API. The "amount_usd" column (previously a computed field from amount × fx_rate) was removed from the connector output after Stripe deprecated this field from their v3 API. The change propagated automatically without a review gate, removing the column from the warehouse table.',
    impact: '2 downstream dbt models (rpt_revenue_daily, fct_mrr) reference "amount_usd" directly and are now failing with "column not found" errors. BI dashboards showing revenue by currency are broken. The nightly data refresh for the Finance team will fail if not resolved before the 02:00 UTC run.',
    recommendation: 'Add "amount_usd" back as a computed column: `amount * coalesce(fx_rate, 1.0)`. Update the Fivetran connector schema to pin the field mapping. Add a schema contract test that alerts before removing any column referenced by >1 downstream model. Set Fivetran auto-migration to "review required" mode.',
    affectedRecords: 0, pipeline: 'fivetran_stripe_v3'
  },
  {
    id: 'a3', rule: 'High Null Rate', dataset: 'dim_customers',
    severity: 'high', channel: 'Email', ts: '2026-05-05 11:05', ack: true,
    message: 'Email null rate jumped from 2% to 20%',
    rootCause: 'The CRM sync job (HubSpot → Snowflake) ran with a misconfigured field mapping after a HubSpot API v2→v3 migration. The "email" field path changed from "properties.email.value" to "properties.email" in v3, causing the mapper to write NULL for all contacts updated after May 4th 00:00 UTC.',
    impact: 'Email campaign targeting will be broken for 18,240 customers whose records were updated in the last 24 hours. Marketing automation workflows (Marketo sync, transactional emails) relying on dim_customers.email will skip these contacts. Estimated reach reduction for the next campaign: ~12%.',
    recommendation: 'Update the HubSpot connector field mapping from "properties.email.value" to "properties.email". Re-sync affected contacts (updated_at >= 2026-05-04 00:00:00). Backfill NULL email values from the HubSpot API for the affected window. Add a null rate alerting threshold of 5% for PII fields.',
    affectedRecords: 18240, pipeline: 'hubspot_crm_sync'
  },
  {
    id: 'a4', rule: 'Freshness SLA Breach', dataset: 'dim_products',
    severity: 'high', channel: 'Slack', ts: '2026-05-03 06:00', ack: true,
    message: 'Table not refreshed in 36 hours — expected every 6h',
    rootCause: 'The Airflow DAG responsible for syncing the product catalog (shopify_products_sync) has been paused since 2026-05-01 after a failed deployment. A hotfix to the product variant logic caused an import error in the DAG definition. The scheduler silently skipped 6 consecutive runs without triggering the failure alert (the alert was disabled during the maintenance window and not re-enabled).',
    impact: 'The product catalog used by the e-commerce recommendation engine is 36 hours stale. 2,340 new products added in Shopify are not visible to the recommendation model. Pricing updates for 890 products have not propagated, causing potential incorrect prices to be shown to customers.',
    recommendation: 'Fix the import error in shopify_products_sync DAG (line 47: incorrect relative import path). Re-enable and backfill the DAG for the missed 6 runs. Re-enable the Freshness SLA alert for dim_products. Set a process to automatically re-enable paused maintenance alerts after the maintenance window ends.',
    affectedRecords: 3230, pipeline: 'shopify_products_sync'
  },
  {
    id: 'a5', rule: 'Volume Anomaly', dataset: 'fact_orders',
    severity: 'medium', channel: 'Slack', ts: '2026-05-05 14:22', ack: false,
    message: 'Row count increased 340% vs 7-day baseline',
    rootCause: 'A data backfill job was triggered manually by a Data Engineer to recover 3 months of missing order history from a legacy system migration. The backfill inserted 2.1M historical records into fact_orders in a single batch, which the volume anomaly detector flagged as a 340% spike versus the 7-day rolling average of ~620K daily rows.',
    impact: 'This is a controlled, expected backfill — not a data quality issue. However, downstream aggregation models (fct_order_metrics, rpt_sales_by_region) will show inflated metrics for the backfill period if not handled carefully. Historical trend charts in BI dashboards will show a misleading spike on May 5th.',
    recommendation: 'Acknowledge this alert — the volume spike is intentional. Coordinate with the BI team to add a "backfill period" annotation to trend dashboards. Run incremental dbt models with the backfill date range scoped correctly to avoid double-counting. Consider adding a "planned backfill" flag to suppress volume anomaly alerts for known operations.',
    affectedRecords: 2100000, pipeline: 'legacy_migration_backfill'
  },
]

const alertRules: AlertRule[] = [
  {
    id: 'ar1', name: 'Critical Quality Drop', condition: 'Score < 70%',
    datasets: 'All', channel: 'Slack + Email', severity: 'critical',
    enabled: true, triggered: 3, lastFired: '2026-05-05 14:22',
    description: 'Fires when any dataset\'s overall quality score drops below 70%, indicating multiple rules are failing simultaneously.',
    whenItFires: 'Triggered when: (passing rules / total rules) < 0.70 for any dataset. Evaluated every 15 minutes.',
    businessContext: 'A quality score below 70% typically means 3+ rules are failing, indicating a systemic data pipeline issue rather than an isolated anomaly. This level of degradation directly affects business reporting reliability.',
    remediation: 'Immediately check the failing rules for the flagged dataset. Identify the root pipeline causing failures. Pause downstream consumption until quality is restored.',
    cooldown: '30 minutes', owner: 'Data Engineering'
  },
  {
    id: 'ar2', name: 'Schema Change Detected', condition: 'Column added/removed',
    datasets: 'fact_*, dim_*', channel: 'PagerDuty', severity: 'critical',
    enabled: true, triggered: 1, lastFired: '2026-05-04 18:00',
    description: 'Detects when columns are added or removed from core fact and dimension tables, which can silently break downstream models.',
    whenItFires: 'Compares schema snapshot at each ingestion run. Fires if column count changes or any column name in the previous snapshot is missing from the current schema.',
    businessContext: 'Schema changes on fact/dim tables break dbt models, BI dashboards, and ML feature pipelines without warning. A missing column that was referenced downstream can cause silent NULL propagation or hard failures in production jobs.',
    remediation: 'Identify who made the schema change and why. Check if downstream models reference the changed column. Add column back as computed if removed from source. Update contracts and downstream references before re-enabling.',
    cooldown: '0 minutes (immediate)', owner: 'Data Engineering + Data Governance'
  },
  {
    id: 'ar3', name: 'Freshness SLA Breach', condition: 'Delay > 6h',
    datasets: 'All', channel: 'Slack', severity: 'high',
    enabled: true, triggered: 2, lastFired: '2026-05-03 06:00',
    description: 'Alerts when any monitored dataset has not been updated within its expected refresh window (6 hours for most tables).',
    whenItFires: 'Checks max(updated_at) against current time. Fires when the lag exceeds 6 hours. Custom thresholds can be set per dataset (e.g., 24h for weekly tables).',
    businessContext: 'Stale data in dashboards misleads decision-makers who assume they\'re viewing current data. Freshness breaches often indicate silent pipeline failures that won\'t surface until someone notices wrong numbers.',
    remediation: 'Check if the upstream DAG/job is running. Look for scheduler failures or paused pipelines. Re-trigger the ingestion job. If the source system is down, communicate SLA breach to data consumers.',
    cooldown: '60 minutes', owner: 'Data Operations'
  },
  {
    id: 'ar4', name: 'High Null Rate', condition: 'Null rate > 10%',
    datasets: 'dim_customers, fact_orders', channel: 'Email', severity: 'high',
    enabled: true, triggered: 1, lastFired: '2026-05-05 11:05',
    description: 'Monitors null rates in key columns of customer and order tables. A spike in nulls typically indicates a connector misconfiguration or source API change.',
    whenItFires: 'Calculates null_count / total_rows for all non-nullable columns. Fires when any column\'s null rate exceeds 10% in the latest batch.',
    businessContext: 'High null rates in customer and order data directly break CRM workflows, marketing automation, and revenue calculations. Even a 10% null rate in email fields means tens of thousands of customers are unreachable.',
    remediation: 'Identify which column has elevated nulls. Check recent connector/ETL changes. Re-map the field if source schema changed. Backfill nulls from the source API. Validate the fix by running the null rate check manually.',
    cooldown: '120 minutes', owner: 'Data Engineering'
  },
  {
    id: 'ar5', name: 'Volume Anomaly', condition: 'Row count ±50% baseline',
    datasets: 'All', channel: 'Slack', severity: 'medium',
    enabled: true, triggered: 1, lastFired: '2026-05-05 14:22',
    description: 'Detects unusual spikes or drops in row counts compared to the 7-day rolling average. Both over- and under-delivery of data are flagged.',
    whenItFires: 'Computes daily row count against the 7-day P50 baseline. Fires when the deviation exceeds ±50%. For tables with high natural variance, a ±100% threshold is configurable.',
    businessContext: 'A volume spike can indicate double-loading or a runaway backfill. A volume drop can mean missing data from a failed partition or source system outage. Both are data quality risks that affect aggregate metrics.',
    remediation: 'Determine if the volume change is expected (planned backfill, seasonality spike) or unexpected (pipeline error). For unexpected spikes: check for duplicate loads. For unexpected drops: check source system health and partition completeness.',
    cooldown: '60 minutes', owner: 'Data Engineering'
  },
  {
    id: 'ar6', name: 'Weekly Summary Report', condition: 'Every Sunday 9 AM',
    datasets: 'All', channel: 'Email', severity: 'info',
    enabled: false, triggered: 0, lastFired: '2026-04-28 09:00',
    description: 'Scheduled weekly digest summarizing data quality scores, SLA adherence, open issues, and anomalies across all monitored datasets.',
    whenItFires: 'Cron schedule: 0 9 * * 0 (every Sunday at 9:00 AM UTC). Not condition-triggered — always fires on schedule unless disabled.',
    businessContext: 'Provides stakeholders a regular cadence of data health visibility without requiring them to log into the platform. Useful for data owners, department heads, and governance teams.',
    remediation: 'N/A — informational report. If the report is not being received, check email delivery settings and confirm the recipient list is up to date.',
    cooldown: 'N/A (scheduled)', owner: 'Data Governance'
  },
]

const SEV: Record<Severity, { bg: string; color: string; border: string }> = {
  critical: { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)',  border: '#fca5a5' },
  high:     { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',   border: '#fdba74' },
  medium:   { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)',   border: '#fde68a' },
  info:     { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', border: '#bae6fd' },
}

export default function AlertsPage() {
  const [rules, setRules] = useState(alertRules)
  const [alerts, setAlerts] = useState(recentAlerts)
  const [tab, setTab] = useState<'recent' | 'rules'>('recent')
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all')
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all')
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null)
  const [expandedRule, setExpandedRule] = useState<string | null>(null)

  const unacked = alerts.filter(a => !a.ack).length
  const activeRules = rules.filter(r => r.enabled).length
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length
  const triggeredRules = rules.filter(r => r.triggered > 0).length

  function toggleRule(id: string) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
  }
  function ack(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, ack: true } : a))
  }
  function ackAll() {
    setAlerts(prev => prev.map(a => ({ ...a, ack: true })))
  }

  // Filter helpers
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

  // Card click handlers
  function handleAlertCard(filter: AlertFilter) {
    setAlertFilter(prev => prev === filter ? 'all' : filter)
    setTab('recent')
  }
  function handleRuleCard(filter: RuleFilter) {
    setRuleFilter(prev => prev === filter ? 'all' : filter)
    setTab('rules')
  }

  const statCards = [
    {
      label: 'Unacknowledged', value: unacked, icon: '🔔',
      color: '#dc2626', activeFilter: 'unacked' as AlertFilter,
      isRuleTab: false,
      active: tab === 'recent' && alertFilter === 'unacked',
    },
    {
      label: 'Total (24h)', value: alerts.length, icon: '📊',
      color: 'var(--accent)', activeFilter: 'all' as AlertFilter,
      isRuleTab: false,
      active: tab === 'recent' && alertFilter === 'all',
    },
    {
      label: 'Alert Rules', value: rules.length, icon: '⚙️',
      color: 'var(--text-secondary)', activeFilter: 'all' as RuleFilter,
      isRuleTab: true,
      active: tab === 'rules' && ruleFilter === 'all',
    },
    {
      label: 'Active Rules', value: activeRules, icon: '▶️',
      color: '#16a34a', activeFilter: 'active' as RuleFilter,
      isRuleTab: true,
      active: tab === 'rules' && ruleFilter === 'active',
    },
  ]

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1300px' }}>
      <PageTabBar tabs={[
        { href: '/alerts',     label: 'Alerts' },
        { href: '/incidents',  label: 'Incidents' },
        { href: '/audit-logs', label: 'Audit Logs' },
      ]} />
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
        Workspace · <span style={{ color: 'var(--text-secondary)' }}>Analytics platform</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Alerts</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0' }}>
            {unacked} unacknowledged · {activeRules} active alert rules
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {unacked > 0 && (
            <button onClick={ackAll} style={{
              background: 'var(--surface)', border: '1px solid var(--border)', padding: '8px 14px',
              borderRadius: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer'
            }}>✓ Ack All ({unacked})</button>
          )}
          <button style={{
            background: 'var(--accent-bg)', border: '1px solid var(--border)', padding: '8px 16px',
            borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer'
          }}>+ New Alert Rule</button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '24px' }}>
        {statCards.map((s, i) => (
          <div
            key={i}
            onClick={() => s.isRuleTab
              ? handleRuleCard(s.activeFilter as RuleFilter)
              : handleAlertCard(s.activeFilter as AlertFilter)
            }
            style={{
              background: s.active ? s.color : 'var(--surface)',
              border: `1px solid ${s.active ? s.color : 'var(--border)'}`,
              borderRadius: '12px', padding: '16px 20px',
              cursor: 'pointer',
              transition: 'all 0.18s',
              boxShadow: s.active ? `0 4px 16px ${s.color}33` : 'none',
            }}
          >
            <div style={{ fontSize: '22px', marginBottom: '6px' }}>{s.icon}</div>
            <div style={{ fontSize: '26px', fontWeight: 700, color: s.active ? '#fff' : s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: s.active ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)', marginTop: '2px' }}>
              {s.label}
            </div>
            {s.active && (
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '4px', fontWeight: 500 }}>
                ▼ filtered
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Quick filter pills for Recent Alerts */}
      {tab === 'recent' && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {([
            { f: 'all', label: 'All Alerts', count: alerts.length },
            { f: 'unacked', label: 'Unacknowledged', count: unacked },
            { f: 'critical', label: 'Critical', count: criticalAlerts },
            { f: 'high', label: 'High', count: alerts.filter(a => a.severity === 'high').length },
          ] as { f: AlertFilter; label: string; count: number }[]).map(p => (
            <button key={p.f} onClick={() => setAlertFilter(p.f)} style={{
              padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
              border: `1px solid ${alertFilter === p.f ? 'var(--accent)' : 'var(--border)'}`,
              background: alertFilter === p.f ? 'var(--accent-bg)' : 'var(--surface)',
              color: alertFilter === p.f ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}>
              {p.label} <span style={{ opacity: 0.75 }}>({p.count})</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: 'var(--surface-muted)', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
        {(['recent', 'rules'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 18px', borderRadius: '7px', border: 'none',
            background: tab === t ? 'var(--surface)' : 'transparent',
            color: tab === t ? 'var(--foreground)' : 'var(--text-secondary)',
            fontWeight: tab === t ? 600 : 400,
            fontSize: '13px', cursor: 'pointer',
            boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
          }}>
            {t === 'recent' ? `Recent Alerts (${filteredAlerts.length})` : `Alert Rules (${filteredRules.length})`}
          </button>
        ))}
      </div>

      {/* Recent Alerts Tab */}
      {tab === 'recent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredAlerts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No alerts match this filter.
            </div>
          )}
          {filteredAlerts.map(a => {
            const ss = SEV[a.severity]
            const isExpanded = expandedAlert === a.id
            return (
              <div
                key={a.id}
                onClick={() => setExpandedAlert(isExpanded ? null : a.id)}
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${!a.ack ? ss.border : 'var(--border)'}`,
                  borderLeft: `3px solid ${!a.ack ? ss.color : 'var(--border)'}`,
                  borderRadius: '12px', cursor: 'pointer',
                  opacity: a.ack && !isExpanded ? 0.75 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {/* Row header */}
                <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                      <span style={{ background: ss.bg, color: ss.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>
                        {a.severity}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--foreground)' }}>{a.rule}</span>
                      {a.ack && (
                        <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '1px 6px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 600 }}>
                          ✓ Acknowledged
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '5px' }}>{a.message}</div>
                    <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span>Dataset: <strong style={{ color: 'var(--text-secondary)' }}>{a.dataset}</strong></span>
                      <span>Pipeline: <strong style={{ color: 'var(--text-secondary)' }}>{a.pipeline}</strong></span>
                      <span>Channel: <strong style={{ color: 'var(--text-secondary)' }}>{a.channel}</strong></span>
                      <span>{a.ts}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '16px' }}>
                    {!a.ack && (
                      <button
                        onClick={(e) => ack(a.id, e)}
                        style={{
                          padding: '5px 12px', borderRadius: '7px', border: '1px solid var(--border)',
                          background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', fontWeight: 500
                        }}
                      >
                        Acknowledge
                      </button>
                    )}
                    <span style={{ color: 'var(--text-muted)', fontSize: '16px', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    {/* Metadata bar */}
                    <div style={{ display: 'flex', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                      {[
                        { label: 'Dataset', value: a.dataset },
                        { label: 'Pipeline', value: a.pipeline },
                        { label: 'Channel', value: a.channel },
                        { label: 'Affected Records', value: a.affectedRecords.toLocaleString('en-US') },
                        { label: 'Fired At', value: a.ts },
                      ].map((m, i, arr) => (
                        <div key={i} style={{
                          flex: 1, padding: '10px 16px',
                          borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none'
                        }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '2px' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Root Cause */}
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e9d5ff' }}>
                        <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: '10px 16px' }}>
                          <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>🔍 ROOT CAUSE</span>
                        </div>
                        <div style={{ padding: '14px 16px', background: '#faf5ff', fontSize: '13px', color: '#3b1f6e', lineHeight: '1.65' }}>
                          {a.rootCause}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {/* Business Impact */}
                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: `1px solid ${ss.border}` }}>
                          <div style={{ background: a.severity === 'critical' ? '#dc2626' : a.severity === 'high' ? '#ea580c' : '#ca8a04', padding: '10px 16px' }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>⚠️ BUSINESS IMPACT</span>
                          </div>
                          <div style={{ padding: '14px 16px', background: ss.bg, fontSize: '13px', color: '#334155', lineHeight: '1.65' }}>
                            {a.impact}
                          </div>
                        </div>

                        {/* Recommended Fix */}
                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #bbf7d0' }}>
                          <div style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', padding: '10px 16px' }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>✅ RECOMMENDED FIX</span>
                          </div>
                          <div style={{ padding: '14px 16px', background: '#f0fdf4', fontSize: '13px', color: '#14532d', lineHeight: '1.65' }}>
                            {a.recommendation}
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
      )}

      {/* Alert Rules Tab */}
      {tab === 'rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Rule filter pills */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {([
              { f: 'all', label: 'All Rules', count: rules.length },
              { f: 'active', label: 'Active', count: activeRules },
              { f: 'critical', label: 'Critical', count: rules.filter(r => r.severity === 'critical').length },
              { f: 'triggered', label: 'Recently Triggered', count: triggeredRules },
            ] as { f: RuleFilter; label: string; count: number }[]).map(p => (
              <button key={p.f} onClick={() => setRuleFilter(p.f)} style={{
                padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
                border: `1px solid ${ruleFilter === p.f ? 'var(--accent)' : 'var(--border)'}`,
                background: ruleFilter === p.f ? 'var(--accent-bg)' : 'var(--surface)',
                color: ruleFilter === p.f ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}>
                {p.label} <span style={{ opacity: 0.75 }}>({p.count})</span>
              </button>
            ))}
          </div>

          {filteredRules.map(r => {
            const ss = SEV[r.severity]
            const isExpanded = expandedRule === r.id
            return (
              <div
                key={r.id}
                onClick={() => setExpandedRule(isExpanded ? null : r.id)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${r.enabled ? ss.color : 'var(--border)'}`,
                  borderRadius: '12px', cursor: 'pointer',
                  opacity: !r.enabled && !isExpanded ? 0.7 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {/* Rule row */}
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--foreground)' }}>{r.name}</span>
                      <span style={{ background: ss.bg, color: ss.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600 }}>
                        {r.severity}
                      </span>
                      {!r.enabled && (
                        <span style={{ background: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)', padding: '2px 7px', borderRadius: '10px', fontSize: '10.5px', fontWeight: 500 }}>
                          disabled
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.condition}</div>
                  </div>
                  <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{r.datasets}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>datasets</div>
                  </div>
                  <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{r.channel}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>channel</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: '60px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: r.triggered > 0 ? '#dc2626' : '#16a34a' }}>{r.triggered}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>triggered</div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', minWidth: '120px', textAlign: 'right' }}>{r.lastFired}</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleRule(r.id) }}
                    style={{
                      width: '44px', height: '24px', borderRadius: '12px', border: 'none',
                      background: r.enabled ? 'var(--accent)' : 'var(--border)',
                      cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '3px', left: r.enabled ? '22px' : '3px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      background: '#fff', transition: 'left 0.2s', display: 'block'
                    }} />
                  </button>
                  <span style={{ color: 'var(--text-muted)', fontSize: '16px', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                </div>

                {/* Expanded rule detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                    {/* Metadata bar */}
                    <div style={{ display: 'flex', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                      {[
                        { label: 'Owner', value: r.owner },
                        { label: 'Cooldown', value: r.cooldown },
                        { label: 'Times Triggered', value: r.triggered.toString() },
                        { label: 'Last Fired', value: r.lastFired },
                        { label: 'Status', value: r.enabled ? '✅ Active' : '⏸ Disabled' },
                      ].map((m, i, arr) => (
                        <div key={i} style={{
                          flex: 1, padding: '10px 16px',
                          borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none'
                        }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                          <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '2px' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Description + When it fires */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e9d5ff' }}>
                          <div style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', padding: '10px 16px' }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>📋 RULE DESCRIPTION</span>
                          </div>
                          <div style={{ padding: '14px 16px', background: '#faf5ff', fontSize: '13px', color: '#3b1f6e', lineHeight: '1.65' }}>
                            <div style={{ marginBottom: '10px' }}>{r.description}</div>
                            <div style={{ fontSize: '12px', background: '#ede9fe', padding: '8px 10px', borderRadius: '6px', color: '#5b21b6', fontFamily: 'monospace' }}>
                              {r.whenItFires}
                            </div>
                          </div>
                        </div>

                        <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #fde68a' }}>
                          <div style={{ background: 'linear-gradient(135deg, #b45309, #d97706)', padding: '10px 16px' }}>
                            <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>⚠️ BUSINESS CONTEXT</span>
                          </div>
                          <div style={{ padding: '14px 16px', background: '#fffbeb', fontSize: '13px', color: '#451a03', lineHeight: '1.65' }}>
                            {r.businessContext}
                          </div>
                        </div>
                      </div>

                      {/* Remediation */}
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #bbf7d0' }}>
                        <div style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', padding: '10px 16px' }}>
                          <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em' }}>✅ REMEDIATION PLAYBOOK</span>
                        </div>
                        <div style={{ padding: '14px 16px', background: '#f0fdf4', fontSize: '13px', color: '#14532d', lineHeight: '1.65' }}>
                          {r.remediation}
                        </div>
                      </div>
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
}
