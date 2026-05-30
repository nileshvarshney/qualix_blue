import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/executions?limit=50`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json([])
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json([])
  }
}

export async function POST() {
  // Rule execution is triggered via the backend directly
  return NextResponse.json({ message: 'Use the backend /executions endpoint to run rules' }, { status: 501 })
}
