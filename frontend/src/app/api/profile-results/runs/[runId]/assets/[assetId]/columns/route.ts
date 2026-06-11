import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; assetId: string }> }
) {
  const { runId, assetId } = await params
  try {
    const res = await fetch(
      `${BACKEND}/profile-results/runs/${runId}/assets/${assetId}/columns`,
      { cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}
