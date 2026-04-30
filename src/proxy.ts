/**
 * Middleware - Protección de rutas con Auth.js v5
 * OPAI: Rutas bajo /opai/*
 *
 * Protege: /opai/inicio, /opai/templates/*, /opai/preview/*, /opai/usuarios
 * Permite: /p/*, /api/*, /opai/login, /activate, assets
 *
 * Placeholders públicos: /hub, /crm
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getDefaultPermissions,
  hasModuleAccess,
  canView,
  canEdit,
  canDelete,
  canViewInstallations,
  canEditInstallations,
  canDeleteInstallations,
  apiPathToModule,
  apiPathToSubmodule,
  type RolePermissions,
  type ModuleKey,
} from '@/lib/permissions';

function isPublicPath(pathname: string): boolean {
  // Marketing site pages (route group: (marketing))
  const marketingPaths = [
    '/funcionalidades', '/planes', '/blog', '/nosotros', '/contacto',
    '/registrarse', '/erp-seguridad-privada', '/control-rondas-gps',
    '/ia-seguridad-privada', '/integraciones', '/privacidad', '/terminos',
    '/empleos',
  ];
  for (const mp of marketingPaths) {
    if (pathname === mp || pathname.startsWith(mp + '/')) return true;
  }

  // SEO: sitemap, robots, y archivos para crawlers de IA
  if (pathname === '/sitemap.xml' || pathname === '/robots.txt') return true;
  if (pathname === '/llms.txt' || pathname === '/llms-full.txt') return true;
  if (pathname.startsWith('/.well-known/')) return true;

  // Sentry tunnel (next.config.js → tunnelRoute: "/monitoring")
  // Sin esto, los eventos de Sentry son redirigidos a login y CORS los bloquea,
  // dejando al equipo ciego ante errores de Server Components en producción.
  if (pathname.startsWith('/monitoring')) return true;

  // Placeholders de módulos
  if (pathname === '/hub' || pathname === '/crm') return true;

  // Rutas públicas OPAI - presentaciones y preview (rutas reales: /p/, /preview/, /templates/)
  if (pathname.startsWith('/p/')) return true;
  if (pathname.startsWith('/preview/')) return true;
  if (pathname.startsWith('/postulacion/')) return true;
  if (pathname.startsWith('/ingreso-te')) return true;
  if (pathname.startsWith('/marcar/')) return true; // Marcación de asistencia (pública)
  if (pathname.startsWith('/marcacion/oposicion/')) return true; // Página pública de oposición
  if (pathname.startsWith('/api/marcacion/oposicion/')) return true; // API pública de oposición
  if (pathname.startsWith('/ronda/')) return true; // Rondas de seguridad (pública)
  // Portal guardia y cliente usan auth propia (PIN). El ERP usa NextAuth.
  if (pathname.startsWith('/portal/guardia')) return true;
  if (pathname.startsWith('/portal/cliente')) return true;
  if (pathname.startsWith('/portal/rondas')) return true;
  if (pathname.startsWith('/portal/acceso')) return true; // Control de acceso (auth por device_token)
  if (pathname.startsWith('/portal/marcacion')) return true; // Portal Marcación (auth por device_token)
  if (pathname.startsWith('/portal/terreno')) return true; // Hub Opai Terreno (auth por device_token)
  if (pathname.startsWith('/portal/personas')) return true; // Hub Opai Personas (login unificado RUT+PIN / Google / cookie)
  if (pathname.startsWith('/registro-demo')) return true; // Auto-registro prospecto demo
  if (pathname.startsWith('/descargar')) return true; // PWA download landing pages
  if (pathname === '/welcome') return true;
  if (pathname.startsWith('/api/branding')) return true;

  // API (rutas reales en /api/)
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname.startsWith('/api/webhook')) return true;
  if (pathname.startsWith('/api/test')) return true;
  if (/^\/api\/presentations\/[^/]+\/track$/.test(pathname)) return true;
  if (pathname.startsWith('/api/debug')) return true;
  if (pathname.startsWith('/api/pdf')) return true;
  if (pathname.startsWith('/api/cron')) return true; // Cron jobs (protegidos por CRON_SECRET)
  if (pathname.startsWith('/api/fx/sync')) return true; // FX sync cron (protegido por CRON_SECRET)
  if (pathname.startsWith('/api/public')) return true;
  if (pathname.startsWith('/api/patrol')) return true; // Patrol API (auth propia con PIN)
  // Portal guardia y cliente usan auth propia (PIN). El ERP usa NextAuth.
  if (pathname.startsWith('/api/portal/guardia')) return true;
  if (pathname.startsWith('/api/portal/cliente')) return true;
  if (pathname.startsWith('/api/portal/rondas')) return true;
  if (pathname.startsWith('/api/portal/auth/unified-google')) return true; // Unified OAuth (multi-role resolution)
  if (pathname.startsWith('/api/tenant/branding')) return true; // Public branding for hubs
  if (pathname.startsWith('/api/push/register')) return true; // Push token registration (auth checked in-route)
  if (pathname.startsWith('/api/access-control/')) return true; // All access-control routes use device_token auth
  if (pathname === '/api/devices/pair') return true; // Unified device pairing (no auth)
  if (pathname === '/api/devices/validate') return true; // Device validation (auth by device_token)
  if (pathname === '/api/devices/guards') return true; // Guards for device (auth by device_token)
  if (pathname === '/api/devices/set-guard') return true; // Set guard (auth by device_token)
  if (pathname === '/api/devices/heartbeat') return true; // Heartbeat (auth by device_token)
  if (pathname === '/api/devices/legacy-auth-enabled') return true; // Public config check
  // Push subscription & preferences — portal users authenticate via PIN, not NextAuth
  if (pathname.startsWith('/api/notifications/push/subscribe')) return true;
  if (pathname.startsWith('/api/notifications/push/preferences')) return true;
  // Firma electrónica pública: GET/POST por token sin sesión
  if (pathname.startsWith('/api/docs/sign')) return true;
  // Vista pública de documento firmado (por viewToken)
  if (pathname.startsWith('/api/docs/signed-view/')) return true;
  // PDF firmado: acceso con viewToken en query (la ruta valida el token)
  if (/^\/api\/docs\/documents\/[^/]+\/signed-pdf$/.test(pathname)) return true;

  // Páginas públicas (raíz / y /opai se manejan abajo para redirigir siempre a login/inicio)
  if (pathname === '/opai/login' || pathname.startsWith('/activate')) return true;
  if (pathname === '/opai/forgot-password' || pathname === '/opai/reset-password') return true;

  // Firma electrónica: link del email, sin login (token en URL)
  if (pathname.startsWith('/sign/')) return true;
  // Ver documento firmado (link público sin login)
  if (pathname.startsWith('/signed/')) return true;

  // Assets y estáticos
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/images') || pathname.startsWith('/logos')) return true;

  return false;
}

function getAuthData(authData: unknown): { role: string; roleTemplateId?: string | null } {
  if (!authData || typeof authData !== 'object') return { role: '' };
  const authObj = authData as {
    role?: string;
    roleTemplateId?: string | null;
    user?: { role?: string; roleTemplateId?: string | null };
  };
  return {
    role: authObj.user?.role ?? authObj.role ?? '',
    roleTemplateId: authObj.user?.roleTemplateId ?? authObj.roleTemplateId ?? null,
  };
}

/**
 * Resuelve permisos desde auth data del JWT.
 * 
 * Para roles legacy (owner, admin, editor, etc.) usa defaults hardcodeados.
 * Para roles custom (roleTemplateId presente) retorna null → se salta
 * el enforcement en middleware y la API route lo valida por BD.
 */
