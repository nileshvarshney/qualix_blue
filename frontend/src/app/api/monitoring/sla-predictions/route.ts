import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('Authorization')
    const { searchParams } = req.nextUrl
    const isAtRisk = searchParams.get('is_at_risk')
    let url = `${BACKEND}/monitoring/sla-predictions`
    if (isAtRisk !== null) url += `?is_at_risk=${encodeURIComponent(isAtRisk)}`
    const res = await serverFetch(req, url, {
      cache: 'no-store',
      headers: {
        ...(auth ? { Authorization: auth } : {}),
      },
    })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    return NextResponse.json([])
  }
}
