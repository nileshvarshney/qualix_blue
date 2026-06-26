import { NextRequest } from 'next/server'

/**
 * Server-side fetch wrapper that forwards the incoming Authorization header
 * to the FastAPI backend. Use in all Next.js API route handlers that proxy
 * to the backend, so browser JWTs are not stripped at the proxy layer.
 */
export function serverFetch(
  req: NextRequest,
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const auth = req.headers.get('authorization')
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
      ...(init.headers as Record<string, string> | undefined ?? {}),
    },
  })
}
