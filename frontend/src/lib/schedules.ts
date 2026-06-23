export type LastRunStatus = 'passed' | 'failed' | 'warning'
export type ScheduleStatus = 'active' | 'paused'

export interface RunIssue {
  rule: string
  severity: 'critical' | 'warning' | 'info'
  detail: string
  impact: string
  failedRows: string
}

export interface BundledRule {
  ruleId: string
  ruleName: string
  ruleDescription: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'active' | 'disabled'
  lastRunStatus: LastRunStatus | null
  lastRunAt: string | null
  lastDurationMs: number | null
  nextRun: string | null
  failedRowsCount: number | null
  totalRowsScanned: number | null
  failurePercentage: number | null
  errorMessage: string | null
  aiExplanation: string | null
}

export interface Schedule {
  id: string; name: string; dataset: string; tableFqn: string; cron: string; human: string
  frequency: string; runAtHour: number | null; runAtMinute: number | null
  rules: number; lastRun: string; nextRun: string; status: ScheduleStatus
  lastRunStatus: LastRunStatus | null; lastDuration: string; connection: string
  owner: string; failedRules: number; checkedRows: string; failedRows: string
  issues: RunIssue[]; bundledRules: BundledRule[]
}

export const SEV_CFG = {
  critical: { color: '#dc2626', bg: '#fee2e2', label: 'Critical' },
  warning:  { color: '#d97706', bg: '#fef3c7', label: 'Warning'  },
  info:     { color: '#2563eb', bg: '#dbeafe', label: 'Info'     },
}

export const RUN_STYLE: Record<LastRunStatus, { background: string; color: string }> = {
  passed:  { background: '#f0fdf4', color: '#16a34a' },
  failed:  { background: '#fee2e2', color: '#dc2626' },
  warning: { background: '#fef3c7', color: '#d97706' },
}

export const STATUS_STYLE: Record<ScheduleStatus, { background: string; color: string }> = {
  active: { background: '#f0fdf4', color: '#16a34a' },
  paused: { background: 'var(--surface-muted)', color: 'var(--text-muted)' },
}

export const RULE_SEV_CFG: Record<BundledRule['severity'], { color: string; bg: string }> = {
  critical: { color: '#dc2626', bg: '#fee2e2' },
  high:     { color: '#d97706', bg: '#fef3c7' },
  medium:   { color: '#2563eb', bg: '#dbeafe' },
  low:      { color: 'var(--text-muted)', bg: 'var(--surface-muted)' },
}

function mapLastRunStatus(value: unknown): LastRunStatus | null {
  if (value === 'passed' || value === 'warning') return value
  if (value === 'failed' || value === 'error') return 'failed'
  return null
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const secs = ms / 1000
  if (secs < 60) return `${secs.toFixed(1)}s`
  const mins = Math.floor(secs / 60)
  const remSecs = Math.round(secs % 60)
  return `${mins}m ${remSecs}s`
}

export function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function mapSchedule(s: Record<string, unknown>, i: number): Schedule {
  const dataset = String(s.asset_name ?? s.dataset ?? '')
  const tableFqn = [s.asset_database, s.asset_schema, s.asset_name]
    .filter(v => typeof v === 'string' && v)
    .join('.') || dataset || '(unscoped)'

  const bundledRules: BundledRule[] = Array.isArray(s.bundled_rules) ? (s.bundled_rules as Record<string, unknown>[]).map(r => ({
    ruleId: String(r.rule_id ?? ''),
    ruleName: String(r.rule_name ?? ''),
    ruleDescription: String(r.rule_description ?? ''),
    severity: (r.severity ?? 'medium') as BundledRule['severity'],
    status: (r.status === 'disabled' ? 'disabled' : 'active') as BundledRule['status'],
    lastRunStatus: mapLastRunStatus(r.last_run_status),
    lastRunAt: typeof r.last_run_at === 'string' ? r.last_run_at : null,
    lastDurationMs: typeof r.last_duration_ms === 'number' ? r.last_duration_ms : null,
    nextRun: typeof r.next_run === 'string' ? r.next_run : null,
    failedRowsCount: typeof r.failed_rows_count === 'number' ? r.failed_rows_count : null,
    totalRowsScanned: typeof r.total_rows_scanned === 'number' ? r.total_rows_scanned : null,
    failurePercentage: typeof r.failure_percentage === 'number' ? r.failure_percentage : null,
    errorMessage: typeof r.error_message === 'string' ? r.error_message : null,
    aiExplanation: typeof r.ai_explanation === 'string' ? r.ai_explanation : null,
  })) : []

  // The schedule object itself carries no last-run info — only its bundled rules do.
  // Derive the schedule-level "last run" from whichever bundled rule ran most recently,
  // and only report a status/timestamp if at least one rule has actually run.
  const ranRules = bundledRules.filter(r => r.lastRunAt !== null)
  const mostRecent = ranRules.length > 0
    ? ranRules.reduce((a, b) => (a.lastRunAt! > b.lastRunAt! ? a : b))
    : null
  const failedRules = bundledRules.filter(r => r.lastRunStatus === 'failed').length
  const warningRules = bundledRules.filter(r => r.lastRunStatus === 'warning').length
  const lastRunStatus: LastRunStatus | null = mostRecent === null
    ? null
    : failedRules > 0 ? 'failed' : warningRules > 0 ? 'warning' : 'passed'

  return {
    id:            String(s.schedule_id ?? s.id ?? i),
    name:          String(s.schedule_name ?? s.name ?? ''),
    dataset,
    tableFqn,
    cron:          String(s.cron_expression ?? s.cron ?? ''),
    human:         String(s.human_readable ?? s.human ?? s.cron_expression ?? ''),
    frequency:     String(s.frequency ?? 'daily'),
    runAtHour:     s.run_at_hour === null || s.run_at_hour === undefined ? null : Number(s.run_at_hour),
    runAtMinute:   s.run_at_minute === null || s.run_at_minute === undefined ? null : Number(s.run_at_minute),
    rules:         Number(s.rule_count ?? s.rules ?? 0),
    lastRun:       String(s.last_run_at ?? s.lastRun ?? mostRecent?.lastRunAt ?? '—'),
    nextRun:       String(s.next_run_at ?? s.nextRun ?? '—'),
    status:        (s.is_active ? 'active' : 'paused') as ScheduleStatus,
    lastRunStatus,
    lastDuration:  mostRecent?.lastDurationMs != null ? formatDuration(mostRecent.lastDurationMs) : String(s.last_duration ?? s.lastDuration ?? '—'),
    connection:    String(s.connection_name ?? s.connection ?? '(no connection)'),
    owner:         String(s.owner ?? ''),
    failedRules:   Number(s.failed_rules ?? s.failedRules ?? failedRules),
    checkedRows:   String(s.checked_rows ?? s.checkedRows ?? '0'),
    failedRows:    String(s.failed_rows ?? s.failedRows ?? '0'),
    issues:        Array.isArray(s.issues) ? s.issues as RunIssue[] : [],
    bundledRules,
  }
}
