"use client";

/**
 * ConfigShell — Layout de Configuración con sub-sidebar interno.
 *
 * Patrón inspirado en Slack/Notion/Linear settings: el contenido se divide en
 * una columna izquierda (sub-sidebar) con las secciones agrupadas por categoría
 * + columna derecha con el contenido de la sección activa.
 *
 * En mobile el sub-sidebar se transforma en un selector compacto en la parte
 * superior (igual que Notion settings en mobile).
 *
 * Visibilidad:
 *  - Items se filtran por permisos del usuario (cada nodo del registry tiene
 *    `module` + `submodule` opcional).
 *  - Categorías que se quedan sin items visibles desaparecen.
 *
 * Responsabilidades:
 *  - Lee del registry (NAV_MODULES.find("config").children + CONFIG_CATEGORIES).
 *  - Resalta el item activo (longest-prefix-wins).
 *  - No conoce los contenidos de cada page — solo los pinta como children.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ChevronLeft, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/permissions-context";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import { useRoleSimulation } from "@/contexts/RoleSimulationContext";
import {
  CONFIG_CATEGORIES,
  getModule,
  isNodeVisible,
  pathMatchesNode,
  type NavNode,
  type VisibilityContext,
} from "@/lib/nav/registry";

const COLLAPSED_KEY = "opai.configShell.collapsed";

export interface CategoryGroup {
  key: string;
  label: string;
  items: NavNode[];
}

/** Hook compartido: grupos de Configuración (por categoría) ya filtrados por
 *  permisos + tenant + isAdmin, leídos desde el registry. Lo consumen tanto el
 *  sub-sidebar (ConfigShell) como el home de Configuración (ConfigHomeClient),
 *  garantizando UNA sola taxonomía.
 *
 *  Devuelve además:
 *   - `activeItem`: la sección (hoja) que matchea el pathname (longest-prefix).
 *   - `activeCategory`: el grupo/categoría activo. Se resuelve por slug cuando
 *     el pathname es la ruta de una categoría (`/opai/configuracion/<slug>`),
 *     o por la categoría de `activeItem` en las páginas hoja. */
export function useConfigCategories(): {
  groups: CategoryGroup[];
  activeItem: NavNode | undefined;
  activeCategory: CategoryGroup | undefined;
} {
  const pathname = usePathname() ?? "/";
  const permissions = usePermissions();
  const { isModuleEnabled } = useTenantModules();
  const { effectiveRole } = useRoleSimulation();
  // Rol efectivo: al simular un rol no-admin, los ítems admin deben ocultarse.
  const isAdmin = effectiveRole === "owner" || effectiveRole === "admin";

  return useMemo(() => {
    const config = getModule("config");
    const ctx: VisibilityContext = {
      perms: permissions,
      isAdmin,
      isModuleEnabled,
    };
    const visibleItems = (config?.children ?? []).filter((c) => isNodeVisible(c, ctx));
    const byCategory = new Map<string, NavNode[]>();
    for (const item of visibleItems) {
      const cat = item.category ?? "general";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(item);
    }
    const groups: CategoryGroup[] = CONFIG_CATEGORIES.flatMap((cat) => {
      const items = byCategory.get(cat.key);
      if (!items || items.length === 0) return [];
      return [{ key: cat.key, label: cat.label, items }];
    });

    const allItems = groups.flatMap((g) => g.items);
    const activeItem = allItems
      .filter((i) => pathMatchesNode(pathname, i))
      .sort((a, b) => b.href.length - a.href.length)[0];

    // Categoría activa: por slug de ruta de categoría, o por la del activeItem.
    const CONFIG_BASE = "/opai/configuracion/";
    const slug = pathname.startsWith(CONFIG_BASE)
      ? pathname.slice(CONFIG_BASE.length).split("/")[0]
      : "";
    const activeCategory =
      groups.find((g) => g.key === slug) ??
      (activeItem
        ? groups.find((g) => g.key === (activeItem.category ?? "general"))
        : undefined);

    return { groups, activeItem, activeCategory };
  }, [pathname, permissions, isModuleEnabled, isAdmin]);
}

/* ──────────────────────────────────────────────────────────── */

interface ConfigSidebarProps {
  groups: CategoryGroup[];
  activeKey?: string;
  onNavigate?: () => void;
  variant?: "desktop" | "drawer";
  collapsed?: boolean;
}