function resolvePermsFromAuth(authData: unknown): RolePermissions | null {
  const { role, roleTemplateId } = getAuthData(authData);

  // Roles custom: no podemos resolver desde BD en middleware (sync-only).
  // Dejamos que la API route individual haga la validación granular.
  if (roleTemplateId && !(role in DEFAULT_ROLE_PERMISSIONS_MAP)) {
    return null;
  }

  return getDefaultPermissions(role);
}

// Roles legacy conocidos (para distinguirlos de custom)
const DEFAULT_ROLE_PERMISSIONS_MAP: Record<string, true> = {
  owner: true, admin: true, editor: true, rrhh: true, operaciones: true,
  finanzas: true, reclutamiento: true, solo_ops: true, solo_crm: true,
  solo_documentos: true, solo_payroll: true, supervisor: true, viewer: true,
};

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ── Platform Admin portal ──
  // Uses its own auth (platform-session cookie), not Auth.js.
  // Redirect to platform login if cookie is missing (except login page itself).
  if (pathname.startsWith('/platform') && !pathname.startsWith('/platform/login')) {
    const platformSession = req.cookies.get('platform-session');
    if (!platformSession?.value) {
      return NextResponse.redirect(new URL('/platform/login', req.url));
    }
    return NextResponse.next();
  }
  // Platform login page: always accessible
  if (pathname.startsWith('/platform/login')) {
    return NextResponse.next();
  }

  // Marketing landing: si el host es opai.cl, dejar pasar la landing page
  const host = req.headers.get('host') || '';
  const isMarketingHost = host === 'opai.cl' || host === 'www.opai.cl' || host.startsWith('localhost') || host.includes('vercel.app');

  if (pathname === '/' && isMarketingHost) {
    // Let the (marketing) route group handle it
    return;
  }

  // Entrada al sitio (ERP): welcome (sin sesión) o Hub (con sesión)
  if (pathname === '/' || pathname === '/opai' || (pathname === '/hub' && !req.auth)) {
    if (!req.auth) {
      return Response.redirect(new URL('/welcome', req.nextUrl.origin));
    }
    return Response.redirect(new URL('/hub', req.nextUrl.origin));
  }

  // Authenticated user on /welcome → skip to hub
  if (pathname === '/welcome' && req.auth) {
    return Response.redirect(new URL('/hub', req.nextUrl.origin));
  }

  // ── Portal-aware session isolation ──
  // Prevent Auth.js sessions from leaking between ERP admin sessions and other contexts.
  if (req.auth) {
    const sessionPortal = (req.auth as any)?.portal as string | undefined;

    // ERP routes: ensure session was created for ERP context
    if (
      (pathname.startsWith('/opai') && pathname !== '/opai/login' && !pathname.startsWith('/opai/forgot') && !pathname.startsWith('/opai/reset')) ||
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
      if (sessionPortal && sessionPortal !== 'opai') {
        // Non-ERP portal session trying to access ERP — treat as unauthenticated
        if (pathname.startsWith('/api/')) {
          return Response.json(
            { success: false, error: 'Sesión no válida para este portal' },
            { status: 401 },
          );
        }
        const loginUrl = new URL('/opai/login', req.nextUrl.origin);
        loginUrl.searchParams.set('portal', 'opai');
        loginUrl.searchParams.set('callbackUrl', pathname);
        return Response.redirect(loginUrl);
      }
    }
  }

  if (isPublicPath(pathname)) return;

  // Rutas protegidas: sin sesión
  if (!req.auth) {
    // API routes: return 401 JSON (never redirect — callers expect JSON)
    if (pathname.startsWith('/api/')) {
      return Response.json(
        { success: false, error: 'No autorizado' },
        { status: 401 },
      );
    }
    // Page navigations: redirect to login
    const loginUrl = new URL('/opai/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return Response.redirect(loginUrl);
  }

  // Endurecimiento de APIs por módulo y submódulo con niveles de permiso
  const apiModule = apiPathToModule(pathname);
  if (apiModule) {
    const perms = resolvePermsFromAuth(req.auth);

    // Si perms es null → rol custom; la API route valida por BD
    if (perms) {
      const method = req.method;
      const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
      const apiSub = apiPathToSubmodule(pathname);

      // Caso especial: instalaciones acepta crm.installations O ops.installations
      const isInstallationsPath = apiSub?.module === 'crm' && apiSub?.submodule === 'installations';

      // Verificar acceso al módulo (salvo instalaciones: acepta ops.installations)
      if (isInstallationsPath) {
        if (!canViewInstallations(perms)) {
          return Response.json(
            { success: false, error: 'Sin permisos para Instalaciones' },
            { status: 403 }
          );
        }
        if (method === 'DELETE' && !canDeleteInstallations(perms)) {
          return Response.json(
            { success: false, error: 'Sin permisos para eliminar Instalaciones' },
            { status: 403 }
          );
        }
        if (method !== 'DELETE' && isWrite && !canEditInstallations(perms)) {
          return Response.json(
            { success: false, error: 'Sin permisos de escritura para Instalaciones' },
            { status: 403 }
          );
        }
      } else {
        if (!hasModuleAccess(perms, apiModule)) {
          return Response.json(
            { success: false, error: `Sin permisos para módulo ${apiModule.toUpperCase()}` },
            { status: 403 }
          );
        }

        // Verificar acceso al submódulo (si se puede mapear)
        if (apiSub) {
          if (method === 'DELETE' && !canDelete(perms, apiSub.module, apiSub.submodule)) {
            return Response.json(
              { success: false, error: `Sin permisos para eliminar en ${apiSub.module}.${apiSub.submodule}` },
              { status: 403 }
            );
          }
          if (method !== 'DELETE' && isWrite && !canEdit(perms, apiSub.module, apiSub.submodule)) {
            return Response.json(
              { success: false, error: `Sin permisos de escritura para ${apiSub.module}.${apiSub.submodule}` },
              { status: 403 }
            );
          }
          if (!isWrite && !canView(perms, apiSub.module, apiSub.submodule)) {
            return Response.json(
              { success: false, error: `Sin permisos de lectura para ${apiSub.module}.${apiSub.submodule}` },
              { status: 403 }
            );
          }
        }
      }
    }
  }
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|workbox-.*\\.js|.*manifest.*\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
