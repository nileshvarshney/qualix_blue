import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

/**
 * Cold-start token validation. Unlike /api/me, this route propagates 401 so
 * AuthContext can distinguish a valid session from an expired/absent one.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('Authorization')
  if (!auth) return NextResponse.json({ error: 'No token' }, { status: 401 })

  try {
    const res = await fetch(`${BACKEND}/auth/me`, {
      cache: 'no-store',
      headers: { Authorization: auth },
    })
    if (!res.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
