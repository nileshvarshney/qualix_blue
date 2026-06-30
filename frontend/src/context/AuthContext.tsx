'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

export type AuthUser = {
  user_id?: string
  email: string
  full_name?: string
  role: string
  domain_id?: string | null
}

type AuthContextValue = {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (token: string, user: AuthUser) => void
  logout: () => void
  updateUser: (patch: Partial<AuthUser>) => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
})

const TOKEN_KEY = 'qualix_token'
const COOKIE_MAX_AGE = 60 * 60 * 8 // 8 hours

function setTokenCookie(token: string) {
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Strict`
}

function clearTokenCookie() {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Strict`
}

// Module-level hook — lets apiFetch trigger logout without a React dependency
let _globalLogout: ((expired?: boolean) => void) | null = null

export function triggerGlobalLogout() {
  _globalLogout?.(true)
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const loggingOut = useRef(false)

  const logout = useCallback((expired = false) => {
    if (loggingOut.current) return
    loggingOut.current = true
    localStorage.removeItem(TOKEN_KEY)
    clearTokenCookie()
    setUser(null)
    loggingOut.current = false
    if (expired) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
      router.replace(`/login?returnUrl=${returnUrl}&reason=session_expired`)
    } else {
      router.replace('/login')
    }
  }, [router])

  const login = useCallback((token: string, userData: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, token)
    setTokenCookie(token)
    setUser(userData)
  }, [])

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser(prev => prev ? { ...prev, ...patch } : prev)
  }, [])

  // Register the global logout so apiFetch can call it on 401/403
  useEffect(() => {
    _globalLogout = logout
    return () => { _globalLogout = null }
  }, [logout])

  // Cold-start: validate any stored token before rendering protected content
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setIsLoading(false)
      return
    }

    fetch('/api/auth/validate', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then(r => {
        if (!r.ok) throw new Error('invalid token')
        return r.json() as Promise<AuthUser>
      })
      .then(data => {
        setUser(data)
        setTokenCookie(token) // refresh cookie TTL
      })
      .catch(() => {
        sessionStorage.setItem('session_expired', '1')
        localStorage.removeItem(TOKEN_KEY)
        clearTokenCookie()
      })
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
