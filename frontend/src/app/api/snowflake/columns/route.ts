import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const table = url.searchParams.get('table')
  const connectionId = url.searchParams.get('connection_id')

  if (!table) return NextResponse.json({ error: 'table param required' }, { status: 400 })

  try {
    const connId = connectionId ?? await getPrimaryConnectionId()
    if (!connId) return NextResponse.json({ columns: [] })

    const res = await fetch(
      `${BACKEND}/connections/${connId}/columns?table_name=${encodeURIComponent(table)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json({ columns: [] })

    const data = await res.json()
    const columns = (data.columns ?? data ?? []).map((c: Record<string, unknown>) => ({
      COLUMN_NAME: c.name ?? c.COLUMN_NAME ?? c.column_name,
      DATA_TYPE: c.data_type ?? c.DATA_TYPE ?? 'VARCHAR',
      IS_NULLABLE: c.is_nullable ?? c.IS_NULLABLE ?? 'YES',
      ORDINAL_POSITION: c.ordinal_position ?? c.ORDINAL_POSITION ?? 0,
      COMMENT: c.comment ?? c.COMMENT ?? null,
    })).filter((c: Record<string, unknown>) => c.COLUMN_NAME)

    return NextResponse.json({ columns })
  } catch {
    return NextResponse.json({ columns: [] })
  }
}

async function getPrimaryConnectionId(): Promise<string | null> {
  try {
    const res = await fetch(`${BACKEND}/connections`, { cache: 'no-store' })
    if (!res.ok) return null
    const conns: Record<string, unknown>[] = await res.json()
    if (!Array.isArray(conns) || conns.length === 0) return null
    const primary = conns.find(c => c.is_primary_target) ?? conns[0]
    return primary?.connection_id as string ?? null
  } catch { return null }
}
