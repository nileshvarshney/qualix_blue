import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_COLUMN_PROFILES_MAP, DEMO_ENRICHED_ASSETS } from '@/lib/demoData'

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
      ? `${BACKEND}/profile-results/assets/${assetId}/columns?run_id=${runId}`
      : `${BACKEND}/profile-results/assets/${assetId}/columns`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    return NextResponse.json(await res.json())
  } catch {
    const cols = DEMO_COLUMN_PROFILES_MAP[assetId]
    if (cols) return NextResponse.json(cols)
    // Generate generic columns from enriched asset metadata
    const asset = DEMO_ENRICHED_ASSETS.find(a => a.asset_id === assetId)
    if (!asset) return NextResponse.json([])
    return NextResponse.json([
      { column_name: 'id',         data_type: 'BIGINT',       null_count: 0, null_pct: 0,   distinct_count: asset.row_count, distinct_pct: 100 },
      { column_name: 'created_at', data_type: 'TIMESTAMP',    null_count: 0, null_pct: 0,   distinct_count: asset.row_count, distinct_pct: 100 },
      { column_name: 'updated_at', data_type: 'TIMESTAMP',    null_count: Math.round(asset.row_count * 0.08), null_pct: 8, distinct_count: Math.round(asset.row_count * 0.9), distinct_pct: 90 },
      { column_name: 'status',     data_type: 'VARCHAR(20)',  null_count: 0, null_pct: 0,   distinct_count: 5, distinct_pct: 0, sample_values: ['active','inactive','pending','archived','deleted'] },
    ])
  }
}
