/**
 * resolveNavContext — contexto de navegación derivado del pathname para la
 * isla contextual móvil, el `document.title` y el DetailHeader.
 *
 * Reusa el único matcher canónico (`pathMatchesNode`) del registry; no
 * duplica reglas de matching. Devuelve el nodo más específico del trail
 * (longest-prefix por nivel, igual que sidebar/breadcrumbs) junto con su
 * módulo top-level, ícono, tono y el destino "volver" hacia el listado padre.
 *
 * Si ningún módulo matchea el path (rutas fuera del registry), devuelve
 * `null` — el consumidor decide el fallback (ej. la isla muestra el logo OPAI).
 */

import type { LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/design-system/tokens";
import { NAV_MODULES, pathMatchesNode, type NavNode } from "./registry";

export type NavIconTone = Tone | "primary";

export interface NavContext {
  /** Nodo más específico del trail (el que da título/ícono). */
  node: NavNode;
  /** Módulo top-level que contiene la ruta. */
  moduleNode: NavNode;
  /** Trail completo [módulo, …, nodo] por si el consumidor lo necesita. */
  trail: NavNode[];
  /** Título de la página (label del nodo). */
  title: string;
  /** Título corto para la isla (shortLabel ?? label). */
  shortTitle: string;
  /** Ícono Lucide del nodo. */
  icon: LucideIcon;
  /** Tono categórico del módulo (para el IconBubble de la isla). */
  iconTone: NavIconTone;
  /** Href del listado padre para el botón "volver" (fichas). */
  parentHref?: string;
  /** Label del listado padre ("← Leads"). */
  parentLabel?: string;
}

/** Tono categórico por módulo top-level para la isla contextual móvil.
 *  Solo afecta el color del IconBubble; no toca permisos ni datos. */
const MODULE_TONE: Record<string, NavIconTone> = {
  hub: "primary",
  crm: "violet",
  ops: "sky",
  personas: "teal",
  payroll: "amber",
  finance: "emerald",
  docs: "rose",
  reportes: "sky",
  fiscalizacion: "amber",
  portales: "violet",
  config: "primary",
  compliance: "amber",
};

/** Construye el trail [módulo, …, nodo más específico] reusando el matcher
 *  canónico. En cada nivel gana el hijo cuyo href más largo matchee. */
function buildTrail(pathname: string): NavNode[] {
  const trail: NavNode[] = [];
  let top: NavNode | undefined;
  for (const m of NAV_MODULES) {
    if (pathMatchesNode(pathname, m)) {
      if (!top || m.href.length > top.href.length) top = m;
    }
  }
  if (!top) return trail;
  trail.push(top);
  let cursor = top;
  while (cursor.children && cursor.children.length > 0) {
    let best: NavNode | undefined;
    for (const c of cursor.children) {
      if (pathMatchesNode(pathname, c)) {
        if (!best || c.href.length > best.href.length) best = c;
      }
    }
    if (!best) break;
    trail.push(best);
    cursor = best;
  }
  return trail;
}

export function resolveNavContext(pathname: string): NavContext | null {
  const trail = buildTrail(pathname);
  if (trail.length === 0) return null;
  const moduleNode = trail[0];
  const node = trail[trail.length - 1];
  const parent = trail.length > 1 ? trail[trail.length - 2] : undefined;
  // Destino "volver" para fichas: si estamos en una sub-ruta más profunda que
  // el nodo (ej. /crm/leads/123 vs nodo /crm/leads) el listado es el propio
  // nodo; si estamos parados en el listado, el padre es el nivel superior.
  const backNode = pathname === node.href ? parent : node;
  return {
    node,
    moduleNode,
    trail,
    title: node.label,
    shortTitle: node.shortLabel ?? node.label,
    icon: node.icon,
    iconTone: MODULE_TONE[moduleNode.key] ?? "primary",
    parentHref: backNode?.href,
    parentLabel: backNode?.label,
  };
}
