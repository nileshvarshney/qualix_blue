import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const connectionId = req.nextUrl.searchParams.get('connection_id')
    let url = `${BACKEND}/runs/enriched?limit=200`
    if (connectionId) url += `&connection_id=${encodeURIComponent(connectionId)}`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? []))
  } catch { return NextResponse.json([]) }
}
