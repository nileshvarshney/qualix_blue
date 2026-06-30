import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await serverFetch(req, `${BACKEND}/alert-routing/flap-detection`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ is_enabled: true, flap_threshold: 3, window_minutes: 30, suppress_duration_minutes: 60 })
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json({ is_enabled: true, flap_threshold: 3, window_minutes: 30, suppress_duration_minutes: 60 }) }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/alert-routing/flap-detection`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
