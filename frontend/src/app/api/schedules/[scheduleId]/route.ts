import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const { scheduleId } = await params
  try {
    const body = await req.text()
    const res = await serverFetch(req, `${BACKEND}/schedules/${scheduleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
