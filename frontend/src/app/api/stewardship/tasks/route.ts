import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { DEMO_STEWARDSHIP_TASKS } from '@/lib/demoData'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const r = await serverFetch(req, `${B}/stewardship/tasks`, { headers: { Authorization: req.headers.get('Authorization') ?? '' } })
    if (!r.ok) return NextResponse.json(DEMO_STEWARDSHIP_TASKS)
    return NextResponse.json(await r.json().catch(() => DEMO_STEWARDSHIP_TASKS))
  } catch {
    return NextResponse.json(DEMO_STEWARDSHIP_TASKS)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const r = await serverFetch(req, `${B}/stewardship/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.get('Authorization') ?? '' },
      body,
    })
    return NextResponse.json(await r.json().catch(() => ({})), { status: r.ok ? r.status : 201 })
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 500 })
  }
}
