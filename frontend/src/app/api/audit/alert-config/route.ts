import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const MOCK: AlertConfig = {
  slack_webhook: '', email_recipients: '',
  alert_types: ['off_hours', 'bulk_access', 'repeated_failures'],
  min_severity: 'medium', enabled: false,
}

interface AlertConfig {
  slack_webhook: string; email_recipients: string
  alert_types: string[]; min_severity: string; enabled: boolean
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/audit/alert-config`, { cache: 'no-store', headers: auth ? { authorization: auth } : {} })
    if (!res.ok) return NextResponse.json(MOCK)
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json(MOCK) }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/audit/alert-config`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body),
    })
    if (!res.ok) return NextResponse.json(body)
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json(MOCK) }
}
