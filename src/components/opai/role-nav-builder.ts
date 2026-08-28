/**
 * role-nav-builder
 *
 * Construye la lista de NavItem (sidebar) leyendo desde el registro central
 * `@/lib/nav/registry`.
 *
 * Esta capa solo:
 *  1. Aplica reglas de visibilidad (perms + isAdmin + tenantModule + capabilities).
 *  2. Inyecta badges (notas no leídas por módulo).
 *  3. Mapea `NavNode` → `NavItem` (forma esperada por `AppSidebar`).
 *
 * Comparten esta lógica:
 *  - `AppLayoutClient` (sidebar real)
 *  - `RolePreview`     (mock del sidebar para previsualizar permisos)
 */

import type { NavItem, NavSubItem } from '@/components/opai/AppSidebar';
import {
  type RolePermissions,
  hasModuleAccess,
} from '@/lib/permissions';
import {
  NAV_MODULES,
  getModule,
  isNodeVisible,
  type NavNode,
  type VisibilityContext,
} from '@/lib/nav/registry';
import { type Surface, DEFAULT_SURFACE } from '@/lib/surface';

export interface NavBadges {
  unreadMentionNotesCount?: number;
  notesByModule?: Record<string, number>;
}

export interface BuildNavItemsOptions {
  permissions: RolePermissions;
  isAdmin: boolean;
  isComplianceVisible: boolean;
  isModuleEnabled: (key: string) => boolean;
  /** Feature flags finos del tenant (opcional; ausente = todos OFF). */
  hasTenantFlag?: (flag: string) => boolean;
  badges?: NavBadges;
  /**
   * Superficie activa. `"erp"` (default) = sidebar completo actual.
   * `"productividad"` = solo el subárbol del nodo productividad (sin Hub).
   */
  surface?: Surface;
}

/* ── Module-level badge aggregation (sums child note counts up to module) ── */

function computeModuleBadges(notes: Record<string, number>) {
  return {
    crm:
      (notes.account || 0) +
      (notes.contact || 0) +
      (notes.deal || 0) +
      (notes.installation || 0) +
      (notes.lead || 0) +
      (notes.quotation || 0),
    ops:
      (notes.ticket || 0) +
      (notes.operation || 0) +
      (notes.supervision_visit || 0) +
      (notes.marcacion || 0),
    payroll: notes.payroll_record || 0,
    docs: notes.document || 0,
    finance: notes.rendicion || 0,
    personas: notes.guard || 0,
  } as Record<string, number>;
}

/* ── NavNode → NavSubItem (sidebar limit: N1 + N2 únicamente) ──
 *
 * Por convención del refactor "gold standard", el sidebar sólo expone hasta
 * N2 (módulo + sub-módulo). El N3 (sub-secciones) vive arriba del contenido
 * en `<ModuleSubNav>` montado por el layout del módulo. Por eso aquí NO
 * incluimos `children` — aunque el registry tenga descendientes, el sidebar
 * los ignora. */

function nodeToNavSubItem(
  node: NavNode,
  _ctx: VisibilityContext,
  notes: Record<string, number>,
): NavSubItem {
  const badge = node.badge?.notesKey ? notes[node.badge.notesKey] : undefined;
  return {
    href: node.href,
    label: node.label,
    icon: node.icon,
    badge,
    exactMatch: node.exactMatch,
    activePaths: node.activePaths,
    // children intencionalmente undefined — N3 vive en ModuleSubNav, no en sidebar.
  };
}

/* ── NavNode (top-level) → NavItem ── */

function moduleNodeToNavItem(
  node: NavNode,
  ctx: VisibilityContext,
  notes: Record<string, number>,
  moduleBadges: Record<string, number>,
  fallbackUnread: number,
): NavItem {
  // Badges: prefer per-module aggregate, else fallback (CRM uses unread mentions as fallback)
  const moduleBadgeKey = node.key === 'crm' ? 'crm' :
                         node.key === 'ops' ? 'ops' :
                         node.key === 'payroll' ? 'payroll' :
                         node.key === 'docs' ? 'docs' :
                         node.key === 'finance' ? 'finance' :
                         node.key === 'personas' ? 'personas' :
                         null;
  let badge: number | undefined;
  if (moduleBadgeKey && moduleBadges[moduleBadgeKey]) {
    badge = moduleBadges[moduleBadgeKey];
  } else if (node.key === 'crm' && fallbackUnread > 0) {
    badge = fallbackUnread;
  }

  const visibleChildren = (node.children ?? []).filter((c) => isNodeVisible(c, ctx));
  return {
    href: node.href,
    label: node.label,
    icon: node.icon,
    show: true,
    badge,
    exactMatch: node.exactMatch,
    activePaths: node.activePaths,
    children: visibleChildren.length > 0
      ? visibleChildren.map((c) => nodeToNavSubItem(c, ctx, notes))
      : undefined,
  };
}

/* ── Productividad surface: hijos del nodo como items top-level ── */

function buildProductividadNavItems(
  ctx: VisibilityContext,
  notes: Record<string, number>,
): NavItem[] {
  const productividad = getModule('productividad');
  if (!productividad) return [];

  // Sin Hub ni módulos ERP: solo los children visibles del nodo registry.
  return (productividad.children ?? [])
    .filter((c) => isNodeVisible(c, ctx))
    .map((c) => ({
      href: c.href,
      label: c.label,
      icon: c.icon,
      show: true as const,
      badge: c.badge?.notesKey ? notes[c.badge.notesKey] : undefined,
      activePaths: c.activePaths,
    }));
}

/* ── Public builder ── */

export function buildNavItems({
  permissions,
  isAdmin,
  isComplianceVisible,
  isModuleEnabled,
  hasTenantFlag,
  badges,
  surface = DEFAULT_SURFACE,
}: BuildNavItemsOptions): NavItem[] {
  const notes = badges?.notesByModule ?? {};
  const unreadMentionNotesCount = badges?.unreadMentionNotesCount ?? 0;
  const moduleBadges = computeModuleBadges(notes);

  const ctx: VisibilityContext = {
    perms: permissions,
    isAdmin,
    isModuleEnabled,
    isComplianceVisible,
    hasTenantFlag,
  };

  if (surface === 'productividad') {
    return buildProductividadNavItems(ctx, notes);
  }

  const items: NavItem[] = [];

  // Hub first. Sus vistas agrupadas viven en ModuleSubNav / bottom nav
  // contextual; no se duplican como árbol dentro del sidebar.
  const hub = NAV_MODULES.find((m) => m.key === 'hub');
  if (hub && isNodeVisible(hub, ctx)) {
    items.push({ href: hub.href, label: hub.label, icon: hub.icon, show: true });
  }

  // Iterate the rest of the modules in registry order
  for (const module of NAV_MODULES) {
    if (module.key === 'hub') continue; // already added
    if (module.hideInSidebar) continue; // dedicated UI surface elsewhere (e.g. Configuración in topbar)
    if (!isNodeVisible(module, ctx)) {
      // Hidden but keep show:false to support RolePreview "hidden items" panel
      items.push({
        href: module.href,
        label: module.label,
        icon: module.icon,
        show: false,
      });
      continue;
    }
    items.push(moduleNodeToNavItem(module, ctx, notes, moduleBadges, unreadMentionNotesCount));
  }

  return items;
}

/* ── Backwards-compat: re-export hasModuleAccess for callers that imported it from here ── */
export { hasModuleAccess };
