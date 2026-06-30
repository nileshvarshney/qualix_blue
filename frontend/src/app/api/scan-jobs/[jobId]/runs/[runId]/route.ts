import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; runId: string }> },
) {
  const { jobId, runId } = await params
  try {
    const res = await serverFetch(
      req,
      `${BACKEND}/scan-jobs/${jobId}/runs/${runId}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return NextResponse.json(null, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string; runId: string }> },
) {
  const { jobId, runId } = await params
  try {
    const res = await serverFetch(
      req,
      `${BACKEND}/scan-jobs/${jobId}/runs/${runId}/cancel`,
      { method: 'POST', body: '{}' },
    )
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
