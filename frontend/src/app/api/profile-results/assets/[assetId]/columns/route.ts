import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_COLUMN_PROFILES_MAP, DEMO_ENRICHED_ASSETS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

type RawCol = { column_name: string; data_type: string; null_count: number; null_pct: number; distinct_count: number; distinct_pct: number; min_val?: string; max_val?: string; mean_val?: number; std_dev?: number; sample_values?: string[]; row_count?: number }

function toColumnProfile(col: RawCol, idx: number) {
  const topValues: Record<string, number> = {}
  if (col.sample_values) col.sample_values.forEach((v, i) => { topValues[v] = Math.max(1, col.distinct_count - i * 10) })
  return {
    profiling_id: `demo-cp-${idx}`,
    column_name: col.column_name,
    data_type: col.data_type ?? null,
    null_count: col.null_count ?? null,
    null_ratio: col.null_pct / 100,
    distinct_count: col.distinct_count ?? null,
    distinct_ratio: col.distinct_pct / 100,
    min_value: col.min_val ?? null,
    max_value: col.max_val ?? null,
    avg_value: col.mean_val ?? null,
    std_dev: col.std_dev ?? null,
    top_values: topValues,
    row_count: col.row_count ?? null,
  }
}

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
    if (cols) return NextResponse.json(cols.map(toColumnProfile))
    const asset = DEMO_ENRICHED_ASSETS.find(a => a.asset_id === assetId)
    if (!asset) return NextResponse.json([])
    const generic: RawCol[] = [
      { column_name: 'id',         data_type: 'BIGINT',      null_count: 0,   null_pct: 0,  distinct_count: asset.row_count, distinct_pct: 100 },
      { column_name: 'created_at', data_type: 'TIMESTAMP',   null_count: 0,   null_pct: 0,  distinct_count: asset.row_count, distinct_pct: 100 },
      { column_name: 'updated_at', data_type: 'TIMESTAMP',   null_count: Math.round(asset.row_count * 0.08), null_pct: 8, distinct_count: Math.round(asset.row_count * 0.9), distinct_pct: 90 },
      { column_name: 'status',     data_type: 'VARCHAR(20)', null_count: 0,   null_pct: 0,  distinct_count: 5, distinct_pct: 0, sample_values: ['active','inactive','pending','archived','deleted'] },
    ]
    return NextResponse.json(generic.map(toColumnProfile))
  }
}
