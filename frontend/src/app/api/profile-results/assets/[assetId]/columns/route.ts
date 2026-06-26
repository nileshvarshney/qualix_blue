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
      ? `${BACKEND}/profile-results/assets/${assetId}/columns?run_id=${runId}`
      : `${BACKEND}/profile-results/assets/${assetId}/columns`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
