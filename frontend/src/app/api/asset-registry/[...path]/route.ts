import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'
import { maskSensitiveColumns, extractUserRole } from '@/lib/masking'

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
  try {
    const { path } = await params
    const pathStr = path.join('/')
    const auth = req.headers.get('Authorization') ?? ''
    const res = await serverFetch(req, `${BACKEND}/asset-registry/${pathStr}${req.nextUrl.search}`, { cache: 'no-store' })
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
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
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
