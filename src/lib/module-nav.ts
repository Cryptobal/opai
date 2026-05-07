/**
 * module-nav — bottom-nav items por contexto.
 *
 * Thin wrapper sobre `@/lib/nav/registry` que decide qué items mostrar en el
 * bottom nav (mobile) según la ruta actual, los permisos del usuario y los
 * módulos habilitados del tenant.
 *
 * El registro de items vive en `src/lib/nav/registry.ts`. Este archivo solo
 * traduce nodos del registry al shape `BottomNavItem` y aplica filtros.
 *
 * Pattern HubSpot/Salesforce: cuando entras en un módulo, el bottom nav muestra
 * las sub-secciones contextuales de ese módulo (N2 o N3) en lugar del menú
 * principal. CRM detail pages (leads/[id], etc.) NO devuelven items: el header
 * de detalle (EntityDetailLayout) maneja la nav interna.
 */

import type { LucideIcon } from "lucide-react";
import {
  type RolePermissions,
  type ModuleKey,
  getDefaultPermissions,
} from "./permissions";
import {
  NAV_MODULES,
  isNodeVisible,
  type NavNode,
  type VisibilityContext,
  getContextualBottomNavNodes,
} from "./nav/registry";

/* ── Public types (back-compat) ── */

export interface BottomNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

/* ── Helpers ── */

function nodeToBottomNavItem(node: NavNode): BottomNavItem {
  return {
    key: node.key,
    href: node.href,
    label: node.shortLabel ?? node.label,
    icon: node.icon,
  };
}

/**
 * Devuelve los items del bottom nav según la ruta actual y el rol del usuario.
 *
 * En páginas de detalle CRM (leads / accounts / contacts / deals / installations)
 * NO devolvemos section items: esas páginas usan EntityDetailLayout con ChipTabs
 * horizontales en el header para navegar entre secciones, y la bottom nav se
 * reserva para navegación entre módulos (patrón HubSpot / Salesforce / Pipedrive).
 *
 * Acepta un role string (usa defaults) o un RolePermissions object.
 */
export function getBottomNavItems(
  pathname: string,
  roleOrPerms: string | RolePermissions,
  enabledModules?: Set<string>,
): BottomNavItem[] {
  const perms: RolePermissions =
    typeof roleOrPerms === "string"
      ? getDefaultPermissions(roleOrPerms)
      : roleOrPerms;

  const ctx: VisibilityContext = {
    perms,
    isAdmin: false, // bottom nav is contextual; admin-only nodes are filtered separately
    isModuleEnabled: (mod: string) => !enabledModules || enabledModules.has(mod),
  };

  const candidates = getContextualBottomNavNodes(pathname);
  return candidates
    .filter((n) => !n.hideInBottomNav)
    .filter((n) => isNodeVisible(n, ctx))
    .map(nodeToBottomNavItem);
}

/** Re-export del registry para casos avanzados (ej. RolePreview muestra un preview por módulo). */
export type { ModuleKey };
export { NAV_MODULES };
