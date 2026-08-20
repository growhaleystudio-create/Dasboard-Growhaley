import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Never redirect API routes or the login page itself
  if (pathname.startsWith('/api') || pathname === '/login') {
    return NextResponse.next();
  }

  // For dashboard routes, let the client-side handle auth.
  // The client stores sessionId in localStorage and sends it via headers.
  // We cannot check localStorage from middleware (server-side),
  // so we only redirect if there's definitely no session cookie AND
  // the request is for the root page (not dashboard sub-pages).
  // Dashboard pages have their own client-side auth handling.
  if (pathname.startsWith('/dashboard')) {
    return NextResponse.next();
  }

  // For other routes, check cookie
  const sessionId = request.cookies.get('sessionId')?.value;
  if (!sessionId) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|assets|figma).*)',
  ],
};
