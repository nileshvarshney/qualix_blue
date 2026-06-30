import { NextRequest, NextResponse } from 'next/server'
import { Connection } from '@/lib/types'
import { serverFetch } from '@/lib/serverFetch'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

function mapToConnection(c: Record<string, unknown>): Connection {
  return {
    id: c.connection_id as string,
    name: c.connection_name as string,
    type: (c.database_type as Connection['type']) ?? 'snowflake',
    account: (c.account as string) ?? undefined,
    username: (c.sf_user as string) ?? undefined,
    warehouse: (c.warehouse as string) ?? undefined,
    role: (c.role as string) ?? undefined,
    database: (c.default_database as string) ?? undefined,
    schema: (c.default_schema as string) ?? undefined,
    host: (c.host as string) ?? undefined,
    port: (c.port as number) ?? undefined,
    excludedDatabases: (c.excluded_databases as string[]) ?? undefined,
    excludedSchemas: (c.excluded_schemas as Array<{ database: string; schema: string }>) ?? undefined,
    filterMode: ((c.filter_mode as 'include' | 'exclude') ?? 'exclude'),
    includedDatabases: (c.included_databases as string[]) ?? undefined,
    includedSchemas: (c.included_schemas as Array<{ database: string; schema: string }>) ?? undefined,
    status: c.is_active ? 'active' : 'inactive',
    lastTested: (c.last_tested_at as string) ?? undefined,
    createdAt: c.created_at as string,
  }
}

/** Map frontend Connection field names to backend ConnectionCreate/Update field names */
function mapToBackend(body: Record<string, unknown>): Record<string, unknown> {
  const { name, type, username, database, schema, filterMode, includedDatabases, includedSchemas, ...rest } = body
  return {
    ...rest,
    ...(name !== undefined && { connection_name: name }),
    ...(type !== undefined && { database_type: type }),
    ...(username !== undefined && { sf_user: username }),
    ...(database !== undefined && { default_database: database }),
    ...(schema !== undefined && { default_schema: schema }),
    ...(filterMode !== undefined && { filter_mode: filterMode }),
    ...(includedDatabases !== undefined && { included_databases: includedDatabases }),
    ...(includedSchemas !== undefined && { included_schemas: includedSchemas }),
  }
}

export async function GET(req: NextRequest) {
  try {
    const res = await serverFetch(req, `${BACKEND}/connections`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    const items: Record<string, unknown>[] = Array.isArray(data) ? data : (data.items ?? [])
    return NextResponse.json(items.map(mapToConnection))
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await serverFetch(req, `${BACKEND}/connections`, {
      method: 'POST',
      body: JSON.stringify(mapToBackend(body)),
      cache: 'no-store',
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(mapToConnection(data), { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    const res = await serverFetch(req, `${BACKEND}/connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(mapToBackend(updates)),
      cache: 'no-store',
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(mapToConnection(data))
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
    const res = await serverFetch(req, `${BACKEND}/connections/${id}`, {
      method: 'DELETE',
      cache: 'no-store',
    })
    if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: res.status })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
