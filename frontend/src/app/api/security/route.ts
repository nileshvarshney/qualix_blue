import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  try {
    const res = await serverFetch(req, `${BACKEND}/security/settings`, {
      cache: 'no-store',
      headers: auth ? { Authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json({}, { status: res.status })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({}, { status: 502 })
  }
}

export async function PUT(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/security/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 502 })
  }
}
