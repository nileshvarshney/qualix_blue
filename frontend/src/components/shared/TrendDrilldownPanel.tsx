'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TrendScope, DayDetail } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

const rowLink: React.CSSProperties = {
  display: 'block', padding: '6px 10px', fontSize: '12px', color: 'var(--foreground)',
  textDecoration: 'none', borderBottom: '1px solid var(--surface-muted)',
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    critical: { bg: 'var(--status-error-bg)', color: 'var(--status-error-text)' },
    high:     { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)' },
    medium:   { bg: 'var(--status-warn-bg)',  color: 'var(--status-warn-text)' },
    low:      { bg: 'var(--status-neutral-bg)', color: 'var(--status-neutral-text)' },
  }
  const c = colors[severity] ?? colors.low
  return <span style={{ background: c.bg, color: c.color, padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginLeft: '6px' }}>{severity}</span>
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        {title}
      </div>
      {count === 0
        ? <div style={{ padding: '10px', fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{empty}</div>
        : <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>}
    </div>
  )
}

export default function TrendDrilldownPanel({ date, scope, onClose }: {
  date: string | null
  scope: TrendScope
  onClose: () => void
}) {
  const [detail, setDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!date) { setDetail(null); return }
    setLoading(true)
    const params = new URLSearchParams({ date })
    if (scope.assetId) params.set('asset_id', scope.assetId)
    else if (scope.subdomainId) params.set('subdomain_id', scope.subdomainId)
    else if (scope.domainId) params.set('domain_id', scope.domainId)
    apiFetch(`/api/dashboard/day-detail?${params.toString()}`)
      .then(r => r.json())
      .then((d: DayDetail) => setDetail(
        Array.isArray(d?.failed_runs) && Array.isArray(d?.alerts) && Array.isArray(d?.anomalies) ? d : null
      ))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [date, scope.assetId, scope.subdomainId, scope.domainId])

  if (!date) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 199, cursor: 'pointer' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,55vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)', display: 'flex', flexDirection: 'column', zIndex: 200, overflowY: 'auto' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontWeight: 700, fontSize: '13px', flex: 1, color: 'var(--foreground)' }}>{date}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '20px' }}>Loading…</div>}
          {!loading && detail && (
            <>
              <Section title={`Failed Runs (${detail.failed_runs.length})`} count={detail.failed_runs.length} empty="No failed runs on this date.">
                {detail.failed_runs.map(r => (
                  <Link key={r.run_id} href={`/rule-runs/${r.run_id}`} style={rowLink}>
                    <span style={{ fontWeight: 600 }}>{r.rule_name}</span>
                    <span style={{ color: 'var(--text-muted)' }}> · {r.table_name}</span>
                    {r.failed_rows_count != null && <span style={{ color: 'var(--status-error-text)' }}> · {r.failed_rows_count} failed rows</span>}
                  </Link>
                ))}
              </Section>
              <Section title={`Alerts (${detail.alerts.length})`} count={detail.alerts.length} empty="No alerts on this date.">
                {detail.alerts.map(a => (
                  <Link key={a.alert_id} href="/alerts" style={rowLink}>
                    {a.alert_type}
                    <SeverityBadge severity={a.severity} />
                    <span style={{ color: 'var(--text-muted)' }}> · {a.alert_status}</span>
                  </Link>
                ))}
              </Section>
              <Section title={`Anomalies (${detail.anomalies.length})`} count={detail.anomalies.length} empty="No anomalies on this date.">
                {detail.anomalies.map(d => (
                  <Link key={d.detection_id} href="/anomalies" style={rowLink}>
                    <span style={{ fontWeight: 600 }}>{d.anomaly_type ?? 'anomaly'}</span>
                    {d.severity && <SeverityBadge severity={d.severity} />}
                    {d.confidence != null && <span style={{ color: 'var(--text-muted)' }}> · {Math.round(d.confidence * 100)}% confidence</span>}
                  </Link>
                ))}
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  )
}
