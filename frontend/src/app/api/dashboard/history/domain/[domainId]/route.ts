import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ domainId: string }> }
) {
  const { domainId } = await params
  try {
    const days = req.nextUrl.searchParams.get('days')
    const url = days
      ? `${BACKEND}/dashboard/history/domain/${domainId}?days=${days}`
      : `${BACKEND}/dashboard/history/domain/${domainId}`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
