/**
 * Middleware - Protección de rutas con Auth.js v5
 * OPAI: opai.gard.cl - Rutas bajo /opai/*
 *
 * Protege: /opai/inicio, /opai/templates/*, /opai/preview/*, /opai/usuarios
 * Permite: /p/*, /api/*, /opai/login, /activate, assets
 *
 * Placeholders públicos: /hub, /crm
 */

import { auth } from '@/lib/auth';

function isPublicPath(pathname: string): boolean {
  // Placeholders de módulos
  if (pathname === '/hub' || pathname === '/crm') return true;

  // Rutas públicas OPAI - presentaciones y preview (rutas reales: /p/, /preview/, /templates/)
  if (pathname.startsWith('/p/')) return true;
  if (pathname.startsWith('/preview/')) return true;

  // API (rutas reales en /api/)
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname.startsWith('/api/webhook')) return true;
  if (pathname.startsWith('/api/test')) return true;
  if (pathname === '/api/presentations/send-email') return true;
  if (/^\/api\/presentations\/[^/]+\/track$/.test(pathname)) return true;
  if (pathname.startsWith('/api/debug')) return true;
  if (pathname.startsWith('/api/email-preview')) return true;
  if (pathname.startsWith('/api/pdf')) return true;

  // Páginas públicas
  if (pathname === '/' || pathname === '/opai' || pathname === '/opai/login' || pathname.startsWith('/activate')) return true;

  // Assets y estáticos
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/images') || pathname.startsWith('/logos')) return true;

  return false;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return;

  // Rutas protegidas: sin sesión -> login OPAI
  if (!req.auth) {
    const loginUrl = new URL('/opai/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
