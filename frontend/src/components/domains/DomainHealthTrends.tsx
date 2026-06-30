'use client'
import { useState, useEffect } from 'react'
import { TrendChart } from '@/components/shared/charts'
import TrendDrilldownPanel from '@/components/shared/TrendDrilldownPanel'
import { TrendPoint } from '@/lib/types'
import { apiFetch } from '@/lib/apiFetch'

export default function DomainHealthTrends({ domainId }: { domainId: string }) {
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/dashboard/history/domain/${domainId}?days=30`)
      .then(r => r.json())
      .then((data: { history?: TrendPoint[] }) => setTrend(data.history ?? []))
      .catch(() => setTrend([]))
      .finally(() => setLoading(false))
  }, [domainId])

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', fontSize: '9px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        Health Trends (30d)
      </div>
      <div style={{ padding: '10px' }}>
        {loading
          ? <div style={{ height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading…</div>
          : <TrendChart data={trend} onPointClick={setDrilldownDate} />}
      </div>
      <TrendDrilldownPanel date={drilldownDate} scope={{ domainId }} onClose={() => setDrilldownDate(null)} />
    </div>
  )
}
