import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_DASHBOARD_DOMAINS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await serverFetch(req, `${BACKEND}/dashboard/domains`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json(DEMO_DASHBOARD_DOMAINS)
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch { return NextResponse.json(DEMO_DASHBOARD_DOMAINS) }
}
