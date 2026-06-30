export type RunStatus = 'passed' | 'failed' | 'warning'
export type StatFilter = 'all' | 'passed' | 'failed' | 'warning'

export interface ExecLog {
  id: string; rule: string; dataset: string; connection: string
  status: RunStatus; score: number; checked: number; failed: number
  duration: string; durationSeconds: number; ts: string; trigger: string; runBy: string
  ruleType: string; failureReason: string; rootCause: string
  impact: string; recommendation: string; query: string; errorSample: string
}

export interface GroupedExecLog {
  id: string; dataset: string; connection: string; ts: string
  status: RunStatus; score: number; checked: number; failed: number
  duration: string; trigger: string; runBy: string
  rules: ExecLog[]
}

const FIVE_MIN_MS = 5 * 60 * 1000
const STATUS_RANK: Record<RunStatus, number> = { passed: 0, warning: 1, failed: 2 }

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function mapExecLog(l: Record<string, unknown>, i: number): ExecLog {
  const durationMs = Number(l.duration_ms ?? l.duration_seconds_ms ?? 0)
  const durationSeconds = durationMs ? durationMs / 1000 : Number(l.duration_seconds ?? 0)
  const dataset = [l.sf_database_name, l.sf_schema_name, l.sf_table_name]
    .filter(Boolean)
    .join('.')
  return {
    id:            String(l.run_id ?? l.id ?? i),
    rule:          String(l.rule_name ?? l.rule ?? ''),
    dataset:       dataset || String(l.asset_name ?? l.dataset ?? ''),
    connection:    String(l.connection_name ?? l.connection ?? ''),
    status:        (l.status === 'error' ? 'failed' : l.status as RunStatus) ?? 'passed',
    score:         Number(l.quality_score ?? l.score ?? 100),
    checked:       Number(l.total_rows_scanned ?? l.checked_rows ?? l.checked ?? 0),
    failed:        Number(l.failed_rows_count ?? l.failed_rows ?? l.failed ?? 0),
    duration:      durationSeconds ? formatDuration(durationSeconds * 1000) : String(l.duration ?? '—'),
    durationSeconds,
    ts:            String(l.execution_start_time ?? l.started_at ?? l.ts ?? ''),
    trigger:       String(l.trigger_type ?? l.trigger ?? 'Scheduled'),
    runBy:         String(l.run_by ?? l.runBy ?? 'scheduler'),
    ruleType:      String(l.rule_type ?? l.ruleType ?? ''),
    failureReason: String(l.error_message ?? l.failure_reason ?? l.failureReason ?? ''),
    rootCause:     String(l.ai_explanation ?? l.root_cause ?? l.rootCause ?? ''),
    impact:        String(l.impact ?? ''),
    recommendation: String(l.recommendation ?? ''),
    query:         String(l.executed_sql ?? l.rule_query ?? l.query ?? ''),
    errorSample:   String(l.error_message ?? l.error_sample ?? l.errorSample ?? ''),
  }
}

function buildGroup(rules: ExecLog[]): GroupedExecLog {
  const first = rules[0]
  const status = rules.reduce<RunStatus>(
    (acc, r) => (STATUS_RANK[r.status] > STATUS_RANK[acc] ? r.status : acc),
    'passed',
  )
  const checked = rules.reduce((s, r) => s + r.checked, 0)
  const failed  = rules.reduce((s, r) => s + r.failed, 0)
  const score   = Math.round(rules.reduce((s, r) => s + r.score, 0) / rules.length)
  const totalDurationSeconds = Math.round(rules.reduce((s, r) => s + r.durationSeconds, 0) * 10) / 10

  return {
    id: first.id,
    dataset: first.dataset,
    connection: first.connection,
    ts: first.ts,
    status,
    score,
    checked,
    failed,
    duration: totalDurationSeconds > 0 ? `${totalDurationSeconds}s` : '—',
    trigger: first.trigger,
    runBy: first.runBy,
    rules,
  }
}

/**
 * Groups rule runs into job executions: runs for the same table/view whose
 * start times fall within 5 minutes of the previous run (within that table's
 * sequence) are treated as one job execution.
 */
export function groupExecLogs(logs: ExecLog[]): GroupedExecLog[] {
  const byAsset = new Map<string, ExecLog[]>()
  for (const l of logs) {
    const key = `${l.connection}::${l.dataset}`
    const existing = byAsset.get(key)
    if (existing) existing.push(l)
    else byAsset.set(key, [l])
  }

  const groups: GroupedExecLog[] = []
  for (const items of byAsset.values()) {
    const sorted = [...items].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
    let current: ExecLog[] = []
    let prevTime = 0

    for (const l of sorted) {
      const t = new Date(l.ts).getTime()
      if (current.length > 0 && t - prevTime > FIVE_MIN_MS) {
        groups.push(buildGroup(current))
        current = []
      }
      current.push(l)
      prevTime = t
    }
    if (current.length > 0) groups.push(buildGroup(current))
  }

  return groups.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
}
