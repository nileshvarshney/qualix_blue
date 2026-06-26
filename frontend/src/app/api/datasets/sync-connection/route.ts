import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const { connection } = await req.json()

    // Check if a backend connection with the same name already exists
    const listRes = await serverFetch(req, `${BACKEND}/connections`, { cache: 'no-store' })
    if (listRes.ok) {
      const existing: Record<string, unknown>[] = await listRes.json()
      const match = existing.find(
        c => (c.connection_name as string)?.toLowerCase() === (connection.name as string)?.toLowerCase()
      )
      if (match) {
        return NextResponse.json({ connection_id: match.connection_id })
      }
    }

    // Create the connection in the backend DB
    const payload: Record<string, unknown> = {
      connection_name:  connection.name,
      database_type:    connection.type ?? 'snowflake',
      account:          connection.account,
      sf_user:          connection.username,
      password:         connection.password,
      warehouse:        connection.warehouse,
      role:             connection.role,
      default_database: connection.database,
      default_schema:   connection.schema,
      host:             connection.host,
      port:             connection.port,
      is_active:        true,
    }

    const createRes = await serverFetch(req, `${BACKEND}/connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err?.detail ?? `Backend returned ${createRes.status}` },
        { status: createRes.status }
      )
    }

    const created = await createRes.json()
    return NextResponse.json({ connection_id: created.connection_id })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
