import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'

const B = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('asset_ids') ?? ''
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({})

  const auth = req.headers.get('Authorization') ?? ''

  // Try bulk endpoint first; fall back to parallel individual calls
  try {
    const bulk = await serverFetch(req, 
      `${B}/glossary/assets/bulk?asset_ids=${ids.join(',')}`,
      { headers: { Authorization: auth }, cache: 'no-store' },
    )
    if (bulk.ok) {
      const data = await bulk.json() as Record<string, unknown>
      // Normalise: backend may return { [assetId]: [{term_id, name}] }
      const result: Record<string, { term_id: string; name: string }[]> = {}
      for (const [id, terms] of Object.entries(data)) {
        if (Array.isArray(terms)) {
          result[id] = terms.map((t: Record<string, unknown>) => ({
            term_id: String(t.term_id ?? t.id ?? ''),
            name:    String(t.term_name ?? t.name ?? ''),
          }))
        }
      }
      return NextResponse.json(result)
    }
  } catch { /* fall through to individual calls */ }

  // Fallback: one call per asset_id in parallel
  const settled = await Promise.allSettled(
    ids.map(async id => {
      const r = await serverFetch(req, `${B}/glossary?asset_id=${id}`, {
        headers: { Authorization: auth }, cache: 'no-store',
      })
      const data = await r.json().catch(() => []) as Record<string, unknown>[]
      const terms = Array.isArray(data) ? data : []
      return {
        id,
        terms: terms.map((t: Record<string, unknown>) => ({
          term_id: String(t.id ?? t.term_id ?? ''),
          name:    String(t.name ?? t.term_name ?? ''),
        })),
      }
    })
  )

  const result: Record<string, { term_id: string; name: string }[]> = {}
  for (const r of settled) {
    if (r.status === 'fulfilled') result[r.value.id] = r.value.terms
  }
  return NextResponse.json(result)
}
