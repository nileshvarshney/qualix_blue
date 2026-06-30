import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

interface ContinuousConfigEntry {
  connection_id: string; name: string; interval_minutes: number
  freshness_enabled: boolean; volume_enabled: boolean; next_check_at: string | null
}

const MOCK = { connections: [] as ContinuousConfigEntry[] }

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/observability/continuous-config`, { cache: 'no-store', headers: auth ? { authorization: auth } : {} })
    if (!res.ok) return NextResponse.json(MOCK)
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json(MOCK) }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/observability/continuous-config`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    if (!res.ok) return NextResponse.json(MOCK)
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json(MOCK) }
}
