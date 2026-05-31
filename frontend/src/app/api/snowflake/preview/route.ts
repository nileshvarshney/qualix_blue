import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const connectionId = searchParams.get('connection_id')
  const table = searchParams.get('table')
  const limit = searchParams.get('limit') ?? '50'
  if (!connectionId || !table) return NextResponse.json({ rows: [], columns: [] })
  try {
    const res = await fetch(
      `${BACKEND}/connections/${connectionId}/preview?table_name=${encodeURIComponent(table)}&limit=${limit}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return NextResponse.json({ rows: [], columns: [] })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ rows: [], columns: [] })
  }
}
