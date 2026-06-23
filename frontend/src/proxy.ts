import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const PUBLIC_PATHS = ['/login']

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Let API routes and static assets pass through — no auth check needed here
  if (pathname.startsWith('/api/')) return NextResponse.next()

  const isPublicPath = PUBLIC_PATHS.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )

  const token = req.cookies.get('qualix_token')?.value

  // Unauthenticated user accessing a protected route — bounce to login with return URL
  if (!isPublicPath && !token) {
    const returnUrl = pathname + req.nextUrl.search
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('returnUrl', returnUrl)
    return NextResponse.redirect(loginUrl)
  }

  // Already-authenticated user hitting login — redirect to root
  if (isPublicPath && token) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
