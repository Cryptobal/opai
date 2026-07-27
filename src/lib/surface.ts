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

/** Orden de landing del portal Productividad (Correos → Tareas → Agenda). */
const PRODUCTIVIDAD_LANDING_HREFS = [
  "/crm/correos",
  "/opai/tareas",
  "/opai/agenda",
] as const;

export function parseSurface(value: string | undefined | null): Surface {
  if (value === "productividad" || value === "erp") return value;
  return DEFAULT_SURFACE;
}

/**
 * Primera ruta accesible del portal Productividad, o null si ninguna.
 * Lee los children del nodo `productividad` del registry (no hardcodea
 * la lista de nodos) y respeta permisos + tenantModule.
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
  for (const href of PRODUCTIVIDAD_LANDING_HREFS) {
    const child = children.find((c) => c.href === href);
    if (!child) continue;
    if (!isNodeVisible(child, ctx)) continue;
    return child.href;
  }

  return null;
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
