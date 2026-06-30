import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { maskSensitiveColumns, extractUserRole } from '@/lib/masking'
import { DEMO_ASSET_BY_ID, DEMO_ENRICHED_ASSETS } from '@/lib/demoData'

function buildDemoTree(sourceId: string | null) {
  const effectiveId = sourceId === '__all__' ? null : sourceId
  const assets = effectiveId
    ? DEMO_ENRICHED_ASSETS.filter(a => a.connection_id === effectiveId)
    : DEMO_ENRICHED_ASSETS

  // Group: connection → database → schema → tables
  const byConn: Record<string, typeof DEMO_ENRICHED_ASSETS> = {}
  for (const a of assets) {
    const key = a.connection_id
    if (!byConn[key]) byConn[key] = []
    byConn[key].push(a)
  }

  return Object.entries(byConn).map(([connId, connAssets]) => {
    const firstAsset = connAssets[0]
    const byDb: Record<string, typeof DEMO_ENRICHED_ASSETS> = {}
    for (const a of connAssets) {
      const db = a.sf_database_name ?? '(no database)'
      if (!byDb[db]) byDb[db] = []
      byDb[db].push(a)
    }

    const dbChildren = Object.entries(byDb).map(([db, dbAssets]) => {
      const bySchema: Record<string, typeof DEMO_ENRICHED_ASSETS> = {}
      for (const a of dbAssets) {
        const sc = a.sf_schema_name ?? '(no schema)'
        if (!bySchema[sc]) bySchema[sc] = []
        bySchema[sc].push(a)
      }

      const schemaChildren = Object.entries(bySchema).map(([schema, schemaAssets]) => ({
        asset_id: `demo-schema-${connId}-${db}-${schema}`,
        asset_type: 'schema',
        physical_name: schema,
        display_name: schema,
        qualified_name: `${db}.${schema}`,
        path: null, status: 'active', parent_asset_id: `demo-db-${connId}-${db}`,
        connection_id: connId, owner_user_id: null, owner_team_id: null, steward_user_id: null,
        domain: null, sensitivity: null, discovered_at: null, last_seen_at: null,
        criticality: null, description: null,
        _loaded: true, _expanded: false,
        children: schemaAssets.map(a => ({
          asset_id: a.asset_id,
          asset_type: a.table_type ?? a.asset_type ?? 'table',
          physical_name: a.sf_table_name,
          display_name: a.sf_table_name,
          qualified_name: `${a.sf_database_name}.${a.sf_schema_name}.${a.sf_table_name}`,
          path: null, status: a.status ?? 'active',
          parent_asset_id: `demo-schema-${connId}-${db}-${schema}`,
          connection_id: connId, owner_user_id: null, owner_team_id: null, steward_user_id: null,
          domain: a.domain_name ?? null, sensitivity: null,
          discovered_at: a.discovered_at ?? null, last_seen_at: a.last_seen_at ?? null,
          criticality: a.criticality ?? null, description: a.description ?? null,
          _loaded: true, _expanded: false,
          children: [],
        })),
      }))

      return {
        asset_id: `demo-db-${connId}-${db}`,
        asset_type: 'database',
        physical_name: db,
        display_name: db,
        qualified_name: db,
        path: null, status: 'active', parent_asset_id: `demo-source-${connId}`,
        connection_id: connId, owner_user_id: null, owner_team_id: null, steward_user_id: null,
        domain: null, sensitivity: null, discovered_at: null, last_seen_at: null,
        criticality: null, description: null,
        _loaded: true, _expanded: false,
        children: schemaChildren,
      }
    })

    return {
      asset_id: `demo-source-${connId}`,
      asset_type: 'source',
      physical_name: firstAsset.connection_name,
      display_name: firstAsset.connection_name,
      qualified_name: null,
      path: null, status: 'active', parent_asset_id: null,
      connection_id: connId, owner_user_id: null, owner_team_id: null, steward_user_id: null,
      domain: null, sensitivity: null, discovered_at: null, last_seen_at: null,
      criticality: null, description: null,
      _loaded: true, _expanded: false,
      children: dbChildren,
    }
  })
}

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

const sensCache = new Map<string, { data: Record<string, string>; expires: number }>()
const SENS_TTL = 5 * 60 * 1000 // 5 minutes

