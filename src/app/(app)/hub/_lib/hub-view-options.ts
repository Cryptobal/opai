/**
 * Opciones del selector de vistas del Centro de Control (mobile).
 *
 * Deriva SIEMPRE del registry (hijos del nodo `hub`) — no duplica rutas ni
 * permisos. Solo re-etiqueta las vistas para distinguir el dashboard del Hub
 * del módulo real (ej. "Control comercial" = /hub/comercial vs "Abrir
 * Comercial" = /crm).
 */

import {
  filterChildren,
  getModule,
  pathMatchesNode,
  type VisibilityContext,
} from "@/lib/nav/registry";

export interface HubViewOption {
  key: string;
  href: string;
  label: string;
}

/** Etiquetas de presentación por key del registry (solo naming, nada más). */
const HUB_VIEW_LABELS: Record<string, string> = {
  "hub-summary": "General",
  "hub-commercial": "Control comercial",
  "hub-operations": "Control operacional",
  "hub-finance": "Control financiero",
  "hub-people": "Personas",
  "hub-payroll": "Payroll",
  "hub-documents": "Documentos",
};

/** Vistas del Hub visibles para el usuario/tenant actual. */
export function getHubViewOptions(ctx: VisibilityContext): HubViewOption[] {
  const hub = getModule("hub");
  if (!hub) return [];
  return filterChildren(hub, ctx).map((child) => ({
    key: child.key,
    href: child.href,
    label: HUB_VIEW_LABELS[child.key] ?? child.label,
  }));
}

/** href de la vista activa según pathname (longest-prefix, matcher canónico). */
export function getActiveHubViewHref(
  pathname: string,
  options: HubViewOption[],
): string | undefined {
  const hub = getModule("hub");
  const byHref = new Map(
    (hub?.children ?? []).map((child) => [child.href, child]),
  );
  return options
    .filter((o) => {
      const node = byHref.get(o.href);
      return node ? pathMatchesNode(pathname, node) : false;
    })
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
