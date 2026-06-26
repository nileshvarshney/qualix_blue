'use client'
import { useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'

const steps = [
  {
    id: 'sources', label: 'Data Sources', icon: '🗄️', color: '#6366f1',
    items: ['Snowflake', 'BigQuery', 'PostgreSQL', 'MySQL', 'MongoDB', 'REST API', 'CSV / File'],
    description: 'Connect any data source. DataGuard reads metadata and samples rows without moving your data.',
    flow: 'Your data stays in place. We connect via read-only credentials and pull only what is needed for checks.',
  },
  {
    id: 'connections', label: 'Connections', icon: '🔗', color: '#0ea5e9',
    items: ['Credential store (Fernet-encrypted)', 'Connection test', 'Schema discovery', 'Metadata sync', 'Status monitoring'],
    description: 'Secure, tested connections store credentials and continuously monitor reachability.',
    flow: 'Credentials are Fernet-encrypted at rest. Schema is auto-discovered and kept in sync. Connection health is checked every 5 minutes.',
  },
  {
    id: 'catalog', label: 'Catalog & Lineage', icon: '📚', color: '#8b5cf6',
    items: ['Full-text catalog search', 'Column profiling + stats', 'SQL-parsed lineage graph', 'Business domains + ownership', 'Glossary terms + approval', 'Saved searches', 'Data products'],
    description: 'All assets are catalogued with lineage, ownership, quality scores, and business context.',
    flow: 'Lineage is built by parsing SQL and view definitions with sqlglot. Every upstream/downstream dependency is tracked. Column-level lineage available for finer impact analysis.',
  },
  {
    id: 'rules', label: 'Rules Engine', icon: '🛡️', color: '#f59e0b',
    items: ['NOT NULL checks', 'Uniqueness', 'Range / regex', 'Freshness SLAs', 'Referential integrity', 'Custom SQL', 'Row count', 'AI rule suggestions'],
    description: 'Define quality rules declaratively — no code needed. AI Assistant can generate rules from natural language.',
    flow: 'Rules are versioned: every change snapshots the previous state. The approval workflow (draft → pending_review → active) requires a domain_owner or admin to approve. Rollback to any snapshot is one click.',
  },
  {
    id: 'scheduler', label: 'Scheduler', icon: '📅', color: '#14b8a6',
    items: ['Cron schedules', 'Event triggers', 'dbt integration', 'CI/CD hooks', 'Manual runs', 'Scan jobs'],
    description: 'Run quality checks on any cadence — from real-time to weekly — or trigger from pipeline events.',
    flow: 'Schedules are stored per connection. Checks fan out in parallel across rules for that dataset, then aggregate results. Scan jobs orchestrate full metadata + profiling sweeps separately.',
  },
  {
    id: 'engine', label: 'Check Execution', icon: '⚡', color: '#ec4899',
    items: ['SQL pushdown to source', 'asyncio.gather() parallelism', 'Timeout handling', 'Row sampling', 'Post-run drift check', 'Anomaly re-evaluation'],
    description: 'Checks execute as SQL directly on your database — no data extraction, no ETL.',
    flow: 'Each rule compiles to a SQL query that runs on your source DB. Results (pass/fail count) are returned and stored. After every run, schema drift is checked and anomaly detectors re-evaluated automatically.',
  },
  {
    id: 'monitoring', label: 'Monitoring & Alerts', icon: '🔔', color: '#ef4444',
    items: ['Statistical anomaly detection', 'Schema drift events', 'SLA tracking', 'Alert routing', 'Slack / Email / PagerDuty', 'Acknowledgement flow', 'Incident lifecycle', 'Issue tracker'],
    description: 'AI-powered anomaly detection and configurable alerts notify your team before issues reach production.',
    flow: 'Quality scores are compared against z-score / IQR baselines. Schema column diffs trigger drift events. Incidents track root-cause analysis, TTD, and TTR. Issues provide a lightweight triage queue.',
  },
  {
    id: 'governance', label: 'Governance', icon: '⚖️', color: '#16a34a',
    items: ['Policy definitions (versioned)', 'Approval workflow', 'Policy violation sweep', 'Business glossary', 'Audit trail', 'Notifications + bell'],
    description: 'Governance policies enforce data standards across all assets. Every policy change is reviewed and version-controlled.',
    flow: 'Policies evaluate assets on a sweep schedule. Violations are recorded per asset. Glossary terms follow an approval workflow. Every mutation is logged with before/after JSON in the audit trail.',
  },
  {
    id: 'privacy', label: 'Privacy & Compliance', icon: '🔒', color: '#a855f7',
    items: ['Column masking policies', 'Data Subject Requests (DSR)', 'Consent records', 'Residency policies', 'Compliance frameworks (GDPR, HIPAA…)', 'Control mapping', 'Auto compliance scoring'],
    description: 'End-to-end privacy engineering and compliance tracking built into the platform.',
    flow: 'Column classifications (PII, PHI) drive masking policy enforcement. DSR requests track processing through a status lifecycle. Compliance frameworks map DQ rules to controls — scoring is recalculated automatically on each assess run.',
  },
  {
    id: 'reports', label: 'Reports & Insights', icon: '📊', color: '#f97316',
    items: ['Quality scorecards', 'Dimension breakdowns', 'Forecast charts', 'Data contracts + SLA adherence', 'Executive dashboard', 'Cost of quality estimates', 'Domain dashboards'],
    description: 'Comprehensive reports, scorecards, and forecasting for every stakeholder.',
    flow: 'Reports aggregate check results over time across completeness, validity, uniqueness, timeliness, consistency, and accuracy dimensions. Data contracts enforce producer/consumer SLA agreements. Quality forecasting models expected score trajectories.',
  },
]

const workflows = [
  {
    title: 'How a Quality Check Runs',
    color: '#2563eb',
    steps: [
      'Scheduler triggers at configured time (or you click "Run Now")',
      'DataGuard fetches the active rules for that dataset from PostgreSQL',
      'Each rule compiles to an optimized SQL query (e.g. SELECT COUNT(*) WHERE email IS NULL)',
      'SQL is sent to your Snowflake/BigQuery/PostgreSQL via the saved connection pool',
      'Results (records checked, failed count, score) are returned in seconds',
      'Score is persisted to dq_rule_runs and dimension scores are aggregated',
      'Post-run: schema drift is checked; anomaly detectors are re-evaluated',
      'If score drops below threshold → alert fires → Slack/Email/PagerDuty',
      'Execution log entry is written with full diagnostics and sample failed rows',
    ],
  },
  {
    title: 'How the Governance Approval Flow Works',
    color: '#16a34a',
    steps: [
      'Admin or domain_owner creates or edits a governance policy',
      'Policy is saved with status "draft" and a version snapshot is created',
      'Submitter requests approval — an ApprovalRequest record is created',
      'Approver (admin / domain_owner) reviews the change and approves or rejects',
      'On approval, policy status moves to "active" and takes effect on next sweep',
      'On reject, policy returns to draft with the reviewer\'s comment',
      'A notification is sent to the submitter via the notification bell',
      'Every action is written to audit_logs with before/after JSON',
    ],
  },
  {
    title: 'How the AI Agent Works',
    color: '#0d9488',
    steps: [
      'You type a request: "Create a NOT NULL rule for email in dim_customers"',
      'Agent uses tool_use to call list_connections() and list_rules() to understand context',
      'Agent calls create_rule() with the correct parameters — no form-filling needed',
      'Agent confirms the action and shows the created rule',
      'You can ask "Run all checks on Snowflake now" → agent calls run_checks()',
      'Agent reads results and summarizes: "3 rules failed — here are the details"',
      'Agentic loop continues for up to 5 tool calls per conversation turn',
    ],
  },
  {
    title: 'How Anomaly Detection Works',
    color: '#dc2626',
    steps: [
      'Every check execution stores a quality score timestamped in dq_rule_runs',
      'AnomalyDetector is configured per column with type: zscore, iqr, or threshold',
      'Training computes a rolling baseline from the last N executions',
      'On each run, post_run_service re-evaluates all active detectors',
      'Volume anomalies: row count compared to same-day-of-week 4-week average',
      'Schema changes: column list diffed against last known SchemaBaseline',
      'Distribution shifts: mean/P95 compared against baseline window',
      'AnomalyDetection record written with delta, severity, and AI explanation',
      'Anomaly visible in the Anomalies page and can trigger alert rules',
    ],
  },
  {
    title: 'How Privacy & Compliance Works',
    color: '#a855f7',
    steps: [
      'Data engineers classify columns as PII, PHI, or CONFIDENTIAL via the Classifications UI',
      'Masking policies are created per column, specifying type (hash, tokenize, partial_mask…)',
      'Unmasked roles are listed — all other roles see masked values when querying',
      'DSRs are submitted by privacy team, tracked through submitted → processing → completed',
      'Compliance frameworks (GDPR, HIPAA, SOC 2) are configured with their control requirements',
      'DQ rules are mapped to compliance controls (manual or auto-mapped on startup)',
      'POST /compliance/assess-all re-evaluates all mappings and recomputes pass/fail rates',
      'Framework-level status (compliant / partial / non-compliant) updates on each assess run',
    ],
  },
]

export default function ArchitecturePage() {
  const [active, setActive] = useState<typeof steps[0] | null>(null)
  const [wfOpen, setWfOpen] = useState<number | null>(0)

  return (
    <div style={{ padding: '28px 36px', maxWidth: '1600px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Architecture & Workflow</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 0' }}>End-to-end data governance platform — click any component to learn how it works</p>
      </div>

      {/* Pipeline diagram */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px 28px', marginBottom: '24px', overflowX: 'auto' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '20px' }}>END-TO-END PIPELINE</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', minWidth: '1400px' }}>
          {steps.map((step, i) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div
                onClick={() => setActive(active?.id === step.id ? null : step)}
                style={{
                  flex: 1,
                  background: active?.id === step.id ? `${step.color}15` : 'var(--surface-muted)',
                  border: `2px solid ${active?.id === step.id ? step.color : 'var(--border)'}`,
                  borderRadius: '12px', padding: '14px 10px', textAlign: 'center',
                  cursor: 'pointer', transition: 'all 0.15s', minWidth: '100px',
                }}
              >
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{step.icon}</div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: active?.id === step.id ? step.color : 'var(--text-secondary)', lineHeight: '1.3' }}>{step.label}</div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0 4px' }}>
                  <div style={{ width: '16px', height: '2px', background: 'var(--border)' }} />
                  <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: `7px solid var(--border-strong)` }} />
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
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{active.description}</div>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', background: 'var(--surface)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <strong style={{ color: 'var(--foreground)' }}>How it works: </strong>{active.flow}
                </div>
              </div>
              <div style={{ width: '220px', flexShrink: 0 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>CAPABILITIES</div>
                {active.items.map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '12px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: active.color, fontSize: '10px' }}>●</span> {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* System stats */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px 28px', marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '14px' }}>PLATFORM SCALE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px' }}>
          {[
            { label: '50+ API modules', desc: 'Governance, privacy, catalog, lineage, compliance, incidents, and more', icon: '⚙️', color: '#6366f1' },
            { label: '26 migrations', desc: 'Schema evolution from core DQ tables to full governance + privacy models', icon: '🗃️', color: '#0ea5e9' },
            { label: '70+ ORM models', desc: 'Every domain has its own model hierarchy in app/db/models.py', icon: '📐', color: '#8b5cf6' },
            { label: '50+ frontend pages', desc: 'Next.js 15 App Router — each page has its own API proxy route', icon: '🖥️', color: '#f59e0b' },
            { label: '200+ REST routes', desc: 'FastAPI with JWT + API-key auth, RBAC, and domain isolation', icon: '🔌', color: '#16a34a' },
          ].map(f => (
            <div key={f.label} style={{ background: 'var(--surface-muted)', borderRadius: '10px', padding: '14px 16px', border: `1px solid ${f.color}30` }}>
              <div style={{ fontSize: '20px', marginBottom: '6px' }}>{f.icon}</div>
              <div style={{ fontSize: '12px', color: f.color, fontWeight: 700, marginBottom: '4px' }}>{f.label}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: '1.5' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow walkthroughs */}
      <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--foreground)', marginBottom: '14px' }}>Step-by-Step Workflows</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {workflows.map((wf, i) => (
          <div key={wf.title} style={{ background: 'var(--surface)', border: `1px solid ${wfOpen === i ? wf.color + '60' : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden' }}>
            <div
              onClick={() => setWfOpen(wfOpen === i ? null : i)}
              style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: wfOpen === i ? `${wf.color}08` : 'transparent' }}
            >
              <div style={{ fontWeight: 600, fontSize: '14px', color: wfOpen === i ? wf.color : 'var(--foreground)' }}>{wf.title}</div>
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{wfOpen === i ? '▲' : '▼'}</span>
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
                      <div style={{ flex: 1, paddingTop: '4px', paddingBottom: si < wf.steps.length - 1 ? '8px' : '0', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>{step}</div>
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
