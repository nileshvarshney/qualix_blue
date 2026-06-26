'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import FailedRecordsTable from '@/components/shared/FailedRecordsTable'
import { apiFetch } from '@/lib/apiFetch'

interface FailedRecordsResponse {
  run_id: string | null
  status: string | null
  failed_rows_count: number | null
  total_rows_scanned: number | null
  executed_at: string | null
  samples: Record<string, unknown>[]
  masked_fields: string[]
}

export default function RuleFailedRecordsTab({ ruleId }: { ruleId: string }) {
  const [data, setData] = useState<FailedRecordsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/rules/${ruleId}/failed-records`)
      .then(r => r.json())
      .then((d: FailedRecordsResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [ruleId])

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        Loading failed records…
      </div>
    )
  }

  if (!data || !data.run_id) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', background: 'var(--surface-muted)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
        <div style={{ fontSize: '24px', marginBottom: '6px' }}>✓</div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>No failed records</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
          This rule has no run with failing rows yet.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {data.failed_rows_count?.toLocaleString() ?? 0} of {data.total_rows_scanned?.toLocaleString() ?? '—'} rows failed
          {data.masked_fields.length > 0 && (
            <span> · 🔒 {data.masked_fields.length} column{data.masked_fields.length !== 1 ? 's' : ''} masked for your role</span>
          )}
        </div>
        <Link href={`/rule-runs/${data.run_id}`} style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'none' }}>
          View full run →
        </Link>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
        <FailedRecordsTable records={data.samples} maskedFields={data.masked_fields} emptyMessage="No failing record samples were captured for this run" />
      </div>
    </div>
  )
}
