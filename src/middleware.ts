/**
 * Middleware — Portal-aware session isolation
 *
 * Prevents Auth.js sessions from leaking across portals.
 * The supervisor portal uses Auth.js (shared with ERP admin). Without this
 * middleware, logging into the ERP admin would also authenticate you in the
 * supervisor portal and vice-versa.
 *
 * Strategy: Read the `portal` claim from the JWT. If the current path belongs
 * to a different portal than what the JWT was issued for, treat the user as
 * unauthenticated for that portal and redirect to the correct login.
 *
 * NOTE: Edge runtime — no Prisma, no heavy imports.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

/** Map path prefixes to their portal identifiers */
function getPortalFromPath(pathname: string): string | null {
  if (pathname.startsWith('/portal/supervisor')) return 'supervisor';
  // ERP admin routes live under (app) group which maps to /opai/*, /hub, /crm, etc.
  if (
    pathname.startsWith('/opai') ||
    pathname.startsWith('/hub') ||
    pathname.startsWith('/crm') ||
    pathname.startsWith('/personas') ||
    pathname.startsWith('/finanzas') ||
    pathname.startsWith('/payroll') ||
    pathname.startsWith('/ops') ||
    pathname.startsWith('/te') ||
    pathname.startsWith('/portales') ||
    pathname.startsWith('/fiscalizacion') ||
    pathname.startsWith('/inventario')
  ) {
    return 'opai';
  }
  return null;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const token = req.auth;

  const pathPortal = getPortalFromPath(pathname);

  // Only enforce isolation for Auth.js-protected portals
  if (!pathPortal) return NextResponse.next();

  // If no session, let the downstream layout/page handle redirect
  if (!token?.user) return NextResponse.next();

  const sessionPortal = (token as any).portal as string | undefined;

  // If session has no portal claim (legacy sessions), allow access but stamp it
  // on the next JWT refresh via the jwt callback.
  if (!sessionPortal) return NextResponse.next();

  // If portal matches, allow
  if (sessionPortal === pathPortal) return NextResponse.next();

  // Portal mismatch: redirect to the correct login for the target portal
  if (pathPortal === 'supervisor') {
    // User has an ERP session but is trying to access supervisor portal
    // Redirect to the supervisor-specific login flow
    const loginUrl = new URL('/opai/login', req.url);
    loginUrl.searchParams.set('portal', 'supervisor');
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathPortal === 'opai') {
    // User has a supervisor session but is trying to access ERP
    const loginUrl = new URL('/opai/login', req.url);
    loginUrl.searchParams.set('portal', 'opai');
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match routes that use Auth.js sessions.
     * Excludes API routes, static files, images, and portal-specific auth
     * (cliente, guardia, rondas, marcacion, acceso use their own auth systems).
     */
    '/opai/:path*',
    '/hub/:path*',
    '/crm/:path*',
    '/personas/:path*',
    '/finanzas/:path*',
    '/payroll/:path*',
    '/ops/:path*',
    '/te/:path*',
    '/portales/:path*',
    '/fiscalizacion/:path*',
    '/inventario/:path*',
    '/portal/supervisor/:path*',
  ],
};
