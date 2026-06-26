'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Rule } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

interface RuleRun {
  run_id: string
  status: 'passed' | 'failed' | 'error' | 'skipped'
  quality_score: number | null
}

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  critical: { bg: '#fee2e2', color: '#dc2626' },
  high:     { bg: '#fff7ed', color: '#ea580c' },
  medium:   { bg: '#fef9c3', color: '#ca8a04' },
  low:      { bg: '#f0fdf4', color: '#16a34a' },
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:         { bg: 'var(--status-ok-bg)',      color: 'var(--status-ok-text)' },
  draft:          { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
  pending_review: { bg: 'var(--status-warn-bg)',    color: 'var(--status-warn-text)' },
  disabled:       { bg: '#fff7ed',                  color: '#ea580c' },
  archived:       { bg: 'var(--status-error-bg)',   color: 'var(--status-error-text)' },
}

export default function AssetRulesTab({ assetId }: { assetId: string }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)
  const [lastRuns, setLastRuns] = useState<Record<string, RuleRun>>({})

  useEffect(() => {
    apiFetch(`/api/rules?asset_id=${encodeURIComponent(assetId)}`)
      .then(r => r.json())
      .then((data: unknown) => {
        setRules(Array.isArray(data) ? data as Rule[] : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [assetId])

  async function runRule(rule: Rule) {
    if (rule.status !== 'active') return
    setRunning(rule.id)
    try {
      const res = await apiFetch(`/api/rules/${rule.id}/run`, { method: 'POST' })
      if (res.ok) {
        const run = await res.json() as Record<string, unknown>
        setLastRuns(prev => ({
          ...prev,
          [rule.id]: {
            run_id: String(run.run_id ?? ''),
            status: run.status as RuleRun['status'],
            quality_score: run.quality_score as number | null,
          },
        }))
      }
    } catch { /* silently ignore */ }
    setRunning(null)
  }

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Loading rules…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {rules.length} rule{rules.length !== 1 ? 's' : ''} assigned to this asset
        </div>
        <Link href={`/rules?asset_id=${encodeURIComponent(assetId)}`} style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none' }}>
          Manage rules →
        </Link>
      </div>

      {rules.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
          <div style={{ fontSize: '24px', marginBottom: '6px' }}>📋</div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '4px' }}>No rules assigned</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '10px' }}>
            Assign rules to this asset from the Rules page.
          </div>
          <Link href="/rules" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Go to Rules →
          </Link>
        </div>
      )}

      {rules.map(rule => {
        const sev = SEVERITY_STYLE[rule.severity] ?? SEVERITY_STYLE.medium
        const stat = STATUS_STYLE[rule.status] ?? STATUS_STYLE.draft
        const lastRun = lastRuns[rule.id]
        const canRun = rule.status === 'active'
        const isRunning = running === rule.id

        return (
          <div key={rule.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--foreground)', marginBottom: '3px' }}>
                  {rule.name}
                </div>
                {rule.description && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {rule.description}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--surface-muted)', padding: '1px 6px', borderRadius: '4px' }}>
                    {rule.type.replace(/_/g, ' ')}
                  </span>
                  {rule.columnName && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      .{rule.columnName}
                    </span>
                  )}
                  <span style={{ ...sev, fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    {rule.severity}
                  </span>
                  <span style={{ ...stat, fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                    {rule.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {lastRun?.run_id && (
                  <Link href={`/rule-runs/${lastRun.run_id}`} style={{ textDecoration: 'none' }} title="View run detail">
                    <span style={{
                      fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '6px',
                      background: lastRun.status === 'passed' ? '#dcfce7' : '#fee2e2',
                      color: lastRun.status === 'passed' ? '#16a34a' : '#dc2626',
                    }}>
                      {lastRun.status === 'passed' ? '✓' : '✗'}
                      {lastRun.quality_score != null ? ` ${Math.round(lastRun.quality_score)}%` : ''}
                    </span>
                  </Link>
                )}
                <button
                  onClick={() => runRule(rule)}
                  disabled={!canRun || isRunning}
                  title={canRun ? 'Run rule now' : 'Rule must be Active to run'}
                  style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: 'var(--text-xs)',
                    border: '1px solid', cursor: canRun ? 'pointer' : 'not-allowed',
                    borderColor: canRun ? 'var(--accent-bg)' : 'var(--border)',
                    background: canRun ? 'var(--accent-bg)' : 'var(--surface-muted)',
                    color: canRun ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 600,
                  }}
                >
                  {isRunning ? '⏳' : '▶ Run'}
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
