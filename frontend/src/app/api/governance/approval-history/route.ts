import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const MOCK_HISTORY = {
  items: [
    { id: 'ah-1', entity_name: 'Customer PII Policy', entity_type: 'policy', action: 'approved', actor: 'alice@company.com', reason: null, timestamp: '2026-06-20T14:32:00Z' },
    { id: 'ah-2', entity_name: 'orders_fact null check', entity_type: 'rule', action: 'rejected', actor: 'bob@company.com', reason: 'Threshold too aggressive for current data volume', timestamp: '2026-06-19T09:15:00Z' },
    { id: 'ah-3', entity_name: 'Revenue Metric', entity_type: 'glossary_term', action: 'approved', actor: 'alice@company.com', reason: null, timestamp: '2026-06-18T16:44:00Z' },
    { id: 'ah-4', entity_name: 'GDPR Data Contract', entity_type: 'contract', action: 'approved', actor: 'carol@company.com', reason: null, timestamp: '2026-06-17T10:00:00Z' },
  ],
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get('limit') ?? '50'
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/governance/approval-history?limit=${limit}`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json(MOCK_HISTORY)
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json(MOCK_HISTORY)
  }
}
