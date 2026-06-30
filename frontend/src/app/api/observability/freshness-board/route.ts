import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_FRESHNESS_BOARD } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('Authorization')
    const connectionId = req.nextUrl.searchParams.get('connection_id')
    let url = `${BACKEND}/observability/freshness-board`
    if (connectionId) url += `?connection_id=${encodeURIComponent(connectionId)}`
    const res = await serverFetch(req, url, {
      cache: 'no-store',
      headers: {
        ...(auth ? { Authorization: auth } : {}),
      },
    })
    if (!res.ok) {
      const filtered = connectionId ? DEMO_FRESHNESS_BOARD.filter(f => f.connection_id === connectionId) : DEMO_FRESHNESS_BOARD
      return NextResponse.json(filtered)
    }
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json(DEMO_FRESHNESS_BOARD)
  }
}
