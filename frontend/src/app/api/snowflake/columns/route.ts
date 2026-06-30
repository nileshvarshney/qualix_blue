import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const table      = url.searchParams.get('table')
  const database   = url.searchParams.get('database')
  const schema     = url.searchParams.get('schema')
  const connectionId = url.searchParams.get('connection_id')

  if (!table || !database || !schema)
    return NextResponse.json({ error: 'table, database and schema params required' }, { status: 400 })

  try {
    const connId = connectionId ?? await getPrimaryConnectionId(req)
    if (!connId) return NextResponse.json({ columns: [], error: 'No connection found' })

    const qs = new URLSearchParams({ database, schema, table })
    const res = await serverFetch(req, `${BACKEND}/connections/${connId}/columns?${qs}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ columns: [], error: `Backend ${res.status}` })

    const data = await res.json()
    const raw: Record<string, unknown>[] = data.columns ?? []
    const columns = raw.map(c => ({
      COLUMN_NAME:              c.column_name ?? c.name ?? c.COLUMN_NAME,
      DATA_TYPE:                c.data_type   ?? c.DATA_TYPE   ?? 'VARCHAR',
      IS_NULLABLE:              c.is_nullable ?? c.IS_NULLABLE ?? 'YES',
      COLUMN_DEFAULT:           c.column_default ?? null,
      CHARACTER_MAXIMUM_LENGTH: null,
      NUMERIC_PRECISION:        null,
      ORDINAL_POSITION:         c.ordinal_position ?? 0,
      COMMENT:                  c.comment ?? c.COMMENT ?? null,
    })).filter(c => c.COLUMN_NAME)

    return NextResponse.json({ columns })
  } catch (e: unknown) {
    return NextResponse.json({ columns: [], error: (e as Error).message })
  }
}

async function getPrimaryConnectionId(req: NextRequest): Promise<string | null> {
  try {
    const res = await serverFetch(req, `${BACKEND}/connections`, { cache: 'no-store' })
    if (!res.ok) return null
    const conns: Record<string, unknown>[] = await res.json()
    if (!Array.isArray(conns) || conns.length === 0) return null
    const primary = conns.find(c => c.is_primary_target) ?? conns[0]
    return primary?.connection_id as string ?? null
  } catch { return null }
}
