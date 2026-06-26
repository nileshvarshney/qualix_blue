import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const connectionId = req.nextUrl.searchParams.get('connection_id')
    let url = `${BACKEND}/schedules/enriched?limit=200`
    if (connectionId) url += `&connection_id=${encodeURIComponent(connectionId)}`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    const data = await res.json()
    return NextResponse.json(Array.isArray(data) ? data : (data.items ?? []))
  } catch { return NextResponse.json([]) }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, action } = body
    const res = await serverFetch(req, `${BACKEND}/schedules/${id}/${action}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.create) {
      const { create: _, ...payload } = body
      const res = await serverFetch(req, `${BACKEND}/schedules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    }
    // existing run-now path
    const { id } = body
    const res = await serverFetch(req, `${BACKEND}/schedules/${id}/run-now`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
