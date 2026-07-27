/** Tabs del Panel de trabajo del lector (Bloque 4 + v3.1). */
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Building2, Link2, Briefcase } from "lucide-react";

/**
 * "Trabajo" unifica ticket + tareas + reunión (antes pestañas separadas
 * productividad/reunión). Se mantiene el id `productividad` por estabilidad
 * de deep-links/intents; `reunion` se acepta como alias → misma pestaña.
 */
export type WorkTab = "resumen" | "cuenta" | "vinculos" | "productividad" | "reunion";

export function resolveWorkTab(tab: WorkTab): Exclude<WorkTab, "reunion"> {
  return tab === "reunion" ? "productividad" : tab;
}

/**
 * Cuatro pestañas en una línea a 390px (icono + etiqueta). Contacto vive
 * dentro de Cuenta; ticket/tareas/reunión viven en Trabajo.
 */
export const WORK_TABS: { id: Exclude<WorkTab, "reunion">; label: string; icon: LucideIcon }[] = [
  { id: "resumen", label: "Resumen", icon: LayoutGrid },
  { id: "cuenta", label: "Cuenta", icon: Building2 },
  { id: "vinculos", label: "Vínculos", icon: Link2 },
  { id: "productividad", label: "Trabajo", icon: Briefcase },
];
