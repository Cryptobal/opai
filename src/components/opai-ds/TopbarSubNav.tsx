"use client";

/**
 * TopbarSubNav — navegación de secciones del módulo en la barra superior
 * (desktop). Resuelve UNA sola fila, evitando el "dos filas de tabs" que
 * saturaba a los módulos con 3 niveles (Finanzas):
 *
 *  - Módulos de 1 nivel (CRM, Personas): fila de tabs con las secciones del
 *    módulo (getContextualBottomNavNodes) — igual que el bottom nav móvil.
 *  - Módulos de 2 niveles (Finanzas → C/V → sub-secciones, Ops → Pautas →
 *    Mensual/Diaria/…): la sección N2 se colapsa en un SELECTOR compacto
 *    `[C/V ▾]` a la izquierda, y las tabs muestran las sub-secciones N3.
 *    Así el N2 sigue a un click (sin gastar una fila) y el N3 —donde
 *    realmente trabajas— ocupa las tabs.
 *
 * Filtra por permisos + módulos del tenant, igual que ModuleSubNav.
 */

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

export function TopbarSubNav({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const perms = useEffectivePermissions();
  const { isModuleEnabled, hasFeatureFlag } = useTenantModules();

  const ctx: VisibilityContext = useMemo(
    () => ({ perms, isAdmin: false, isModuleEnabled, hasTenantFlag: hasFeatureFlag }),
    [perms, isModuleEnabled, hasFeatureFlag],
  );

  const { sections, currentSection, tabs } = useMemo(() => {
    const mod = findActiveModule(pathname);
    const n2 = (mod?.children ?? []).filter(
      (c) => !c.hideInSubNav && isNodeVisible(c, ctx),
    );
    // Sección N2 activa = el hijo del módulo que matchea el path (longest-prefix).
    const current = n2
      .filter((c) => pathMatchesNode(pathname, c))
      .sort((a, b) => b.href.length - a.href.length)[0];
    // Modo selector: la sección activa tiene sub-secciones (N3).
    if (current?.children?.length) {
      const n3 = current.children
        .filter((c) => !c.hideInSubNav && isNodeVisible(c, ctx))
        .map(toTab);
      if (n3.length > 0) {
        return { sections: n2, currentSection: current, tabs: n3 };
      }
    }
    // Modo plano: tabs = secciones del módulo (misma fuente que el bottom nav).
    const plain = getContextualBottomNavNodes(pathname)
      .filter((c) => !c.hideInSubNav && isNodeVisible(c, ctx))
      .map(toTab);
    return { sections: [] as NavNode[], currentSection: undefined, tabs: plain };
  }, [pathname, ctx]);

  if (tabs.length === 0) return null;

  const showSwitcher = !!currentSection && sections.length > 1;
  const CurrentIcon = currentSection?.icon;

  return (
    <div className={cn("flex min-w-0 items-stretch", className)}>
      {showSwitcher && currentSection && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 border-r border-ds-border-subtle pl-1 pr-3 text-[13px] font-semibold text-ds-text-1 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={`Sección: ${currentSection.label}. Cambiar sección`}
            >
              {CurrentIcon && <CurrentIcon className="h-4 w-4 text-primary" />}
              <span className="truncate max-w-[10rem]">
                {currentSection.shortLabel ?? currentSection.label}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-ds-text-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {sections.map((s) => {
              const Icon = s.icon;
              const isCurrent = s.key === currentSection.key;
              return (
                <DropdownMenuItem key={s.key} asChild>
                  <Link href={s.href} className="cursor-pointer">
                    {Icon && (
                      <Icon
                        className={cn(
                          "h-4 w-4 mr-2 shrink-0",
                          isCurrent ? "text-primary" : "text-ds-text-3",
                        )}
                      />
                    )}
                    <span className={cn("flex-1 truncate", isCurrent && "text-primary font-medium")}>
                      {s.label}
                    </span>
                    {isCurrent && <Check className="h-3.5 w-3.5 ml-2 text-primary shrink-0" />}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <SwipeTabs
        items={tabs}
        variant="compact"
        className={cn("h-full min-h-0 flex-1 border-b-0", showSwitcher && "pl-2")}
      />
    </div>
  );
}
