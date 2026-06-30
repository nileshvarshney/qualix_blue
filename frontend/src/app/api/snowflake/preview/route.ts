import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const connectionId = searchParams.get('connection_id')
  const database     = searchParams.get('database')
  const schema       = searchParams.get('schema')
  const table        = searchParams.get('table')
  const limit        = searchParams.get('limit') ?? '20'

  if (!database || !schema || !table)
    return NextResponse.json({ rows: [], error: 'database, schema and table params required' })

  try {
    const connId = connectionId ?? await getPrimaryConnectionId()
    if (!connId) return NextResponse.json({ rows: [], error: 'No connection found' })

    const qs = new URLSearchParams({ database, schema, table, limit })
    const res = await serverFetch(req, `${BACKEND}/connections/${connId}/preview?${qs}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ rows: [], error: `Backend ${res.status}` })

    const body = await res.json()
    // backend wraps result: { data: { columns, rows, ... }, database, schema, table }
    const inner = body.data ?? body
    const colNames: string[] = inner.columns ?? []
    const rawRows: unknown[][] = inner.rows ?? []

    // convert array-of-arrays to array-of-objects
    const rows = rawRows.map(r =>
      Object.fromEntries(colNames.map((k, i) => [k, (r as unknown[])[i] ?? null]))
    )

    return NextResponse.json({ rows, columns: colNames })
  } catch (e: unknown) {
    return NextResponse.json({ rows: [], error: (e as Error).message })
  }
}

async function getPrimaryConnectionId(): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND}/connections`, { cache: 'no-store' })
    if (!res.ok) return null
    const conns: Record<string, unknown>[] = await res.json()
    if (!Array.isArray(conns) || conns.length === 0) return null
    const primary = conns.find(c => c.is_primary_target) ?? conns[0]
    return (primary?.connection_id as string) ?? null
  } catch { return null }
}
