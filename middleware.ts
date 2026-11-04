import { NextRequest, NextResponse } from 'next/server';
import { STAFF_SESSION_COOKIE, verifyStaffToken } from '@/lib/auth/token';

// Strict protection for the staff control panel.
// Any /staff/* route (except the login page itself) requires a valid
// httpOnly session cookie signed with STAFF_SESSION_SECRET.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === '/staff/login') {
    return NextResponse.next();
  }

  const secret = process.env.STAFF_SESSION_SECRET;
  const token = req.cookies.get(STAFF_SESSION_COOKIE)?.value;

  let authenticated = false;
  if (secret && secret.length >= 32 && token) {
    const claims = await verifyStaffToken(token, secret);
    authenticated = Boolean(claims && claims.exp > Date.now());
  }

  if (!authenticated) {
    const loginUrl = new URL('/staff/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/staff/:path*'],
};
