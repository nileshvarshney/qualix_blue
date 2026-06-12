'use client'
import { useState, useEffect } from 'react'
import { TrendChart } from '@/components/shared/charts'
import TrendDrilldownPanel from '@/components/shared/TrendDrilldownPanel'
import { TrendPoint } from '@/lib/types'

const TIME_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
  { label: 'Last 90 days', days: 90 },
]

interface DomainOption { domain_id: string; domain_name: string }

const selectStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', padding: '6px 10px',
  borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', cursor: 'pointer',
}

export default function DashboardTrendsTab() {
  const [daysLabel, setDaysLabel] = useState('Last 30 days')
  const [domains, setDomains] = useState<DomainOption[]>([])
  const [domainId, setDomainId] = useState('')
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)

  const days = TIME_OPTIONS.find(o => o.label === daysLabel)?.days ?? 30

  useEffect(() => {
    fetch('/api/domains-list')
      .then(r => r.json())
      .then((data: Record<string, unknown>[]) => {
        if (!Array.isArray(data)) return
        setDomains(
          data
            .map(d => ({ domain_id: String(d.domain_id ?? ''), domain_name: String(d.domain_name ?? d.name ?? '') }))
            .filter(d => d.domain_id)
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const url = domainId
      ? `/api/dashboard/history/domain/${domainId}?days=${days}`
      : `/api/dashboard/trend?days=${days}`
    fetch(url)
      .then(r => r.json())
      .then((data: { trend?: TrendPoint[]; history?: TrendPoint[] }) => setTrend(data.trend ?? data.history ?? []))
      .catch(() => setTrend([]))
      .finally(() => setLoading(false))
  }, [days, domainId])

  return (
    <div style={{ padding: '16px 24px', maxWidth: '1300px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--foreground)' }}>Quality, alert &amp; anomaly trends</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <select value={domainId} onChange={e => setDomainId(e.target.value)} style={selectStyle}>
            <option value="">All domains</option>
            {domains.map(d => <option key={d.domain_id} value={d.domain_id}>{d.domain_name}</option>)}
          </select>
          <select value={daysLabel} onChange={e => setDaysLabel(e.target.value)} style={selectStyle}>
            {TIME_OPTIONS.map(o => <option key={o.label} value={o.label}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '18px 20px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Quality trend · {daysLabel}</div>
          <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '3px', background: '#3b82f6', borderRadius: '2px' }} /><span style={{ color: 'var(--text-secondary)' }}>Score</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', opacity: 0.75 }} /><span style={{ color: 'var(--text-secondary)' }}>Failed runs</span></div>
          </div>
        </div>
        {loading
          ? <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>
          : <TrendChart data={trend} onPointClick={setDrilldownDate} />}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Click any point on the chart to see that day&apos;s failed runs, alerts, and anomalies.
        </div>
      </div>
      <TrendDrilldownPanel date={drilldownDate} scope={domainId ? { domainId } : {}} onClose={() => setDrilldownDate(null)} />
    </div>
  )
}
