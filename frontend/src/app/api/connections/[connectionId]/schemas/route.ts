import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

function mapCredentials(conn: Record<string, unknown>) {
  return {
    account:          conn.account,
    sf_user:          conn.username,
    password:         conn.password,
    warehouse:        conn.warehouse,
    role:             conn.role ?? null,
    default_database: conn.database ?? null,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  await params
  const database = new URL(req.url).searchParams.get('database') ?? ''
  try {
    const conn = await req.json()
    const res = await fetch(
      `${BACKEND}/connections/browse/schemas?database=${encodeURIComponent(database)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapCredentials(conn)),
        cache: 'no-store',
      }
    )
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ schemas: [], error: (e as Error).message })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params
  const database = new URL(req.url).searchParams.get('database') ?? ''
  try {
    const res = await serverFetch(
      req,
      `${BACKEND}/connections/${connectionId}/schemas?database=${encodeURIComponent(database)}`,
      { cache: 'no-store' }
    )
    const data = await res.json()
    if (!res.ok) {
      const msg = data?.detail || data?.error || `HTTP ${res.status}`
      return NextResponse.json({ schemas: [], error: msg })
    }
    return NextResponse.json(data)
  } catch (e: unknown) {
    return NextResponse.json({ schemas: [], error: (e as Error).message })
  }
}
