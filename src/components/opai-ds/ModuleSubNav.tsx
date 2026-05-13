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
 * ## Visibilidad responsive — IMPORTANTE
 *
 * Default: `desktop-only`. Por qué: en mobile el `BottomNav` (`ModuleSubNav`
 * interno) ya muestra los mismos N3 cuando estás en una sub-sección con
 * children. Renderizar SubNav arriba duplica el control y agrega ruido. En
 * desktop el sidebar puede estar colapsado, así que SubNav arriba es la
 * forma más rápida de saltar entre N3.
 *
 * Si querés mostrar el SubNav también en mobile (caso raro: cuando la
 * página activa NO tiene equivalencia en bottom nav, ej. una vista temporal
 * o un layout especial), pasá `visibility="always"`.
 */

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import { usePermissions } from "@/lib/permissions-context";
import {
  findChildByKey,
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
   *   - "desktop-only" (default): hidden on mobile — bottom nav cubre N3 en mobile.
   *   - "always": visible en mobile + desktop. Usar solo cuando la ruta NO
   *     tiene equivalencia en bottom nav (raro).
   */
  visibility?: "desktop-only" | "always";
  /** Additional class on the wrapper. */
  className?: string;
  /** Trailing action shown after the tabs (e.g. "Nueva visita"). */
  trailingAction?: React.ReactNode;
  /** Force a specific item to be active (overrides path matching). Used for query-param-based tabs. */
  activeHref?: string;
  /** Disable auto-suppress: cuando `moduleKey` se fuerza y la ruta activa
   *  tiene un N3 más específico, por default este SubNav se oculta para no
   *  duplicar con el N3 de la sub-layout. Si querés que la fila N2 siempre
   *  se muestre (caso Finanzas, donde el N2 vive arriba del Hero y el N3
   *  abajo), pasá `disableAutoSuppress`. */
  disableAutoSuppress?: boolean;
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
  visibility = "desktop-only",
  className,
  trailingAction,
  activeHref: _activeHref,
  disableAutoSuppress = false,
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

  // Auto-suppression: when a moduleKey is forced AND a more-specific child
  // subnav matches the current path, hide this one — the child layout
  // (with a more specific moduleKey) will render its own subnav.
  // Example: /finanzas/facturacion lives under /finanzas. The /finanzas
  // layout passes moduleKey="finance" but the active path actually owns
  // a deeper N3 (finance-ventas). We let the deeper one win.
  const shouldSuppress = useMemo(() => {
    if (!moduleKey) return false;
    if (disableAutoSuppress) return false;
    const auto = findN3Parent(pathname);
    if (!auto) return false;
    const forced = getModule(moduleKey) ?? findChildByKey(moduleKey);
    if (!forced) return false;
    // Same node — no conflict.
    if (auto.key === forced.key) return false;
    // Auto-detected is a descendant of forced (more specific) → suppress.
    return auto.href.length > forced.href.length &&
      auto.href.startsWith(forced.href === "/" ? "/" : forced.href + "/");
  }, [moduleKey, pathname, disableAutoSuppress]);

  const items = useMemo<SwipeTabItem[]>(() => {
    if (shouldSuppress) return [];
    if (!n3Parent || !n3Parent.children) return [];
    return n3Parent.children
      .filter((c) => !c.hideInSubNav)
      .filter((c) => isNodeVisible(c, ctx))
      .map(nodeToTabItem);
  }, [n3Parent, ctx, shouldSuppress]);

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

