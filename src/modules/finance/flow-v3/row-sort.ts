/**
 * Orden de presentación de filas de la planilla: sección → virtual al final →
 * nombre A→Z (es, sin distinción de mayúsculas/acentos, numérico).
 * No muta orderIndex; solo define el sort de la matriz.
 */

export const FLOW_SECTION_ORDER = [
  "INGRESOS",
  "REMUNERACIONES",
  "IMPUESTOS",
  "GAV",
  "FINANCIAMIENTO",
  "OTROS",
] as const;

export interface SortableFlowRow {
  section: string;
  name: string;
  isVirtual?: boolean;
}

export function compareFlowRows(a: SortableFlowRow, b: SortableFlowRow): number {
  const sec =
    FLOW_SECTION_ORDER.indexOf(a.section as (typeof FLOW_SECTION_ORDER)[number]) -
    FLOW_SECTION_ORDER.indexOf(b.section as (typeof FLOW_SECTION_ORDER)[number]);
  if (sec !== 0) return sec;
  const virt = Number(!!a.isVirtual) - Number(!!b.isVirtual);
  if (virt !== 0) return virt;
  return a.name.localeCompare(b.name, "es", { sensitivity: "base", numeric: true });
}
