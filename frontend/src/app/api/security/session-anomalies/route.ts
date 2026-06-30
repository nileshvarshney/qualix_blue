import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const MOCK = {
  anomalies: [
    { id: 'sa-1', user: 'john.doe', user_email: 'john@company.com', anomaly_type: 'off_hours_access', timestamp: '2026-06-21T02:34:00Z', ip: '10.20.30.41', severity: 'medium', status: 'open', detail: 'Access at 02:34 UTC outside normal business hours (06:00–22:00)' },
    { id: 'sa-2', user: 'jane.smith', user_email: 'jane@company.com', anomaly_type: 'bulk_export', timestamp: '2026-06-20T15:22:00Z', ip: '192.168.1.55', severity: 'high', status: 'open', detail: 'Exported 12 datasets in 45 seconds — exceeds bulk threshold of 5/batch' },
    { id: 'sa-3', user: 'api.service', user_email: 'api@company.com', anomaly_type: 'repeated_auth_failure', timestamp: '2026-06-20T11:08:00Z', ip: '203.0.113.42', severity: 'high', status: 'resolved', detail: '8 failed login attempts in 60 seconds' },
    { id: 'sa-4', user: 'mike.jones', user_email: 'mike@company.com', anomaly_type: 'unusual_ip', timestamp: '2026-06-19T08:55:00Z', ip: '45.33.120.99', severity: 'low', status: 'open', detail: 'First access from this IP — not in any known CIDR range' },
  ],
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/security/session-anomalies`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json(MOCK)
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json(MOCK)
  }
}
