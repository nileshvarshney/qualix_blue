import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const status = searchParams.get('status')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    let url = `${BACKEND}/scan-jobs/runs?limit=200`
    if (status) url += `&status=${encodeURIComponent(status)}`
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()

    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? []))
  } catch { return NextResponse.json([]) }
}
