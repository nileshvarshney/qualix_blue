import { NextRequest, NextResponse } from 'next/server'
import { Rule } from '@/lib/types'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const assetId = searchParams.get('asset_id')
    const domainId = searchParams.get('domain_id')
    let url = `${BACKEND}/rules/enriched?limit=500`
    if (assetId) url += `&asset_id=${assetId}`
    if (domainId) url += `&domain_id=${domainId}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json()
    const items: Record<string, unknown>[] = data.items ?? []

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
      assetId: r.asset_id as string | undefined,
      domainId: r.domain_id as string | undefined,
      subdomainId: r.subdomain_id as string | undefined,
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
  try {
    const body = await req.json()
    const { name, description, category, type, connectionId, tableName, columnName, severity, parameters } = body

    // Resolve asset_id + domain_id + subdomain_id from connectionId + tableName
    const assetRes = await fetch(
      `${BACKEND}/assets?connection_id=${encodeURIComponent(connectionId ?? '')}&sf_table_name=${encodeURIComponent(tableName ?? '')}&limit=1`,
      { cache: 'no-store' }
    )
    const assetData = assetRes.ok ? await assetRes.json() : {}
    const assetItems: Record<string, unknown>[] = Array.isArray(assetData) ? assetData : (assetData.items ?? [])
    const asset = assetItems[0]

    if (!asset) {
      return NextResponse.json({ error: `Asset not found for table '${tableName}'` }, { status: 422 })
    }

    const createBody = {
      rule_name: name,
      rule_description: description || null,
      domain_id: asset.domain_id,
      subdomain_id: asset.subdomain_id,
      asset_id: asset.asset_id,
      rule_type: type,
      rule_category: category,
      target_column: columnName || null,
      rule_config: parameters || null,
      severity: severity || 'medium',
      status: 'draft',
    }

    const res = await fetch(`${BACKEND}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }
    const created = await res.json()
    const rule: Rule = {
      id: created.rule_id as string,
      name: created.rule_name as string,
      description: (created.rule_description as string) ?? '',
      category: (created.rule_category as Rule['category']) ?? category,
      type: created.rule_type as Rule['type'],
      connectionId: connectionId as string,
      tableName: (asset.sf_table_name as string) ?? tableName,
      columnName: (created.target_column as string) ?? undefined,
      parameters: (created.rule_config as Record<string, unknown>) ?? parameters ?? {},
      enabled: created.is_active as boolean,
      status: created.status as Rule['status'],
      severity: created.severity as Rule['severity'],
      scope: 'generic',
      assetId: created.asset_id as string | undefined,
      domainId: created.domain_id as string | undefined,
      subdomainId: created.subdomain_id as string | undefined,
      createdAt: created.created_at as string,
      createdBy: (created.created_by as string) ?? undefined,
    }
    return NextResponse.json(rule, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, description, category, type, severity, status, columnName, parameters } = body

    const updateBody = {
      rule_name: name,
      rule_description: description || null,
      rule_type: type,
      rule_category: category,
      target_column: columnName || null,
      rule_config: parameters || null,
      severity,
      status,
      is_active: status === 'active',
    }

    const res = await fetch(`${BACKEND}/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateBody),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(err, { status: res.status })
    }
    return NextResponse.json(await res.json())
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const res = await fetch(`${BACKEND}/rules/${id}`, { method: 'DELETE' })
    if (!res.ok) return NextResponse.json({ error: 'Delete failed' }, { status: res.status })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
