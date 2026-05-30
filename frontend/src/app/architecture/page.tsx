'use client'
import { useState } from 'react'
import PageTabBar from '@/components/ui/PageTabBar'

const steps = [
  {
    id: 'sources', label: 'Data Sources', icon: '🗄️', color: '#6366f1',
    x: 40, y: 200,
    items: ['Snowflake', 'BigQuery', 'PostgreSQL', 'MySQL', 'MongoDB', 'REST API', 'CSV / File'],
    description: 'Connect any data source. DataGuard reads metadata and samples rows without moving your data.',
    flow: 'Your data stays in place. We connect via read-only credentials and pull only what is needed for checks.',
  },
  {
    id: 'connections', label: 'Connections', icon: '🔗', color: '#0ea5e9',
    x: 220, y: 200,
    items: ['Credential store', 'Connection test', 'Schema discovery', 'Metadata sync', 'Status monitoring'],
    description: 'Secure, tested connections store credentials and continuously monitor reachability.',
    flow: 'Credentials are encrypted at rest. Schema is auto-discovered and kept in sync. Connection health is checked every 5 minutes.',
  },
  {
    id: 'catalog', label: 'Catalog & Lineage', icon: '📚', color: '#8b5cf6',
    x: 400, y: 200,
    items: ['Table catalog', 'Column profiling', 'Data lineage graph', 'Business domains', 'Ownership mapping'],
    description: 'All assets are catalogued with lineage, ownership, quality scores, and business context.',
    flow: 'Lineage is built by parsing SQL, dbt models, and API calls. Every upstream/downstream dependency is tracked automatically.',
  },
  {
    id: 'rules', label: 'Rules Engine', icon: '🛡️', color: '#f59e0b',
    x: 590, y: 200,
    items: ['NOT NULL checks', 'Uniqueness', 'Range / regex', 'Freshness SLAs', 'Referential integrity', 'Custom SQL', 'Row count'],
    description: 'Define quality rules declaratively — no code needed. AI Assistant can generate rules from natural language.',
    flow: 'Rules are stored per dataset. The AI Agent translates "email should be valid" into a regex check automatically.',
  },
  {
    id: 'scheduler', label: 'Scheduler', icon: '📅', color: '#14b8a6',
    x: 780, y: 200,
    items: ['Cron schedules', 'Event triggers', 'dbt integration', 'CI/CD hooks', 'Manual runs'],
    description: 'Run quality checks on any cadence — from real-time to weekly — or trigger from pipeline events.',
    flow: 'Schedules are stored per connection. Checks fan out in parallel across rules for that dataset, then aggregate results.',
  },
  {
    id: 'engine', label: 'Check Execution', icon: '⚡', color: '#ec4899',
    x: 970, y: 200,
    items: ['SQL pushdown', 'Parallel execution', 'Timeout handling', 'Row sampling', 'Result caching'],
    description: 'Checks execute as SQL directly on your database — no data extraction, no ETL.',
    flow: 'Each rule compiles to a SQL query that runs on your source DB. Results (pass/fail count) are returned and stored. Raw data never leaves your system.',
  },
  {
    id: 'monitoring', label: 'Monitoring & Alerts', icon: '🔔', color: '#ef4444',
    x: 1160, y: 200,
    items: ['Anomaly detection', 'SLA tracking', 'Alert routing', 'Slack / Email / PagerDuty', 'Acknowledgement flow'],
    description: 'AI-powered anomaly detection and configurable alerts notify your team before issues reach production.',
    flow: 'Scores are compared against baselines. Deviations trigger anomaly flags. Alert rules filter by severity and route to the right channel.',
  },
  {
    id: 'reports', label: 'Reports & Governance', icon: '📊', color: '#16a34a',
    x: 1350, y: 200,
    items: ['Quality scorecards', 'Trend analysis', 'Contract compliance', 'Audit logs', 'Domain dashboards'],
    description: 'Comprehensive reports, scorecards, and governance tools for every stakeholder.',
    flow: 'Reports aggregate check results over time. Contracts enforce producer/consumer agreements. All changes are captured in the immutable audit log.',
  },
]

const workflows = [
  { title: 'How a Quality Check Runs', color: '#2563eb', steps: ['1. Scheduler triggers at configured time (or you click "Run Now")', '2. DataGuard fetches the rules for that dataset from the store', '3. Each rule compiles to an optimized SQL query (e.g. SELECT COUNT(*) WHERE email IS NULL)', '4. SQL is sent to your Snowflake/BigQuery/PostgreSQL via the saved connection', '5. Results (records checked, failed count, score) are returned in seconds', '6. Score is persisted to reports.json and compared to the baseline', '7. If score drops below threshold → alert fires → Slack/Email/PagerDuty', '8. Execution log entry is written with full diagnostics'] },
  { title: 'How a New Connection Flows', color: '#7c3aed', steps: ['1. Click "+ Add Connection" → choose type (Snowflake, BigQuery, etc.)', '2. Fill in account, warehouse, username, password → saved to connections.json (encrypted in prod)', '3. Click "Test Connection" → DataGuard pings the endpoint, authenticates, validates DB access', '4. Success → status set to Active. Failure → specific error code + how-to-fix shown', '5. Schema is auto-discovered → tables appear in Catalog', '6. You can now create Rules and Schedules targeting this connection', '7. All actions logged in Audit Logs with your user, timestamp, and IP'] },
  { title: 'How the AI Agent Works', color: '#0d9488', steps: ['1. You type a request: "Create a NOT NULL rule for email in dim_customers"', '2. Agent uses tool_use to call list_connections() and list_rules() to understand context', '3. Agent calls create_rule() with the correct parameters — no form-filling needed', '4. Agent confirms the action and shows the created rule', '5. You can ask "Run all checks on Snowflake now" → agent calls run_checks()', '6. Agent reads results and summarizes: "3 rules failed — here are the details"', '7. Agentic loop continues for up to 5 tool calls per conversation turn'] },
  { title: 'How Anomaly Detection Works', color: '#dc2626', steps: ['1. Every check execution stores a score timestamped in the time series', '2. A rolling 7-day baseline is computed (mean ± 2 std dev)', '3. On each run, current score is compared to the baseline', '4. Volume anomalies: row count compared to same-day-of-week 4-week average', '5. Schema changes: column list diffed against last known schema', '6. Distribution shifts: mean/P95 compared against baseline window', '7. Anomaly flagged → severity calculated → alert rule evaluated → notification sent', '8. Anomaly visible in the Anomalies page with delta, description, and status'] },
]

