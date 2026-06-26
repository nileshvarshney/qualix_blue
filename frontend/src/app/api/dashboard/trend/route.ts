import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

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
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
