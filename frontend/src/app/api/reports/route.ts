import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const connectionId = req.nextUrl.searchParams.get('connection_id')
    let url = `${BACKEND}/executions?limit=50`
    if (connectionId) url += `&connection_id=${encodeURIComponent(connectionId)}`
    const res = await serverFetch(req, url, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const rulesRes = await serverFetch(req, `${BACKEND}/rules?is_active=true&limit=1000`, { cache: 'no-store' })
    if (!rulesRes.ok) {
      return NextResponse.json({ error: 'Failed to load active rules' }, { status: 502 })
    }
    const { items } = await rulesRes.json() as { items: { rule_id: string }[] }
    const ruleIds = items.map(r => r.rule_id)
    if (ruleIds.length === 0) {
      return NextResponse.json({ message: 'No active rules to run', total: 0 })
    }

    const execRes = await serverFetch(req, `${BACKEND}/rules/bulk/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_ids: ruleIds }),
      cache: 'no-store',
    })
    const data = await execRes.json().catch(() => ({}))
    if (!execRes.ok) {
      return NextResponse.json(data, { status: execRes.status })
    }
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
