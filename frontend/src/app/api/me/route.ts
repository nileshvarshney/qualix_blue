import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('Authorization')
    const res = await serverFetch(req, `${BACKEND}/auth/me`, {
      cache: 'no-store',
      headers: { ...(auth ? { Authorization: auth } : {}) },
    })
    if (!res.ok) return NextResponse.json({ role: 'viewer', domain_id: null, email: '' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ role: 'viewer', domain_id: null, email: '' })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = req.headers.get('Authorization')
    const res = await serverFetch(req, `${BACKEND}/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return NextResponse.json({ ok: false }, { status: res.status })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({ ok: true, ...data })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
