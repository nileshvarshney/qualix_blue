'use client'
import { useState, useEffect } from 'react'
import { TrendChart } from '@/components/shared/charts'
import TrendDrilldownPanel from '@/components/shared/TrendDrilldownPanel'
import { TrendPoint } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

const DAY_OPTIONS = [30, 60, 90]

export default function AssetTrendsTab({ assetId }: { assetId: string }) {
  const [days, setDays] = useState(30)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/dashboard/history/table/${assetId}?days=${days}`)
      .then(r => r.json())
      .then((data: { history?: TrendPoint[] }) => setTrend(data.history ?? []))
      .catch(() => setTrend([]))
      .finally(() => setLoading(false))
  }, [assetId, days])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>Quality, alert &amp; anomaly trend</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {DAY_OPTIONS.map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', cursor: 'pointer',
              border: '1px solid var(--border)',
              background: days === d ? 'var(--accent-bg)' : 'var(--surface)',
              color: days === d ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: days === d ? 600 : 400,
            }}>{d}d</button>
          ))}
        </div>
      </div>
      {loading
        ? <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Loading…</div>
        : <TrendChart data={trend} onPointClick={setDrilldownDate} />}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        Click any point on the chart to see that day&apos;s failed runs, alerts, and anomalies for this asset.
      </div>
      <TrendDrilldownPanel date={drilldownDate} scope={{ assetId }} onClose={() => setDrilldownDate(null)} />
    </div>
  )
}
