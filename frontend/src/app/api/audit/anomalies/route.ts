import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const hours = searchParams.get('hours') ?? '24'
    const res = await fetch(`${BACKEND}/audit/anomalies?hours=${hours}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch { return NextResponse.json([]) }
}
