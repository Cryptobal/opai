"use client";

/**
 * TopbarSubNav — navegación de sub-secciones (N3) del submódulo activo en la
 * barra superior (desktop). Resuelve UNA sola fila:
 *
 *  - Submódulo (N2) CON sub-secciones (N3) — Finanzas → C/V → Resumen/DTEs/…,
 *    Ops → Pautas → Mensual/Diaria/…: solo las tabs N3. Cambiar de submódulo
 *    (N2) se hace por el menú lateral (flyout del ícono del módulo).
 *  - Submódulo SIN N3 (Personas, Payroll, CRM, Docs, Reportes DT, y las
 *    landing sin N3 de Finanzas/Ops): la barra queda VACÍA (o muestra
 *    `fallback` si se pasa — p. ej. búsqueda inline del módulo).
 *  - Excepción HUB: sus vistas (Resumen/Comercial/…) VIVEN en estas pestañas
 *    y no tienen otro punto de navegación en desktop, así que sí se muestran.
 *
 * Filtra por permisos + módulos del tenant, igual que ModuleSubNav.
 */

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import {
  findActiveModule,
  getContextualBottomNavNodes,
  isNodeVisible,
  pathMatchesNode,
  type NavNode,
  type VisibilityContext,
} from "@/lib/nav/registry";
import { SwipeTabs, type SwipeTabItem } from "./SwipeTabs";
import { cn } from "@/lib/utils";

function toTab(n: NavNode): SwipeTabItem {
  return {
    href: n.href,
    label: n.shortLabel ?? n.label,
    icon: n.icon,
    exactMatch: n.exactMatch,
    activePaths: n.activePaths,
  };
}

/** Tabs N3 (o Hub) que la topbar mostraría para el pathname actual. */
export function useTopbarSubNavTabs(): SwipeTabItem[] {
  const pathname = usePathname() ?? "/";
  const perms = useEffectivePermissions();
  const { isModuleEnabled, hasFeatureFlag } = useTenantModules();

  const ctx: VisibilityContext = useMemo(
    () => ({ perms, isAdmin: false, isModuleEnabled, hasTenantFlag: hasFeatureFlag }),
    [perms, isModuleEnabled, hasFeatureFlag],
  );

  return useMemo(() => {
    const mod = findActiveModule(pathname);
    // Módulos con navegación propia (ej. Configuración) no renderizan tabs de
    // secciones en la topbar.
    if (mod?.hideInModuleTabs) {
      return [] as SwipeTabItem[];
    }
    const n2 = (mod?.children ?? []).filter(
      (c) => !c.hideInSubNav && isNodeVisible(c, ctx),
    );
    // Sección N2 activa = el hijo del módulo que matchea el path (longest-prefix).
    const current = n2
      .filter((c) => pathMatchesNode(pathname, c))
      .sort((a, b) => b.href.length - a.href.length)[0];
    // Submódulo con N3: mostrar solo las tabs del submenú (N3).
    if (current?.children?.length) {
      const n3 = current.children
        .filter((c) => !c.hideInSubNav && isNodeVisible(c, ctx))
        .map(toTab);
      if (n3.length > 0) {
        return n3;
      }
    }
    // Submódulo sin N3: barra vacía. Excepción Hub — sus vistas viven aquí.
    const isHub = mod?.key === "hub";
    if (isHub) {
      return getContextualBottomNavNodes(pathname)
        .filter((c) => !c.hideInSubNav && isNodeVisible(c, ctx))
        .map(toTab);
    }
    return [] as SwipeTabItem[];
  }, [pathname, ctx]);
}

export function TopbarSubNav({
  className,
  fallback,
}: {
  className?: string;
  /** Contenido cuando no hay tabs N3 (p. ej. búsqueda inline del módulo). */
  fallback?: ReactNode;
}) {
  const tabs = useTopbarSubNavTabs();

  if (tabs.length === 0) return <>{fallback ?? null}</>;

  return (
    <div className={cn("flex min-w-0 items-stretch", className)}>
      <SwipeTabs
        items={tabs}
        variant="compact"
        className="h-full min-h-0 flex-1 border-b-0"
      />
    </div>
  );
}
