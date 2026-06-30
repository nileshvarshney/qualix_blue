import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_ENRICHED_ASSETS, DEMO_COLUMN_PROFILES_MAP } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params
  try {
    const runId = req.nextUrl.searchParams.get('run_id')
    const url = runId
      ? `${BACKEND}/profile-results/assets/${assetId}/summary?run_id=${runId}`
      : `${BACKEND}/profile-results/assets/${assetId}/summary`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (res.status === 404) throw new Error('not found')
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    const asset = DEMO_ENRICHED_ASSETS.find(a => a.asset_id === assetId)
    if (!asset) return NextResponse.json(null, { status: 404 })
    const cols = DEMO_COLUMN_PROFILES_MAP[assetId]
    return NextResponse.json({
      asset_id: assetId,
      run_id: `demo-run-${assetId}`,
      profiled_at: new Date('2026-06-29T06:00:00Z').toISOString(),
      row_count: asset.row_count,
      column_count: cols ? cols.length : asset.column_count,
      null_pct_avg: cols ? parseFloat((cols.reduce((s, c) => s + c.null_pct, 0) / cols.length).toFixed(2)) : 3.2,
      distinct_count_avg: cols ? Math.round(cols.reduce((s, c) => s + c.distinct_count, 0) / cols.length) : Math.round(asset.row_count * 0.4),
    })
  }
}
