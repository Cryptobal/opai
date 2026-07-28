/**
 * Superficie de presentación (ERP vs Productividad).
 *
 * Estado de sesión (cookie), NO autorización. La cookie nunca decide acceso
 * a datos; solo filtra la navegación renderizada.
 */

import {
  canView,
  hasModuleAccess,
  type RolePermissions,
} from "@/lib/permissions";
import {
  getModule,
  isNodeVisible,
  pathMatchesNode,
  type VisibilityContext,
} from "@/lib/nav/registry";

export type Surface = "productividad" | "erp";

export const SURFACE_COOKIE = "opai-surface";
export const DEFAULT_SURFACE: Surface = "erp";

/**
 * Última landing resuelta del portal Productividad.
 * La lee el middleware en `/productividad` para evitar el doble viaje
 * (auth+queries → redirect) en arranques PWA en caliente.
 */
export const PRODUCTIVIDAD_LANDING_COOKIE = "opai-prod-landing";

/** Home de la superficie Productividad (resumen Agenda → Correos → Tareas). */
export const PRODUCTIVIDAD_HOME_HREF = "/productividad/inicio";

/** Secciones accionables del portal (orden de preferencia legacy). */
export const PRODUCTIVIDAD_SECTION_HREFS = [
  "/crm/correos",
  "/opai/tareas",
  "/opai/agenda",
] as const;

/** Orden de landing: home primero, luego secciones. */
export const PRODUCTIVIDAD_LANDING_HREFS = [
  PRODUCTIVIDAD_HOME_HREF,
  ...PRODUCTIVIDAD_SECTION_HREFS,
] as const;

/** Opciones de cookie de superficie (sesión de presentación, no auth). */
export function surfaceCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 365) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}

/**
 * ¿Cookie de landing usable por el middleware (sin tocar BD)?
 *
 * Acepta el home y los tres hrefs legacy de sección, pero **siempre**
 * devuelve `PRODUCTIVIDAD_HOME_HREF`. Una cookie legacy implica que el
 * usuario tenía al menos una sección visible → el home también lo es;
 * así se migran dispositivos ya instalados sin escritura adicional.
 */
export function parseProductividadLandingCookie(
  value: string | undefined | null,
): typeof PRODUCTIVIDAD_HOME_HREF | null {
  if (!value) return null;
  return (PRODUCTIVIDAD_LANDING_HREFS as readonly string[]).includes(value)
    ? PRODUCTIVIDAD_HOME_HREF
    : null;
}

export function parseSurface(value: string | undefined | null): Surface {
  if (value === "productividad" || value === "erp") return value;
  return DEFAULT_SURFACE;
}

/**
 * Primera ruta accesible del portal Productividad, o null si ninguna.
 * Prioriza el home cuando hay al menos una sección (Agenda/Correos/Tareas)
 * visible; si el nodo home no es visible, cae a la primera sección.
 */
export function resolveProductividadLanding(
  permissions: RolePermissions,
  isModuleEnabled: (key: string) => boolean,
  options?: { isAdmin?: boolean },
): string | null {
  const node = getModule("productividad");
  if (!node) return null;

  if (!hasModuleAccess(permissions, "productividad")) {
    // Sin acceso al módulo: aún puede haber tickets (ops), pero la landing
    // del portal solo considera Correos/Tareas/Agenda.
  }

  const ctx: VisibilityContext = {
    perms: permissions,
    isAdmin: options?.isAdmin ?? false,
    isModuleEnabled,
    isComplianceVisible: false,
  };

  const children = node.children ?? [];
  let firstSection: string | null = null;
  for (const href of PRODUCTIVIDAD_SECTION_HREFS) {
    const child = children.find((c) => c.href === href);
    if (!child) continue;
    if (!isNodeVisible(child, ctx)) continue;
    firstSection = child.href;
    break;
  }

  if (!firstSection) return null;

  const home = children.find((c) => c.href === PRODUCTIVIDAD_HOME_HREF);
  if (home && isNodeVisible(home, ctx)) {
    return PRODUCTIVIDAD_HOME_HREF;
  }

  return firstSection;
}

/** ¿El pathname pertenece al portal Productividad (registry)? */
export function isProductividadPath(pathname: string): boolean {
  const node = getModule("productividad");
  if (!node) return false;
  if (pathMatchesNode(pathname, node)) return true;
  return (node.children ?? []).some((c) => pathMatchesNode(pathname, c));
}

/** ¿El usuario puede usar el portal Productividad (alguna landing)? */
export function canAccessProductividadPortal(
  permissions: RolePermissions,
  isModuleEnabled: (key: string) => boolean,
  options?: { isAdmin?: boolean },
): boolean {
  return resolveProductividadLanding(permissions, isModuleEnabled, options) !== null;
}

/** Helper de permisos para tests / callers que no tienen VisibilityContext. */
export function hasProductividadSubAccess(
  permissions: RolePermissions,
  submodule: "correos" | "agenda" | "tareas",
): boolean {
  return canView(permissions, "productividad", submodule);
}
