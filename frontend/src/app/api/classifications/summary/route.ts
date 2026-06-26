import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const r = await serverFetch(req, `${B}/classifications/summary`, {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
      cache: 'no-store',
    })
    if (r.ok) return NextResponse.json(await r.json())
  } catch { /* fall through to mock */ }

  // Fallback: build summary from per-asset sensitivity if backend lacks endpoint
  try {
    const assetsRes = await serverFetch(req, `${B}/catalog`, {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
      cache: 'no-store',
    })
    if (!assetsRes.ok) return NextResponse.json({ domains: [] })
    const assets = await assetsRes.json() as Record<string, unknown>[]

    // Group by domain_name
    const domainMap = new Map<string, Record<string, number>>()
    for (const a of Array.isArray(assets) ? assets : []) {
      const domain = String(a.domain_name ?? a.domain ?? 'Unassigned')
      const sens   = String(a.sensitivity ?? '')
      if (!sens) continue
      if (!domainMap.has(domain)) domainMap.set(domain, {})
      const counts = domainMap.get(domain)!
      counts[sens] = (counts[sens] ?? 0) + 1
    }

    const domains = Array.from(domainMap.entries()).map(([name, counts]) => ({
      name,
      counts,
      total: Object.values(counts).reduce((s, n) => s + n, 0),
    })).sort((a, b) => b.total - a.total)

    return NextResponse.json({ domains })
  } catch {
    return NextResponse.json({ domains: [] })
  }
}
