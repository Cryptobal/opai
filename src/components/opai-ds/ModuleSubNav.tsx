"use client";

/**
 * ModuleSubNav — SubNav de N3 que se autoconfigura desde el registry.
 *
 * Reemplaza los 12 archivos `*Subnav.tsx` (Inventario, Rondas, Pautas, Reportes,
 * Documentos, etc). El componente:
 *
 *  1. Lee el pathname actual.
 *  2. Encuentra el N3 parent en el registry (`findN3Parent`).
 *  3. Filtra hijos por permisos del usuario actual + módulos del tenant.
 *  4. Renderiza un `<SwipeTabs>` con los items resultantes.
 *
 * Si la ruta no tiene un N3 parent (o no hay items visibles), el componente
 * devuelve `null` — es seguro de renderizar en cualquier layout.
 *
 * Pattern de uso (en un page.tsx o layout.tsx):
 *
 *   <ModuleSubNav />              ← auto-detect del path
 *   <ModuleSubNav moduleKey="..."/>  ← forzar un módulo específico
 *
 * Visibilidad responsive:
 *   default → SIEMPRE visible (mobile + desktop). Es un nav primary.
 *   "desktop-only" → solo en lg+ (raro, pero útil cuando el bottom nav ya
 *                     muestra los mismos items en mobile).
 */

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import { usePermissions } from "@/lib/permissions-context";
import {
  findN3Parent,
  getModule,
  isNodeVisible,
  type NavNode,
  type VisibilityContext,
} from "@/lib/nav/registry";
import { SwipeTabs, type SwipeTabItem } from "./SwipeTabs";
import { cn } from "@/lib/utils";

export interface ModuleSubNavProps {
  /** When provided, forces the sub-nav of this specific module key (e.g. "ops-pautas").
   *  If omitted, the active N3 parent is detected from the URL. */
  moduleKey?: string;
  /** Override visibility:
   *   - default: visible everywhere
   *   - "desktop-only": hidden on mobile (use when the bottom nav already shows the same items)
   */
  visibility?: "default" | "desktop-only";
  /** Additional class on the wrapper. */
  className?: string;
  /** Trailing action shown after the tabs (e.g. "Nueva visita"). */
  trailingAction?: React.ReactNode;
  /** Force a specific item to be active (overrides path matching). Used for query-param-based tabs. */
  activeHref?: string;
}

function nodeToTabItem(node: NavNode): SwipeTabItem {
  return {
    href: node.href,
    label: node.shortLabel ?? node.label,
    icon: node.icon,
    exactMatch: node.exactMatch,
  };
}

export function ModuleSubNav({
  moduleKey,
  visibility = "default",
  className,
  trailingAction,
  activeHref: _activeHref,
}: ModuleSubNavProps) {
  const pathname = usePathname() ?? "/";
  const permissions = usePermissions();
  const { isModuleEnabled } = useTenantModules();

  const ctx: VisibilityContext = useMemo(
    () => ({
      perms: permissions,
      isAdmin: false, // sub-nav doesn't need admin checks
      isModuleEnabled,
    }),
    [permissions, isModuleEnabled],
  );

  // Determine N3 parent: explicit moduleKey wins, else auto-detect from path
  const n3Parent: NavNode | undefined = useMemo(() => {
    if (moduleKey) return getModule(moduleKey) ?? findChildByKey(moduleKey);
    return findN3Parent(pathname);
  }, [moduleKey, pathname]);

  const items = useMemo<SwipeTabItem[]>(() => {
    if (!n3Parent || !n3Parent.children) return [];
    return n3Parent.children
      .filter((c) => !c.hideInSubNav)
      .filter((c) => isNodeVisible(c, ctx))
      .map(nodeToTabItem);
  }, [n3Parent, ctx]);

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        visibility === "desktop-only" && "hidden lg:block",
        className,
      )}
    >
      <SwipeTabs items={items} trailingAction={trailingAction} />
    </div>
  );
}

/* ── helpers ── */

import { NAV_MODULES } from "@/lib/nav/registry";

function findChildByKey(key: string): NavNode | undefined {
  const visit = (node: NavNode): NavNode | undefined => {
    if (node.key === key) return node;
    for (const c of node.children ?? []) {
      const r = visit(c);
      if (r) return r;
    }
    return undefined;
  };
  for (const m of NAV_MODULES) {
    const r = visit(m);
    if (r) return r;
  }
  return undefined;
}
