'use client'
import { useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import {
  Schedule, BundledRule, SEV_CFG, RUN_STYLE, RULE_SEV_CFG,
  formatDuration, formatTimestamp,
} from '@/lib/schedules'

interface ScheduleJobTreeProps {
  schedule: Schedule
  runningRuleId: string | null
  onRunRule: (ruleId: string) => void
  pausingRuleId: string | null
  onSetRuleStatus: (ruleId: string, status: 'active' | 'disabled') => void
}

interface JobRun {
  runId: string
  status: string
  qualityScore: number | null
  failedRowsCount: number | null
  totalRowsScanned: number | null
  failurePercentage: number | null
  createdAt: string
  startTime: string | null
  endTime: string | null
}

function mapJobRun(r: Record<string, unknown>): JobRun {
  return {
    runId: String(r.run_id ?? ''),
    status: String(r.status ?? ''),
    qualityScore: typeof r.quality_score === 'number' ? r.quality_score : null,
    failedRowsCount: typeof r.failed_rows_count === 'number' ? r.failed_rows_count : null,
    totalRowsScanned: typeof r.total_rows_scanned === 'number' ? r.total_rows_scanned : null,
    failurePercentage: typeof r.failure_percentage === 'number' ? r.failure_percentage : null,
    createdAt: String(r.created_at ?? ''),
    startTime: typeof r.execution_start_time === 'string' ? r.execution_start_time : null,
    endTime: typeof r.execution_end_time === 'string' ? r.execution_end_time : null,
  }
}

function jobRunStyle(status: string): { background: string; color: string } {
  if (status === 'passed') return RUN_STYLE.passed
  if (status === 'warning') return RUN_STYLE.warning
  return RUN_STYLE.failed
}

function jobDuration(run: JobRun): string {
  if (!run.startTime || !run.endTime) return '—'
  const ms = new Date(run.endTime).getTime() - new Date(run.startTime).getTime()
  return Number.isFinite(ms) && ms >= 0 ? formatDuration(ms) : '—'
}

function ruleFailureDetail(rule: BundledRule): { rootCause: string; impact: string | null } {
  if (rule.aiExplanation) {
    return { rootCause: rule.aiExplanation, impact: rule.errorMessage }
  }
  if (rule.failedRowsCount != null && rule.totalRowsScanned != null) {
    const pct = rule.failurePercentage != null
      ? rule.failurePercentage.toFixed(1)
      : ((rule.failedRowsCount / Math.max(rule.totalRowsScanned, 1)) * 100).toFixed(1)
    return {
      rootCause: `${rule.failedRowsCount.toLocaleString()} / ${rule.totalRowsScanned.toLocaleString()} rows (${pct}%) failed this rule's check.`,
      impact: rule.errorMessage,
    }
  }
  if (rule.errorMessage) return { rootCause: rule.errorMessage, impact: null }
  return { rootCause: 'No additional detail available.', impact: null }
}

export default function ScheduleJobTree({
  schedule, runningRuleId, onRunRule, pausingRuleId, onSetRuleStatus,
}: ScheduleJobTreeProps) {
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)
  const [expandedJobsRuleId, setExpandedJobsRuleId] = useState<string | null>(null)
  const [jobHistory, setJobHistory] = useState<Record<string, JobRun[] | 'loading' | 'error'>>({})

  async function toggleJobs(ruleId: string) {
    if (expandedJobsRuleId === ruleId) {
      setExpandedJobsRuleId(null)
      return
    }
    setExpandedJobsRuleId(ruleId)
    if (jobHistory[ruleId] && jobHistory[ruleId] !== 'error') return
    setJobHistory(prev => ({ ...prev, [ruleId]: 'loading' }))
    try {
      const res = await apiFetch(`/api/rules/${ruleId}/runs?limit=10`)
      const data = await res.json()
      setJobHistory(prev => ({ ...prev, [ruleId]: Array.isArray(data.runs) ? data.runs.map(mapJobRun) : [] }))
    } catch {
      setJobHistory(prev => ({ ...prev, [ruleId]: 'error' }))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        {schedule.bundledRules.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            No rules scheduled for this table
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {schedule.bundledRules.map(rule => {
            const rc = RULE_SEV_CFG[rule.severity]
            const isPaused = rule.status === 'disabled'
            const isRunning = runningRuleId === rule.ruleId
            const isPausing = pausingRuleId === rule.ruleId
            const isFailed = rule.lastRunStatus === 'failed'
            const isExpanded = expandedRuleId === rule.ruleId
            const resultBadge = rule.lastRunStatus ? RUN_STYLE[rule.lastRunStatus] : null

            const jobsExpanded = expandedJobsRuleId === rule.ruleId

            return (
              <div key={rule.ruleId} style={{ marginLeft: '10px', paddingLeft: '12px', borderLeft: '2px solid var(--border)' }}>
                <div style={{ background: isPaused ? 'var(--surface-muted)' : 'var(--surface)', border: `1px solid ${isFailed ? '#fecaca' : 'var(--border)'}`, borderRadius: '6px', padding: '8px 10px', opacity: isPaused ? 0.65 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: rc.bg, color: rc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
                      {rule.severity}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--foreground)' }}>{rule.ruleName}</span>
                    {isPaused && (
                      <span style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 700 }}>
                        Paused
                      </span>
                    )}
                    {rule.ruleDescription && (
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {rule.ruleDescription}
                      </span>
                    )}
                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0, marginLeft: 'auto' }}>
                      <button onClick={() => onRunRule(rule.ruleId)} disabled={isRunning}
                        title="Run this rule now"
                        style={{ padding: '2px 8px', borderRadius: '5px', border: '1px solid #dbeafe', background: isRunning ? '#eff6ff' : 'var(--surface)', color: '#2563eb', fontSize: '10px', cursor: isRunning ? 'not-allowed' : 'pointer' }}>
                        {isRunning ? '⏳' : '▶ Run'}
                      </button>
                      <button onClick={() => onSetRuleStatus(rule.ruleId, isPaused ? 'active' : 'disabled')} disabled={isPausing}
                        title={isPaused ? 'Unpause this rule' : 'Pause this rule'}
                        style={{ padding: '2px 8px', borderRadius: '5px', border: isPaused ? '1px solid #bbf7d0' : '1px solid var(--border)', background: isPaused ? '#f0fdf4' : 'var(--surface)', color: isPaused ? '#16a34a' : 'var(--text-secondary)', fontSize: '10px', cursor: isPausing ? 'not-allowed' : 'pointer' }}>
                        {isPausing ? '⏳' : isPaused ? '▶' : '⏸'}
                      </button>
                      <button onClick={() => toggleJobs(rule.ruleId)}
                        title="View recent job runs"
                        style={{ padding: '2px 8px', borderRadius: '5px', border: '1px solid var(--border)', background: jobsExpanded ? 'var(--surface-muted)' : 'var(--surface)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}>
                        {jobsExpanded ? '▾' : '▸'} Jobs
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {!rule.lastRunAt && <span>Never run</span>}
                    {rule.lastRunAt && <span>Last run: {formatTimestamp(rule.lastRunAt)}</span>}
                    {resultBadge && (
                      isFailed ? (
                        <span onClick={() => setExpandedRuleId(isExpanded ? null : rule.ruleId)}
                          style={{ ...resultBadge, padding: '1px 6px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
                          ✕ failed{rule.failedRowsCount != null ? ` · ${rule.failedRowsCount.toLocaleString()} rows` : ''} {isExpanded ? '▴' : '▾'}
                        </span>
                      ) : (
                        <span style={{ ...resultBadge, padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          {rule.lastRunStatus === 'passed' ? '✓' : '⚠'} {rule.lastRunStatus}
                        </span>
                      )
                    )}
                    <span>Next run: {rule.nextRun ? formatTimestamp(rule.nextRun) : '—'}</span>
                    <span style={{ fontFamily: 'monospace' }}>Duration: {formatDuration(rule.lastDurationMs)}</span>
                  </div>
                </div>

                {isExpanded && isFailed && (() => {
                  const { rootCause, impact } = ruleFailureDetail(rule)
                  return (
                    <div style={{ marginTop: '4px', display: 'grid', gridTemplateColumns: impact ? '1fr 1fr' : '1fr', gap: '8px' }}>
                      <div style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>
                        {rootCause}
                      </div>
                      {impact && (
                        <div style={{ background: '#fee2e288', borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 700, color: '#dc2626', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>
                          {impact}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {jobsExpanded && (() => {
                  const history = jobHistory[rule.ruleId]
                  return (
                    <div style={{ marginTop: '4px', marginLeft: '14px', paddingLeft: '12px', borderLeft: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {history === 'loading' && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 0' }}>Loading job history…</div>
                      )}
                      {history === 'error' && (
                        <div style={{ fontSize: '10px', color: 'var(--status-error-text)', padding: '4px 0' }}>Failed to load job history.</div>
                      )}
                      {Array.isArray(history) && history.length === 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '4px 0' }}>No job runs recorded yet.</div>
                      )}
                      {Array.isArray(history) && history.map(run => {
                        const jrs = jobRunStyle(run.status)
                        return (
                          <div key={run.runId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontSize: '10px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            <span style={{ ...jrs, padding: '1px 6px', borderRadius: '4px', fontWeight: 600, flexShrink: 0 }}>
                              {run.status === 'passed' ? '✓' : run.status === 'warning' ? '⚠' : '✕'} {run.status}
                            </span>
                            <span style={{ fontFamily: 'monospace' }}>{formatTimestamp(run.createdAt)}</span>
                            <span>{run.qualityScore != null ? `${run.qualityScore.toFixed(1)}%` : '—'}</span>
                            <span style={{ fontFamily: 'monospace' }}>{jobDuration(run)}</span>
                            {run.failedRowsCount != null && run.failedRowsCount > 0 && (
                              <span style={{ color: 'var(--status-error-text)' }}>
                                {run.failedRowsCount.toLocaleString()}{run.totalRowsScanned != null ? ` / ${run.totalRowsScanned.toLocaleString()}` : ''} rows failed
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>

      {schedule.issues.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--foreground)' }}>Last Run Issues</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{schedule.checkedRows} checked · {schedule.failedRows} failed · {schedule.lastDuration}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {schedule.issues.map((issue, j) => {
              const sc = SEV_CFG[issue.severity]
              return (
                <div key={j} style={{ background: 'var(--surface)', border: `1px solid ${sc.color}30`, borderLeft: `3px solid ${sc.color}`, borderRadius: '6px', padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ background: sc.bg, color: sc.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>{sc.label}</span>
                    <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--foreground)' }}>{issue.rule}</span>
                    <span style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: '10px', color: 'var(--status-error-text)', fontWeight: 600 }}>{issue.failedRows} rows</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div style={{ background: 'var(--surface-muted)', borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Root Cause · </span>
                      {issue.detail}
                    </div>
                    <div style={{ background: `${sc.bg}88`, borderRadius: '6px', padding: '8px 10px', fontSize: '10.5px', color: 'var(--foreground)', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: sc.color, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact · </span>
                      {issue.impact}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
