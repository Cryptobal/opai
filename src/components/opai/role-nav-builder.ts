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

import { Shield, MessageCircle } from 'lucide-react';
import type { NavItem, NavSubItem } from '@/components/opai/AppSidebar';
import {
  type RolePermissions,
  hasModuleAccess,
} from '@/lib/permissions';
import {
  NAV_MODULES,
  isNodeVisible,
  type NavNode,
  type VisibilityContext,
} from '@/lib/nav/registry';

export interface NavBadges {
  unreadMentionNotesCount?: number;
  notesByModule?: Record<string, number>;
}

export interface BuildNavItemsOptions {
  permissions: RolePermissions;
  isAdmin: boolean;
  isComplianceVisible: boolean;
  isModuleEnabled: (key: string) => boolean;
  badges?: NavBadges;
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

/* ── NavNode → NavSubItem (recursive — supports N3 in sidebar) ── */

function nodeToNavSubItem(
  node: NavNode,
  ctx: VisibilityContext,
  notes: Record<string, number>,
): NavSubItem {
  const badge = node.badge?.notesKey ? notes[node.badge.notesKey] : undefined;
  const visibleChildren = (node.children ?? [])
    .filter((c) => !c.hideInBottomNav || true /* sidebar shows hidden-in-bottom-nav too */)
    .filter((c) => isNodeVisible(c, ctx));
  return {
    href: node.href,
    label: node.label,
    icon: node.icon,
    badge,
    children: visibleChildren.length > 0
      ? visibleChildren.map((c) => nodeToNavSubItem(c, ctx, notes))
      : undefined,
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
    children: visibleChildren.length > 0
      ? visibleChildren.map((c) => nodeToNavSubItem(c, ctx, notes))
      : undefined,
  };
}

/* ── Public builder ── */

export function buildNavItems({
  permissions,
  isAdmin,
  isComplianceVisible,
  isModuleEnabled,
  badges,
}: BuildNavItemsOptions): NavItem[] {
  const notes = badges?.notesByModule ?? {};
  const unreadMentionNotesCount = badges?.unreadMentionNotesCount ?? 0;
  const moduleBadges = computeModuleBadges(notes);

  const ctx: VisibilityContext = {
    perms: permissions,
    isAdmin,
    isModuleEnabled,
  };

  const items: NavItem[] = [];

  // Hub first (no children)
  const hub = NAV_MODULES.find((m) => m.key === 'hub');
  if (hub && isNodeVisible(hub, ctx)) {
    items.push({ href: hub.href, label: hub.label, icon: hub.icon, show: true });
  }

  // Chat (legacy: not in registry — keep here)
  items.push({
    href: '/chat',
    label: 'Chat',
    icon: MessageCircle,
    show: true,
  });

  // Iterate the rest of the modules in registry order
  for (const module of NAV_MODULES) {
    if (module.key === 'hub') continue; // already added
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

  // Compliance (special case — not in registry)
  if (isComplianceVisible) {
    items.push({
      href: '/opai/compliance/arco',
      label: 'Cumplimiento',
      icon: Shield,
      show: true,
      children: [
        { href: '/opai/compliance/arco', label: 'Solicitudes ARCO', icon: Shield },
      ],
    });
  } else {
    // Hidden — show:false so it appears in RolePreview's hidden items list
    items.push({
      href: '/opai/compliance/arco',
      label: 'Cumplimiento',
      icon: Shield,
      show: false,
    });
  }

  return items;
}

/* ── Backwards-compat: re-export hasModuleAccess for callers that imported it from here ── */
export { hasModuleAccess };
