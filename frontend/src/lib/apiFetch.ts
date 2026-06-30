import { getStoredToken, triggerGlobalLogout } from '@/context/AuthContext'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

/**
 * Drop-in replacement for `fetch` that:
 *   1. Attaches the stored Bearer token automatically.
 *   2. On 401/403 responses, clears auth state and redirects to /login.
 *
 * Use this for all internal /api/* calls from Client Components.
 */
export async function apiFetch(input: FetchInput, init?: FetchInit): Promise<Response> {
  const token = getStoredToken()
  const headers = new Headers(init?.headers)

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(input, { ...init, headers })

  if (res.status === 401 || res.status === 403) {
    triggerGlobalLogout()
  }

  return res
}
