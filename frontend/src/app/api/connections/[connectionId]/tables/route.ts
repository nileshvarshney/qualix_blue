import { NextRequest, NextResponse } from 'next/server'

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
  const sp = new URL(req.url).searchParams
  const database = sp.get('database') ?? ''
  const schema   = sp.get('schema') ?? ''
  try {
    const conn = await req.json()
    const res = await fetch(
      `${BACKEND}/connections/browse/tables?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}`,
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
    return NextResponse.json({ tables: [], error: (e as Error).message })
  }
}
