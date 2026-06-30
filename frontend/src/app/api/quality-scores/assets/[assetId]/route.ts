import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_QUALITY_SCORE_MAP } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params
  try {
    const res = await serverFetch(req, `${BACKEND}/quality-scores/assets/${assetId}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch {
    const score = DEMO_QUALITY_SCORE_MAP[assetId]
    if (score) return NextResponse.json(score)
    return NextResponse.json({ asset_id: assetId, overall_score: 80, dimensions: {}, score_date: new Date('2026-06-29').toISOString().slice(0, 10) })
  }
}
