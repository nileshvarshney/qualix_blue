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
    const days = req.nextUrl.searchParams.get('days')
    const url = days
      ? `${BACKEND}/quality-scores/assets/${assetId}/history?days=${days}`
      : `${BACKEND}/quality-scores/assets/${assetId}/history`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
