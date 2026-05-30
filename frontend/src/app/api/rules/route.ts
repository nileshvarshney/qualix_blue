import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/lib/store'
import { generateId } from '@/lib/utils'
import { Rule } from '@/lib/types'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/rules/enriched?limit=500`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    const items: Record<string, unknown>[] = data.items ?? []

    // Fetch connections once to map asset_id → connection_id
    const connRes = await fetch(`${BACKEND}/connections`, { cache: 'no-store' })
    const connData = connRes.ok ? await connRes.json() : []
    const connections: Record<string, unknown>[] = Array.isArray(connData) ? connData : (connData.items ?? [])
    const defaultConnId = connections[0]?.connection_id as string ?? ''

    const rules: Rule[] = items.map((r) => ({
      id: r.rule_id as string,
      name: r.rule_name as string,
      description: (r.rule_description as string) ?? '',
      category: (r.rule_category as Rule['category']) ?? 'completeness',
      type: r.rule_type as Rule['type'],
      connectionId: defaultConnId,
      tableName: (r.sf_table_name as string) ?? '',
      columnName: (r.target_column as string) ?? undefined,
      parameters: (r.rule_config as Record<string, unknown>) ?? {},
      enabled: r.is_active as boolean,
      status: r.status as Rule['status'],
      severity: r.severity as Rule['severity'],
      scope: 'generic',
      createdAt: r.created_at as string,
      createdBy: (r.created_by as string) ?? undefined,
      approvedBy: (r.approved_by as string) ?? undefined,
    }))

    return NextResponse.json(rules)
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  // Every newly created rule must be reviewed by the data stewards group before it
  // can run. It enters the review queue as pending_review and stays inactive until approved.
  const rule: Rule = {
    ...body,
    id: generateId('rule'),
    enabled: false,
    status: 'pending_review',
    scope: body.scope ?? 'generic',
    createdAt: new Date().toISOString(),
    createdBy: body.createdBy || undefined,
  }
  store.rules.create(rule)
  return NextResponse.json(rule, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, ...updates } = body
  const updated = store.rules.update(id, updates)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })
  store.rules.delete(id)
  return NextResponse.json({ success: true })
}
