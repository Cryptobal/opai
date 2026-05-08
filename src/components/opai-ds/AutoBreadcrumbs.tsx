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
import { useBreadcrumbTrailing } from "./BreadcrumbTrailingContext";

export interface AutoBreadcrumbsProps {
  /** Override the last segment label (e.g. detail pages: "Polpaico S.A.").
   *  If not provided, falls back to whatever the active page set via
   *  `useSetBreadcrumbTrailing(name)`. */
  trailing?: string;
  /** Hide if no registry match is found instead of returning null silently. */
  hideIfEmpty?: boolean;
  className?: string;
}

/**
 * Devuelve true si `pathname` cae dentro del subárbol del nodo, respetando
 * `exactMatch`: cuando exactMatch=true, sólo iguala con `===`. Si no,
 * acepta prefix `/...` (sub-rutas del nodo).
 */
function nodeMatches(pathname: string, node: NavNode): boolean {
  if (node.exactMatch) return pathname === node.href;
  return pathname === node.href || pathname.startsWith(node.href + "/");
}

/**
 * Construye el trail de breadcrumb. En cada nivel elige el HIJO MÁS
 * ESPECÍFICO (longest href que matchee), no el primero. Esto evita que
 * "Inicio" (href=/finanzas, exactMatch=true) gane sobre "Ventas"
 * (href=/finanzas/facturacion) cuando navegamos a /finanzas/facturacion/dtes.
 */
function findTrail(pathname: string): NavNode[] {
  const trail: NavNode[] = [];

  // Pick the best matching top-level module by longest href.
  let topMatch: NavNode | undefined;
  for (const m of NAV_MODULES) {
    if (nodeMatches(pathname, m)) {
      if (!topMatch || m.href.length > topMatch.href.length) topMatch = m;
    }
  }
  if (!topMatch) return trail;
  trail.push(topMatch);

  // Walk children, always picking the longest matching sibling.
  let cursor = topMatch;
  while (cursor.children && cursor.children.length > 0) {
    let best: NavNode | undefined;
    for (const c of cursor.children) {
      if (nodeMatches(pathname, c)) {
        if (!best || c.href.length > best.href.length) best = c;
      }
    }
    if (!best) break;
    trail.push(best);
    cursor = best;
  }

  return trail;
}

export function AutoBreadcrumbs({
  trailing: trailingProp,
  hideIfEmpty = true,
  className,
}: AutoBreadcrumbsProps) {
  const pathname = usePathname() ?? "/";
  const trailingFromCtx = useBreadcrumbTrailing();
  // Prop wins over context; context wins over nothing.
  const trailing = trailingProp ?? trailingFromCtx ?? null;

  const items = useMemo<BreadcrumbItem[]>(() => {
    const trail = findTrail(pathname);
    if (trail.length === 0) return [];

    // Drop "Inicio" (hub) when it's the only/first segment of a non-/hub page.
    const filtered = trail.filter(
      (n, i) => !(n.key === "hub" && i === 0 && trail.length > 1),
    );

    // Hide when the trail collapses to a single segment AND we're at a
    // top-level module root (e.g. /crm, /finanzas) — the sidebar already
    // shows where we are. Breadcrumbs add no value here. Detail pages
    // use `trailing` to add a deeper segment, so this still renders.
    if (filtered.length <= 1 && !trailing) return [];

    const built = filtered.map<BreadcrumbItem>((node) => ({
      label: node.label,
      href: node.href,
    }));

    if (trailing && built.length > 0) {
      // Detail pages always APPEND the entity name as a new segment so
      // the parent (e.g. "Leads") stays clickable. The entity itself
      // becomes the last (highlighted) crumb. We don't have a stable
      // href for it (would just be the current path), so use pathname.
      built.push({ label: trailing, href: pathname });
    }
    return built;
  }, [pathname, trailing]);

  if (items.length === 0 && hideIfEmpty) return null;

  return <Breadcrumbs items={items} className={className} />;
}
