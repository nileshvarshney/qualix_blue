import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_SLA_PREDICTIONS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const isAtRisk = searchParams.get('is_at_risk')
  try {
    const auth = req.headers.get('Authorization')
    let url = `${BACKEND}/monitoring/sla-predictions`
    if (isAtRisk !== null) url += `?is_at_risk=${encodeURIComponent(isAtRisk)}`
    const res = await serverFetch(req, url, {
      cache: 'no-store',
      headers: { ...(auth ? { Authorization: auth } : {}) },
    })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : [])
  } catch {
    const items = isAtRisk === 'true'
      ? DEMO_SLA_PREDICTIONS.filter(p => p.predicted_breach)
      : isAtRisk === 'false'
      ? DEMO_SLA_PREDICTIONS.filter(p => !p.predicted_breach)
      : DEMO_SLA_PREDICTIONS
    return NextResponse.json(items)
  }
}
