/** Tabs del Panel de trabajo del lector (Copiloto Correos v4). */
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Briefcase } from "lucide-react";

/**
 * Dos pestañas reales: Contexto (cascada editable) y Trabajo.
 * Se conservan los ids legacy como alias de deep-links/intents:
 *   resumen | cuenta | vinculos → contexto
 *   productividad | reunion → trabajo
 */
export type WorkTab =
  | "contexto"
  | "trabajo"
  | "resumen"
  | "cuenta"
  | "vinculos"
  | "productividad"
  | "reunion";

export type WorkTabResolved = "contexto" | "trabajo";

export function resolveWorkTab(tab: WorkTab): WorkTabResolved {
  if (tab === "trabajo" || tab === "productividad" || tab === "reunion") {
    return "trabajo";
  }
  return "contexto";
}

export const WORK_TABS: { id: WorkTabResolved; label: string; icon: LucideIcon }[] = [
  { id: "contexto", label: "Contexto", icon: LayoutGrid },
  { id: "trabajo", label: "Trabajo", icon: Briefcase },
];
