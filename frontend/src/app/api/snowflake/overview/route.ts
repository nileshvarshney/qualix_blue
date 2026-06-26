import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const connectionId = searchParams.get('connection_id')
  const table = searchParams.get('table')
  if (!connectionId || !table) return NextResponse.json({ rows: [], columns: [] })
  try {
    const res = await serverFetch(req, 
      `${BACKEND}/connections/${connectionId}/preview?table_name=${encodeURIComponent(table)}&limit=100`,
      { cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json({ rows: [], columns: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ rows: [], columns: [] })
  }
}
