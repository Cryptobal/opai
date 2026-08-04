/**
 * Orden de presentación de filas de la planilla (v4.8):
 * sección → bloque (cuenta/prog → manual → bandeja → virtual) →
 * nombre A→Z (es, sin distinción de mayúsculas/acentos, numérico) → id.
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
  /** Mapping de la fila; `MANUAL` va al bloque 2 (salvo bandeja). */
  mapping?: string;
  /** Bandeja "Otros ingresos"/"Otros egresos" (persistida o sentinel). */
  isBandeja?: boolean;
  /** Desempate estable cuando el nombre empata. */
  id?: string;
}

/**
 * Bloques dentro de una sección:
 * 0 — filas con cuenta/programación/categoría/proveedor (mapping ≠ MANUAL)
 * 1 — filas manuales (mapping MANUAL, p. ej. socios)
 * 2 — bandeja persistida (Otros ingresos / Otros egresos)
 * 3 — virtuales (si existieran; siempre tras la bandeja)
 */
export function presentationBlock(row: SortableFlowRow): number {
  if (row.isVirtual) return 3;
  if (row.isBandeja) return 2;
  if (row.mapping === "MANUAL") return 1;
  return 0;
}

export function compareFlowRows(a: SortableFlowRow, b: SortableFlowRow): number {
  const sec =
    FLOW_SECTION_ORDER.indexOf(a.section as (typeof FLOW_SECTION_ORDER)[number]) -
    FLOW_SECTION_ORDER.indexOf(b.section as (typeof FLOW_SECTION_ORDER)[number]);
  if (sec !== 0) return sec;

  const block = presentationBlock(a) - presentationBlock(b);
  if (block !== 0) return block;

  const byName = a.name.localeCompare(b.name, "es", {
    sensitivity: "base",
    numeric: true,
  });
  if (byName !== 0) return byName;

  return (a.id ?? "").localeCompare(b.id ?? "");
}
