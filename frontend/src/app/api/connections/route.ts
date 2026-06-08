import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/lib/store'
import { generateId } from '@/lib/utils'
import { Connection } from '@/lib/types'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/connections`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    const items: Record<string, unknown>[] = Array.isArray(data) ? data : (data.items ?? [])

    const connections: Connection[] = items.map((c) => ({
      id: c.connection_id as string,
      name: c.connection_name as string,
      type: (c.database_type as Connection['type']) ?? 'snowflake',
      account: (c.account as string) ?? undefined,
      username: (c.sf_user as string) ?? undefined,
      warehouse: (c.warehouse as string) ?? undefined,
      role: (c.role as string) ?? undefined,
      host: (c.host as string) ?? undefined,
      port: (c.port as number) ?? undefined,
      excludedDatabases: (c.excluded_databases as string[]) ?? undefined,
      excludedSchemas: (c.excluded_schemas as Array<{ database: string; schema: string }>) ?? undefined,
      status: c.is_active ? 'active' : 'inactive',
      lastTested: (c.last_tested_at as string) ?? undefined,
      createdAt: c.created_at as string,
    }))

    return NextResponse.json(connections)
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const connection: Connection = {
    ...body,
    id: generateId('conn'),
    status: 'inactive',
    createdAt: new Date().toISOString()
  }
  store.connections.create(connection)
  return NextResponse.json(connection, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  const updated = store.connections.update(id, updates)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  store.connections.delete(id)
  return NextResponse.json({ success: true })
}
