import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const status = searchParams.get('status')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const connectionId = searchParams.get('connection_id')

    let url = `${BACKEND}/scan-jobs/runs?limit=200`
    if (status) url += `&status=${encodeURIComponent(status)}`
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`
    if (connectionId) url += `&connection_id=${encodeURIComponent(connectionId)}`

    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()

    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? []))
  } catch { return NextResponse.json([]) }
}
