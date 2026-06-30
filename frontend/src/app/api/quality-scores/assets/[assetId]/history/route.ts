import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_QUALITY_HISTORY_MAP, DEMO_QUALITY_SCORE_MAP } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params
  try {
    const days = req.nextUrl.searchParams.get('days')
    const url = days
      ? `${BACKEND}/quality-scores/assets/${assetId}/history?days=${days}`
      : `${BACKEND}/quality-scores/assets/${assetId}/history`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    return NextResponse.json(await res.json().catch(() => ({})))
  } catch {
    const hist = DEMO_QUALITY_HISTORY_MAP[assetId]
    if (hist) return NextResponse.json(hist)
    const score = DEMO_QUALITY_SCORE_MAP[assetId]?.overall_score ?? 80
    return NextResponse.json({ asset_id: assetId, history: [{ score_date: '2026-06-29', overall_score: score }] })
  }
}
