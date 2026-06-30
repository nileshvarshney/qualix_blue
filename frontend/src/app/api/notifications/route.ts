import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_NOTIFICATIONS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const res = await serverFetch(req, `${BACKEND}/notifications`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    const data = await res.json()
    if (!Array.isArray(data)) return NextResponse.json(DEMO_NOTIFICATIONS)
    return NextResponse.json(data)
  } catch { return NextResponse.json(DEMO_NOTIFICATIONS) }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') // "read-all" or left empty for single read
    const id = searchParams.get('id')
    const auth = req.headers.get('authorization') || ''
    const endpoint = action === 'read-all'
      ? `${BACKEND}/notifications/read-all`
      : `${BACKEND}/notifications/${id}/read`
    const res = await serverFetch(req, endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
