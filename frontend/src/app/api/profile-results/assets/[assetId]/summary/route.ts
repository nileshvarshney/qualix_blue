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
    const runId = req.nextUrl.searchParams.get('run_id')
    const url = runId
      ? `${BACKEND}/profile-results/assets/${assetId}/summary?run_id=${runId}`
      : `${BACKEND}/profile-results/assets/${assetId}/summary`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (res.status === 404) return NextResponse.json(null, { status: 404 })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json(null, { status: 500 })
  }
}
