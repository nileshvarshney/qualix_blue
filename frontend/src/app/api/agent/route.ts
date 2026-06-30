import { NextRequest, NextResponse } from 'next/server'
import { serverFetch } from '@/lib/serverFetch'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const auth = req.headers.get('Authorization')

    const res = await serverFetch(req, `${BACKEND}/ai/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { response: `Service error (${res.status}). Please try again later.`, toolsUsed: [] },
        { status: 200 },
      )
    }

    const data = await res.json()
    return NextResponse.json({
      response: data.response ?? '',
      toolsUsed: data.tools_used ?? [],
    })
  } catch {
    return NextResponse.json(
      { response: 'Unable to reach the AI service. Please check that the backend is running.', toolsUsed: [] },
      { status: 200 },
    )
  }
}
