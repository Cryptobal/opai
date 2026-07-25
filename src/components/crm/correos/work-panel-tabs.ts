/** Tabs del Panel de trabajo del lector (Bloque 4 + v3.1). */
import type { LucideIcon } from "lucide-react";
import { LayoutGrid, Building2, Link2, ListChecks, CalendarClock } from "lucide-react";

export type WorkTab = "resumen" | "cuenta" | "vinculos" | "productividad" | "reunion";

/**
 * Cinco pestañas que caben en una línea a 390px (icono arriba + etiqueta
 * debajo, `flex-1`). "Contacto" ya no es pestaña: vive dentro de "Cuenta".
 * "Productividad" se abrevia a "Trabajo" para no requerir scroll horizontal
 * (brief §11: se acorta el texto, no se activa scroll).
 */
export const WORK_TABS: { id: WorkTab; label: string; icon: LucideIcon }[] = [
  { id: "resumen", label: "Resumen", icon: LayoutGrid },
  { id: "cuenta", label: "Cuenta", icon: Building2 },
  { id: "vinculos", label: "Vínculos", icon: Link2 },
  { id: "productividad", label: "Trabajo", icon: ListChecks },
  { id: "reunion", label: "Reunión", icon: CalendarClock },
];
