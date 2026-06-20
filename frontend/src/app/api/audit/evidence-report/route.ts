import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = searchParams.get('days') ?? '30'
    const res = await fetch(`${BACKEND}/audit/evidence-report?days=${days}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: 'Backend error' }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json({ error: 'Unavailable' }, { status: 503 }) }
}
