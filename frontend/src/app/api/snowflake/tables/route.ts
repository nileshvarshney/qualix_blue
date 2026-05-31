import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const connectionId = new URL(req.url).searchParams.get('connection_id')
  try {
    // Get the primary target connection if no specific connection requested
    const connId = connectionId ?? await getPrimaryConnectionId()
    if (!connId) return NextResponse.json({ tables: [] })

    const res = await fetch(`${BACKEND}/connections/${connId}/tables`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ tables: [] })

    const data = await res.json()
    const tables = (data.tables ?? data ?? []).map((t: Record<string, unknown>) => ({
      TABLE_NAME: t.name ?? t.TABLE_NAME ?? t.table_name,
      TABLE_TYPE: t.table_type ?? t.TABLE_TYPE ?? 'BASE TABLE',
      ROW_COUNT: t.row_count ?? t.ROW_COUNT ?? null,
      TABLE_SCHEMA: t.schema_name ?? t.TABLE_SCHEMA ?? '',
      TABLE_CATALOG: t.database_name ?? t.TABLE_CATALOG ?? '',
      COMMENT: t.comment ?? t.COMMENT ?? null,
    })).filter((t: Record<string, unknown>) => t.TABLE_NAME)

    return NextResponse.json({ tables })
  } catch {
    return NextResponse.json({ tables: [] })
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