export default function ArchitecturePage() {
  const [active, setActive] = useState<typeof steps[0] | null>(null)
  const [wfOpen, setWfOpen] = useState<number | null>(0)

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1500px' }}>
      <PageTabBar tabs={[
        { href: '/settings',     label: 'General' },
        { href: '/compliance',   label: 'Compliance' },
        { href: '/architecture', label: 'User Guide' },
      ]} />
      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '8px' }}>Workspace · <span style={{ color: '#475569' }}>Analytics platform</span></div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Architecture & Workflow</h1>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0' }}>End-to-end data quality platform — click any component to learn how it works</p>
      </div>

      {/* Pipeline diagram */}
      <div style={{ background: '#fff', border: '1px solid #ebe8df', borderRadius: '16px', padding: '32px 28px', marginBottom: '24px', overflowX: 'auto' }}>
        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '20px' }}>END-TO-END PIPELINE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', minWidth: '1100px' }}>
          {steps.map((step, i) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div onClick={() => setActive(active?.id === step.id ? null : step)} style={{ flex: 1, background: active?.id === step.id ? `${step.color}15` : '#fafaf9', border: `2px solid ${active?.id === step.id ? step.color : '#e2e8f0'}`, borderRadius: '12px', padding: '14px 10px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s', minWidth: '110px' }}>
                <div style={{ fontSize: '22px', marginBottom: '6px' }}>{step.icon}</div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: active?.id === step.id ? step.color : '#475569', lineHeight: '1.3' }}>{step.label}</div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 4px' }}>
                  <div style={{ width: '20px', height: '2px', background: '#e2e8f0' }} />
                  <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid #cbd5e1' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {active && (
          <div style={{ marginTop: '20px', border: `1px solid ${active.color}40`, borderRadius: '12px', padding: '20px 24px', background: `${active.color}08` }}>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '28px' }}>{active.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: active.color }}>{active.label}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>{active.description}</div>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6', background: '#fff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <strong style={{ color: '#1a1a1a' }}>How it works: </strong>{active.flow}
                </div>
              </div>
              <div style={{ width: '200px', flexShrink: 0 }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px' }}>CAPABILITIES</div>
                {active.items.map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '12.5px', color: '#475569', borderBottom: '1px solid #f3f1ea' }}>
                    <span style={{ color: active.color, fontSize: '10px' }}>●</span> {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data flow summary */}
      <div style={{ background: '#1e293b', borderRadius: '14px', padding: '24px 28px', marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '14px' }}>METADATA STORAGE — ALL STORED IN THE SAME CONNECTION STORE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
          {[
            { file: 'connections.json', desc: 'Credential, status, type, schema, lastTested', icon: '🔗', color: '#0ea5e9' },
            { file: 'rules.json', desc: 'Rules linked to connectionId — queries run on that connection', icon: '🛡️', color: '#f59e0b' },
            { file: 'reports.json', desc: 'Check results reference connectionId and ruleId', icon: '📊', color: '#16a34a' },
            { file: 'schedules (in-memory)', desc: 'Each schedule targets a connectionId for its dataset checks', icon: '📅', color: '#8b5cf6' },
          ].map(f => (
            <div key={f.file} style={{ background: '#0f172a', borderRadius: '10px', padding: '14px 16px', border: `1px solid ${f.color}30` }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: f.color, fontWeight: 600, marginBottom: '4px' }}>{f.file}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: '1.5' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow walkthroughs */}
      <div style={{ fontWeight: 700, fontSize: '16px', color: '#1a1a1a', marginBottom: '14px' }}>Step-by-Step Workflows</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {workflows.map((wf, i) => (
          <div key={wf.title} style={{ background: '#fff', border: `1px solid ${wfOpen === i ? wf.color + '60' : '#ebe8df'}`, borderRadius: '12px', overflow: 'hidden' }}>
            <div onClick={() => setWfOpen(wfOpen === i ? null : i)} style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: wfOpen === i ? `${wf.color}08` : 'transparent' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: wfOpen === i ? wf.color : '#1a1a1a' }}>{wf.title}</div>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>{wfOpen === i ? '▲' : '▼'}</span>
            </div>
            {wfOpen === i && (
              <div style={{ padding: '0 20px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {wf.steps.map((step, si) => (
                    <div key={si} style={{ display: 'flex', gap: '12px', paddingBottom: '0' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: wf.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>{si + 1}</div>
                        {si < wf.steps.length - 1 && <div style={{ width: '2px', flex: 1, background: `${wf.color}30`, minHeight: '12px', marginTop: '2px', marginBottom: '2px' }} />}
                      </div>
                      <div style={{ flex: 1, paddingTop: '4px', paddingBottom: si < wf.steps.length - 1 ? '8px' : '0', fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>{step.replace(/^\d+\. /, '')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
