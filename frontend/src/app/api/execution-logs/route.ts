import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_EXECUTION_LOGS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const connectionId = req.nextUrl.searchParams.get('connection_id')
  try {
    let url = `${BACKEND}/runs/enriched?limit=200`
    if (connectionId) url += `&connection_id=${encodeURIComponent(connectionId)}`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? []))
  } catch {
    const logs = connectionId
      ? DEMO_EXECUTION_LOGS.filter(l => l.connection_id === connectionId)
      : DEMO_EXECUTION_LOGS
    return NextResponse.json(logs)
  }
}
