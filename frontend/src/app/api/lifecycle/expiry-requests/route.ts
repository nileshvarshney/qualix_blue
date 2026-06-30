import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const MOCK = {
  requests: [
    { id: 'exp-1', dataset: 'customer_dim_2023', domain: 'Finance', expires_at: '2026-07-15', days_remaining: 24, recommended_action: 'approve', status: 'pending' },
    { id: 'exp-2', dataset: 'orders_staging_q1', domain: 'Operations', expires_at: '2026-06-28', days_remaining: 7, recommended_action: 'extend', status: 'pending' },
    { id: 'exp-3', dataset: 'marketing_campaigns_2022', domain: 'Marketing', expires_at: '2026-07-01', days_remaining: 10, recommended_action: 'exempt', status: 'pending' },
  ],
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/lifecycle/expiry-requests`, { cache: 'no-store', headers: auth ? { authorization: auth } : {} })
    if (!res.ok) return NextResponse.json(MOCK)
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json(MOCK) }
}
