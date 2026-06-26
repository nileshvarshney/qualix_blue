import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const includeSamples = req.nextUrl.searchParams.get('samples') === 'true'

  try {
    const [runRes, samplesRes] = await Promise.all([
      serverFetch(req, `${BACKEND}/runs/${runId}`, { cache: 'no-store' }),
      includeSamples
        ? serverFetch(req, `${BACKEND}/runs/${runId}/samples?limit=20`, { cache: 'no-store' })
        : Promise.resolve(null),
    ])

    if (!runRes.ok) return NextResponse.json(null, { status: runRes.status })
    const run = await runRes.json()

    let samples: unknown[] = []
    let maskedFields: string[] = []
    if (samplesRes?.ok) {
      const raw = await samplesRes.json()
      const rows = Array.isArray(raw) ? raw as Record<string, unknown>[] : []
      samples = rows.map(r => (r.failed_record as Record<string, unknown>) ?? {})
      maskedFields = Array.isArray(rows[0]?.masked_fields) ? rows[0].masked_fields as string[] : []
    }

    return NextResponse.json({ ...run, samples, masked_fields: maskedFields })
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
}