async function getSensitivityMap(req: NextRequest, assetId: string, auth: string): Promise<Record<string, string>> {
  const cached = sensCache.get(assetId)
  if (cached && Date.now() < cached.expires) return cached.data
  try {
    const r = await serverFetch(req,
      `${BACKEND}/classifications/assets/${assetId}/classifications`,
      { headers: { Authorization: auth }, cache: 'no-store' },
    )
    const items = await r.json().catch(() => []) as Record<string, unknown>[]
    const map: Record<string, string> = {}
    if (Array.isArray(items)) {
      for (const item of items) {
        const col  = String(item.column_name ?? item.column ?? '')
        const sens = String(item.classification ?? item.suggested_classification ?? '')
        if (col && sens) map[col] = sens
      }
    }
    sensCache.set(assetId, { data: map, expires: Date.now() + SENS_TTL })
    return map
  } catch {
    return {}
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const pathStr = path.join('/')
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const res = await serverFetch(req, `${BACKEND}/asset-registry/${pathStr}${req.nextUrl.search}`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Backend ${res.status}`)
    const data = await res.json().catch(() => ({}))

    if (pathStr.includes('profiling') || pathStr.includes('preview') || pathStr.includes('sample')) {
      try {
        const secRes = await serverFetch(req, `${BACKEND}/security/settings`, {
          headers: auth ? { Authorization: auth } : {},
          cache: 'no-store',
        }).catch(() => null)
        const secSettings = secRes?.ok ? await secRes.json().catch(() => ({})) as Record<string, unknown> : {}
        if (secSettings.column_level_access_control === true) {
          const assetId = path[0] ?? ''
          const sensitivityMap = await getSensitivityMap(req, assetId, auth)
          const role = extractUserRole(auth)
          try {
            return NextResponse.json(maskSensitiveColumns(data, role, sensitivityMap), { status: res.status })
          } catch (maskErr) {
            console.error('masking error, returning unmasked data:', maskErr)
          }
        }
      } catch (secErr) {
        console.error('security check error, returning unmasked data:', secErr)
      }
    }

    return NextResponse.json(data, { status: res.status })
  } catch {
    const rootId = path[0] ?? ''

    // Handle tree request
    if (rootId === 'tree') {
      const sourceId = req.nextUrl.searchParams.get('source_id')
      return NextResponse.json(buildDemoTree(sourceId))
    }

    // Return demo asset for individual asset lookups (path like "asset-001" or "asset-001/...sub")
    if (rootId in DEMO_ASSET_BY_ID) {
      const asset = DEMO_ASSET_BY_ID[rootId]
      if (path.length > 1) {
        const sub = path[1]
        if (sub === 'children' || sub === 'ancestors') return NextResponse.json([])
        if (sub === 'owners' || sub === 'tags' || sub === 'documents' || sub === 'history') return NextResponse.json([])
        if (sub === 'profiling' || sub === 'preview' || sub === 'sample') return NextResponse.json({ columns: [], rows: [] })
      }
      return NextResponse.json(asset)
    }

    // Handle demo source/database/schema node lookups by searching the built tree
    if (rootId.startsWith('demo-source-') || rootId.startsWith('demo-db-') || rootId.startsWith('demo-schema-')) {
      function findNode(nodes: ReturnType<typeof buildDemoTree>, id: string): ReturnType<typeof buildDemoTree>[0] | null {
        for (const n of nodes) {
          if (n.asset_id === id) return n
          const found = findNode(n.children as unknown as ReturnType<typeof buildDemoTree>, id)
          if (found) return found
        }
        return null
      }
      const node = findNode(buildDemoTree(null), rootId)
      if (node) {
        if (path.length > 1) {
          const sub = path[1]
          if (sub === 'children') return NextResponse.json(node.children ?? [])
          if (sub === 'ancestors') return NextResponse.json([])
        }
        return NextResponse.json(node)
      }
    }

    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const pathStr = path.join('/')
    const body = await req.text()
    const res = await serverFetch(req, `${BACKEND}/asset-registry/${pathStr}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const pathStr = path.join('/')
    const body = await req.text()
    const res = await serverFetch(req, `${BACKEND}/asset-registry/${pathStr}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params
    const pathStr = path.join('/')
    const res = await serverFetch(req, `${BACKEND}/asset-registry/${pathStr}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
