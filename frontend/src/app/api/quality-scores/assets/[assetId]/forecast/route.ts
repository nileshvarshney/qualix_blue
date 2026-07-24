import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params
  try {
    const days = req.nextUrl.searchParams.get('days') ?? '30'
    const horizon = req.nextUrl.searchParams.get('horizon') ?? '7'
    const res = await serverFetch(
      req,
      `${BACKEND}/quality-scores/assets/${assetId}/forecast?days=${days}&horizon=${horizon}`,
      { cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    return NextResponse.json(await res.json().catch(() => ({})))
  } catch {
    return NextResponse.json({ asset_id: assetId, history: [], forecast: [], upper_band: [], lower_band: [], insufficient_history: true })
  }
}
