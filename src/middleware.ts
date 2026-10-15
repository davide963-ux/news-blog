import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/** First line of defence for /admin: requires a valid signed session cookie. Pages/actions re-check against the DB. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();
  const token = req.cookies.get('nb_session')?.value;
  // Fail closed: in production a missing secret must never fall back to the (public) development default.
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-only-insecure-session-secret-change-me-please-32chars');
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
      return NextResponse.next();
    } catch { /* fall through */ }
  }
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/admin/:path*'] };
