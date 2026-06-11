import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string; runId: string }> },
) {
  const { jobId, runId } = await params
  try {
    const res = await fetch(
      `${BACKEND}/scan-jobs/${jobId}/runs/${runId}/logs`,
      { cache: 'no-store' },
    )
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? []))
  } catch { return NextResponse.json([]) }
}
