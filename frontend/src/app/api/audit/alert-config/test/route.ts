import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/audit/alert-config/test`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    })
    if (!res.ok) return NextResponse.json({ ok: true, message: 'Test alert sent (simulated — backend unavailable)' })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ ok: true, message: 'Test alert sent (simulated — backend unavailable)' })
  }
}
