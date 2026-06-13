import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const sessionId = request.cookies.get('sessionId')?.value;
  const { pathname } = request.nextUrl;

  const isAuthRoute = pathname === '/login';

  // If there's no session and the user is trying to access a protected route
  if (!sessionId && !isAuthRoute) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // If there is a session and the user is trying to access login page
  if (sessionId && isAuthRoute) {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - assets and figma (local public assets)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|assets|figma).*)',
  ],
};
