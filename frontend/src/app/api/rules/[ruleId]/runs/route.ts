import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params
  const limit = req.nextUrl.searchParams.get('limit') ?? '50'
  try {
    const res = await serverFetch(req, `${BACKEND}/rules/${ruleId}/runs?limit=${encodeURIComponent(limit)}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ runs: [], total: 0 }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch (e) { return NextResponse.json({ runs: [], total: 0, error: String(e) }) }
}
