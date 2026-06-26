import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const MOCK = {
  tiers: [
    { domain: 'Finance', tier: 'hot', query_sla: '< 2s', cost_profile: 'High', last_reclassified: '2026-06-01' },
    { domain: 'Marketing', tier: 'warm', query_sla: '< 10s', cost_profile: 'Medium', last_reclassified: '2026-05-15' },
    { domain: 'Operations', tier: 'warm', query_sla: '< 10s', cost_profile: 'Medium', last_reclassified: '2026-05-01' },
    { domain: 'Archive', tier: 'cold', query_sla: '< 60s', cost_profile: 'Low', last_reclassified: '2026-04-01' },
  ],
  notification_recipients: { emails: '', slack_webhook: '' },
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/settings/lifecycle-tiers`, { cache: 'no-store', headers: auth ? { authorization: auth } : {} })
    if (!res.ok) return NextResponse.json(MOCK)
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json(MOCK) }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/settings/lifecycle-tiers`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    if (!res.ok) return NextResponse.json(body)
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json(MOCK) }
}