function ConfigSidebar({
  groups,
  activeKey,
  onNavigate,
  variant = "desktop",
  collapsed = false,
}: ConfigSidebarProps) {
  return (
    <nav
      aria-label="Configuración"
      className={cn(
        "flex flex-col gap-5",
        variant === "desktop" && "h-full overflow-y-auto",
        collapsed ? "px-0" : "pr-2",
      )}
    >
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mb-1">
              {group.label}
            </p>
          )}
          {collapsed && (
            <div className="mx-2 mb-1 h-px bg-ds-border-subtle/60" aria-hidden />
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeKey;
            const link = (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center rounded-md text-ds-body transition-colors min-h-[36px]",
                  collapsed
                    ? "justify-center mx-1.5 w-9 h-9 p-0"
                    : "gap-2.5 px-2 py-1.5",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-ds-text-2 hover:bg-ds-surface-2 hover:text-ds-text-1",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-primary" : "text-ds-text-3",
                  )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
            if (collapsed) {
              return (
                <Tooltip key={item.key} delayDuration={150}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return link;
          })}
        </div>
      ))}
    </nav>
  );
}

/* ──────────────────────────────────────────────────────────── */

export interface ConfigShellProps {
  children: React.ReactNode;
}

export function ConfigShell({ children }: ConfigShellProps) {
  const pathname = usePathname() ?? "/";
  const { groups, activeItem, activeCategory } = useConfigCategories();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed, hydrated]);

  // Root (hub de categorías): sin sidebar ni drawer — las tarjetas del Home
  // son la navegación. También sin sidebar si no hay categoría activa/visible.
  const isRoot = pathname === "/opai/configuracion";
  if (isRoot || groups.length === 0 || !activeCategory) {
    return <div className="min-w-0">{children}</div>;
  }

  // Nivel 2/3: el sidebar se acota SOLO a las secciones de la categoría activa.
  const sidebarGroups = [activeCategory];

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("lg:flex min-w-0", collapsed ? "lg:gap-4" : "lg:gap-8")}>
        {/* Mobile / tablet: trigger button + drawer (acotado a la categoría) */}
        <div className="lg:hidden mb-3">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full justify-between gap-2"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Settings className="h-4 w-4 shrink-0 text-ds-text-3" />
                  <span className="truncate">
                    {activeItem?.label ?? activeCategory.label}
                  </span>
                </span>
                <span className="text-xs text-ds-text-4">cambiar</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[340px] overflow-y-auto">
              <SheetHeader className="text-left mb-4">
                <SheetTitle>{activeCategory.label}</SheetTitle>
              </SheetHeader>
              <Link
                href="/opai/configuracion"
                onClick={() => setDrawerOpen(false)}
                className="mb-3 inline-flex items-center gap-1 text-ds-body text-primary/90 hover:text-primary transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Todas las categorías</span>
              </Link>
              <ConfigSidebar
                groups={sidebarGroups}
                activeKey={activeItem?.key}
                onNavigate={() => setDrawerOpen(false)}
                variant="drawer"
              />
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop: persistent left column with collapse toggle */}
        <aside
          className={cn(
            "hidden lg:block shrink-0 transition-[width] duration-200 ease-out",
            collapsed ? "w-14" : "w-60",
          )}
        >
          <div className="sticky top-16 max-h-[calc(100vh-5rem)] flex flex-col">
            <div
              className={cn(
                "flex mb-2 shrink-0",
                collapsed
                  ? "flex-col items-center gap-1"
                  : "items-center justify-between",
              )}
            >
              {collapsed ? (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <Link
                      href="/opai/configuracion"
                      aria-label="Todas las categorías"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Todas las categorías
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  href="/opai/configuracion"
                  className="group inline-flex min-w-0 items-center gap-1 px-1 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 hover:text-ds-text-2 transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{activeCategory.label}</span>
                </Link>
              )}
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-ds-text-3 hover:text-ds-text-1"
                    onClick={() => setCollapsed((v) => !v)}
                    aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
                  >
                    {collapsed ? (
                      <PanelLeftOpen className="h-4 w-4" />
                    ) : (
                      <PanelLeftClose className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {collapsed ? "Expandir menú" : "Contraer menú"}
                </TooltipContent>
              </Tooltip>
            </div>
            <ConfigSidebar
              groups={sidebarGroups}
              activeKey={activeItem?.key}
              collapsed={collapsed}
            />
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </TooltipProvider>
  );
}
