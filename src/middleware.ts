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
import {
  getDefaultPermissions,
  hasModuleAccess,
  canView,
  canEdit,
  canDelete,
  apiPathToModule,
  apiPathToSubmodule,
  type RolePermissions,
  type ModuleKey,
} from '@/lib/permissions';

function isPublicPath(pathname: string): boolean {
  // Placeholders de módulos
  if (pathname === '/hub' || pathname === '/crm') return true;

  // Rutas públicas OPAI - presentaciones y preview (rutas reales: /p/, /preview/, /templates/)
  if (pathname.startsWith('/p/')) return true;
  if (pathname.startsWith('/preview/')) return true;
  if (pathname.startsWith('/postulacion/')) return true;
  if (pathname.startsWith('/marcar/')) return true; // Marcación de asistencia (pública)
  if (pathname.startsWith('/ronda/')) return true; // Rondas de seguridad (pública)
  if (pathname.startsWith('/portal/')) return true; // Portal del guardia (auth propia con PIN)

  // API (rutas reales en /api/)
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname.startsWith('/api/webhook')) return true;
  if (pathname.startsWith('/api/test')) return true;
  if (pathname === '/api/presentations/send-email') return true;
  if (/^\/api\/presentations\/[^/]+\/track$/.test(pathname)) return true;
  if (pathname.startsWith('/api/debug')) return true;
  if (pathname.startsWith('/api/email-preview')) return true;
  if (pathname.startsWith('/api/pdf')) return true;
  if (pathname.startsWith('/api/public')) return true;
  if (pathname.startsWith('/api/portal')) return true; // Portal del guardia (auth propia con PIN)
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
  solo_documentos: true, solo_payroll: true, solo_finanzas: true, viewer: true,
};

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Entrada al sitio: siempre llevar a login (sin sesión) o al Hub (con sesión)
  if (pathname === '/' || pathname === '/opai') {
    if (!req.auth) {
      const loginUrl = new URL('/opai/login', req.nextUrl.origin);
      loginUrl.searchParams.set('callbackUrl', '/hub');
      return Response.redirect(loginUrl);
    }
    return Response.redirect(new URL('/hub', req.nextUrl.origin));
  }

  if (isPublicPath(pathname)) return;

  // Rutas protegidas: sin sesión -> login OPAI
  if (!req.auth) {
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

      // Verificar acceso al módulo
      if (!hasModuleAccess(perms, apiModule)) {
        return Response.json(
          { success: false, error: `Sin permisos para módulo ${apiModule.toUpperCase()}` },
          { status: 403 }
        );
      }

      // Verificar acceso al submódulo (si se puede mapear)
      const apiSub = apiPathToSubmodule(pathname);
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
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
