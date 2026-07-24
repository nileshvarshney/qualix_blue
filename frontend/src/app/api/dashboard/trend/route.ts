import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_TREND } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const days = req.nextUrl.searchParams.get('days')
    const connectionId = req.nextUrl.searchParams.get('connection_id')
    const params = new URLSearchParams()
    if (days) params.set('days', days)
    if (connectionId) params.set('connection_id', connectionId)
    const qs = params.toString()
    const url = `${BACKEND}/dashboard/trend${qs ? `?${qs}` : ''}`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json(DEMO_TREND)
    const data = await res.json().catch(() => null)
    if (!data || (Array.isArray(data) && data.length === 0)) return NextResponse.json(DEMO_TREND)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(DEMO_TREND)
  }
}
