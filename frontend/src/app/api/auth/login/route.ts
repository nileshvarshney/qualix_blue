import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const DEMO_USERS: Record<string, { password: string; full_name: string; role: string }> = {
  'admin@example.com':        { password: 'admin123',   full_name: 'Admin User',   role: 'admin' },
  'domain.owner@example.com': { password: 'domain123',  full_name: 'Domain Owner', role: 'domain_owner' },
  'data.owner@example.com':   { password: 'data123',    full_name: 'Data Owner',   role: 'data_owner' },
  'viewer@example.com':       { password: 'viewer123',  full_name: 'Viewer User',  role: 'viewer' },
  'auditor@example.com':      { password: 'auditor123', full_name: 'Auditor User', role: 'auditor' },
}

function makeDemoToken(email: string, role: string): string {
  const payload = { email, role, demo: true, exp: Date.now() + 8 * 60 * 60 * 1000 }
  return 'demo.' + Buffer.from(JSON.stringify(payload)).toString('base64url')
}

/**
 * Proxies login credentials to the backend and returns:
 *   { access_token: string, token_type: "bearer", user: { email, role, domain_id } }
 * Falls back to demo credentials when the backend is unreachable.
 */
export async function POST(req: NextRequest) {
  const body = await req.json()

  try {
    const res = await fetch(`${BACKEND}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) return NextResponse.json(await res.json())

    // Backend returned an auth error — check demo credentials before surfacing it
    const err = await res.json().catch(() => ({ detail: 'Invalid credentials' }))
    if (res.status < 500) return NextResponse.json(err, { status: res.status })
    // 5xx → fall through to demo fallback below
  } catch {
    // Network error — fall through to demo fallback
  }

  // Demo fallback: backend is down or erroring
  const email = (body.email ?? '').toLowerCase()
  const demo = DEMO_USERS[email]
  if (demo && body.password === demo.password) {
    const token = makeDemoToken(email, demo.role)
    return NextResponse.json({
      access_token: token,
      token_type: 'bearer',
      user: { user_id: email, email, full_name: demo.full_name, role: demo.role },
    })
  }

  return NextResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
}
