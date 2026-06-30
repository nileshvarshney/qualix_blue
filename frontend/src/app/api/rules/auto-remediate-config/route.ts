import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const MOCK_CONFIG = {
  enabled: false,
  threshold: 80,
  rule_types: ['null_check', 'freshness', 'volume'],
  last_updated: null as string | null,
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/rules/auto-remediate-config`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json(MOCK_CONFIG)
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json(MOCK_CONFIG)
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/rules/auto-remediate-config`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    if (!res.ok) return NextResponse.json({ ...MOCK_CONFIG, ...body, last_updated: new Date().toISOString() })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json(MOCK_CONFIG)
  }
}
