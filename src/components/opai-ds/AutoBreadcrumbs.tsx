"use client";

/**
 * AutoBreadcrumbs — breadcrumbs derivados automáticamente del registry.
 *
 * Uso:
 *   <AutoBreadcrumbs />                  // auto-detecta del pathname
 *   <AutoBreadcrumbs trailing="..." />   // override del último segmento
 *
 * Comportamiento:
 *  - Recorre NAV_MODULES buscando coincidencias por prefijo de href.
 *  - Construye [Módulo, Sub-módulo, Sub-sección] siguiendo la jerarquía.
 *  - Todos los segmentos son clickeables (incluyendo el último → refresh/scroll-top).
 *  - Último segmento renderiza con `text-primary font-semibold`.
 *  - Mobile: colapsa middle a "…" cuando hay >3 niveles (delegado al
 *    componente Breadcrumbs subyacente).
 *
 * Cuando NO encuentra match (rutas como /opai/perfil que no están en el
 * registry), devuelve null silenciosamente — la página puede agregar un
 * <Breadcrumbs items={...}> manual si necesita.
 */

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { NAV_MODULES, type NavNode } from "@/lib/nav/registry";
import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";

export interface AutoBreadcrumbsProps {
  /** Override the last segment label (e.g. detail pages: "Polpaico S.A."). */
  trailing?: string;
  /** Hide if no registry match is found instead of returning null silently. */
  hideIfEmpty?: boolean;
  className?: string;
}

function findTrail(pathname: string): NavNode[] {
  const trail: NavNode[] = [];
  const visit = (node: NavNode): boolean => {
    if (pathname === node.href || pathname.startsWith(node.href + "/")) {
      trail.push(node);
      for (const child of node.children ?? []) {
        if (visit(child)) return true;
      }
      return true;
    }
    return false;
  };
  for (const m of NAV_MODULES) {
    if (visit(m)) break;
  }
  return trail;
}

export function AutoBreadcrumbs({
  trailing,
  hideIfEmpty = true,
  className,
}: AutoBreadcrumbsProps) {
  const pathname = usePathname() ?? "/";
  const items = useMemo<BreadcrumbItem[]>(() => {
    const trail = findTrail(pathname);
    if (trail.length === 0) return [];

    // Drop "Inicio" (hub) when it's the only/first segment of a non-/hub page.
    const filtered = trail.filter(
      (n, i) => !(n.key === "hub" && i === 0 && trail.length > 1),
    );

    const built = filtered.map<BreadcrumbItem>((node) => ({
      label: node.label,
      href: node.href,
    }));

    if (trailing && built.length > 0) {
      // Replace last label with override but keep href so it stays clickable.
      built[built.length - 1] = {
        label: trailing,
        href: built[built.length - 1].href,
      };
    }
    return built;
  }, [pathname, trailing]);

  if (items.length === 0 && hideIfEmpty) return null;

  return <Breadcrumbs items={items} className={className} />;
}
