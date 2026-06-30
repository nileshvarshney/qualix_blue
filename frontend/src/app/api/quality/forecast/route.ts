import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

export const dynamic = 'force-dynamic'
const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

function mockForecast(connectionId: string) {
  const today = new Date()
  return {
    connection_id: connectionId,
    forecast: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() + i + 1)
      const base = 87 - i * 1.2
      return {
        date: d.toISOString().slice(0, 10),
        projected_score: Math.round(base * 10) / 10,
        lower_bound: Math.round((base - 4) * 10) / 10,
        upper_bound: Math.round((base + 3) * 10) / 10,
      }
    }),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const connectionId = searchParams.get('connection_id') ?? 'default'
  const auth = req.headers.get('authorization') || ''
  try {
    const res = await serverFetch(req, `${BACKEND}/quality/forecast?connection_id=${connectionId}`, {
      cache: 'no-store',
      headers: auth ? { authorization: auth } : {},
    })
    if (!res.ok) return NextResponse.json(mockForecast(connectionId))
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json(mockForecast(connectionId))
  }
}
