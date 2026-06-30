import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const MOCK = { slack_webhook: '', email_recipients: '', enabled: false }

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/governance/notification-config`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json(MOCK)
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json(MOCK)
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/governance/notification-config`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    if (!res.ok) return NextResponse.json(body)
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json(MOCK)
  }
}
