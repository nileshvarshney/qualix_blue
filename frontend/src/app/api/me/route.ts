import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/auth/me`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ role: 'viewer', domain_id: null, email: '' })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ role: 'viewer', domain_id: null, email: '' })
  }
}
