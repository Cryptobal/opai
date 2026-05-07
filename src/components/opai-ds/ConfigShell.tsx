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

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/permissions-context";
import { useTenantModules } from "@/contexts/TenantModulesContext";
import {
  CONFIG_CATEGORIES,
  getModule,
  isNodeVisible,
  type NavNode,
  type VisibilityContext,
} from "@/lib/nav/registry";

interface CategoryGroup {
  key: string;
  label: string;
  items: NavNode[];
}

function useConfigCategories(): { groups: CategoryGroup[]; activeItem: NavNode | undefined } {
  const pathname = usePathname() ?? "/";
  const permissions = usePermissions();
  const { isModuleEnabled } = useTenantModules();

  return useMemo(() => {
    const config = getModule("config");
    const ctx: VisibilityContext = {
      perms: permissions,
      isAdmin: false,
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
      .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0];

    return { groups, activeItem };
  }, [pathname, permissions, isModuleEnabled]);
}

/* ──────────────────────────────────────────────────────────── */

interface ConfigSidebarProps {
  groups: CategoryGroup[];
  activeKey?: string;
  onNavigate?: () => void;
  variant?: "desktop" | "drawer";
}

function ConfigSidebar({ groups, activeKey, onNavigate, variant = "desktop" }: ConfigSidebarProps) {
  return (
    <nav
      aria-label="Configuración"
      className={cn(
        "flex flex-col gap-5",
        variant === "desktop" && "h-full overflow-y-auto pr-2",
      )}
    >
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          <p className="px-2 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 mb-1">
            {group.label}
          </p>
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                  "min-h-[36px]",
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
                <span className="truncate">{item.label}</span>
              </Link>
            );
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
  const { groups, activeItem } = useConfigCategories();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Home (/opai/configuracion exact): el grid de tarjetas es el navegador.
  // No renderizamos sidebar para no duplicar.
  const isRoot = pathname === "/opai/configuracion";

  if (isRoot || groups.length === 0) {
    return <div className="min-w-0">{children}</div>;
  }

  return (
    <div className="lg:flex lg:gap-8 min-w-0">
      {/* Mobile / tablet: trigger button + drawer with all categories */}
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
                  {activeItem?.label ?? "Configuración"}
                </span>
              </span>
              <span className="text-xs text-ds-text-4">cambiar</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[300px] sm:w-[340px] overflow-y-auto">
            <SheetHeader className="text-left mb-4">
              <SheetTitle>Configuración</SheetTitle>
            </SheetHeader>
            <ConfigSidebar
              groups={groups}
              activeKey={activeItem?.key}
              onNavigate={() => setDrawerOpen(false)}
              variant="drawer"
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: persistent left column */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-16 max-h-[calc(100vh-5rem)]">
          <ConfigSidebar groups={groups} activeKey={activeItem?.key} />
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
