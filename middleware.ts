import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

/** Clears known Auth.js session cookie names. */
function clearSessionCookies(response: NextResponse): void {
  const names = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
  ];
  for (const name of names) {
    response.cookies.set(name, '', { maxAge: 0, path: '/' });
  }
}

function redirectToLogin(req: NextRequest, clearCookies = false): NextResponse {
  const loginUrl = new URL('/login', req.url);
  const { pathname } = req.nextUrl;
  if (pathname && pathname !== '/') {
    loginUrl.searchParams.set('callbackUrl', pathname);
  }
  const response = NextResponse.redirect(loginUrl);
  if (clearCookies) clearSessionCookies(response);
  return response;
}

const protectedMiddleware = auth((req) => {
  if (!req.auth) {
    return redirectToLogin(req);
  }
});

/**
 * Protects authenticated routes. Public paths are excluded via `config.matcher`.
 * Invalid/expired session cookies are cleared instead of returning 500.
 */
export default async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  try {
    // NextAuth middleware typing expects AppRouteHandlerFnContext; runtime accepts FetchEvent.
    return await (protectedMiddleware as (req: NextRequest) => ReturnType<typeof protectedMiddleware>)(
      req,
    );
  } catch (error) {
    console.error('[middleware] auth error:', error);
    return redirectToLogin(req, true);
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|register|api/auth|api/razorpay/webhook|api/health).*)',
  ],
};
