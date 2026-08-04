/**
 * Filas canónicas de la planilla (compartidas por el auto-bootstrap y el
 * reconcile). Archivo puro, sin prisma.
 */
export interface CanonicalFlowRow {
  section: "INGRESOS" | "REMUNERACIONES" | "IMPUESTOS" | "GAV" | "FINANCIAMIENTO" | "OTROS";
  name: string;
  /** Categoría del módulo viejo a la que se mapea si el tenant la tiene. */
  categoryCode: string | null;
}

/** Nombres viejos de fallbacks → nuevos (migración idempotente en reconcile). */
export const FALLBACK_RENAMES: ReadonlyArray<{ from: string; to: string; section: CanonicalFlowRow["section"] }> = [
  { from: "Otros clientes", to: "Otros ingresos", section: "INGRESOS" },
  { from: "Otros gastos", to: "Otros egresos", section: "GAV" },
];

export const FALLBACK_INCOME_NAME = "Otros ingresos";
export const FALLBACK_EXPENSE_NAME = "Otros egresos";

export const CANONICAL_FLOW_ROWS: CanonicalFlowRow[] = [
  { section: "INGRESOS", name: FALLBACK_INCOME_NAME, categoryCode: null },
  { section: "INGRESOS", name: "Devolución préstamo socios", categoryCode: null },
  { section: "REMUNERACIONES", name: "Sueldos líquidos", categoryCode: "EGR_SUELDO" },
  { section: "REMUNERACIONES", name: "Quincena (anticipos)", categoryCode: "EGR_QUINCENA" },
  { section: "REMUNERACIONES", name: "Imposiciones (Previred)", categoryCode: "EGR_PREVIRED" },
  { section: "REMUNERACIONES", name: "Turnos extra", categoryCode: "EGR_TURNO_EXTRA" },
  { section: "IMPUESTOS", name: "IVA F29", categoryCode: "EGR_IVA_F29" },
  { section: "GAV", name: FALLBACK_EXPENSE_NAME, categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Créditos / financiamiento", categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Aporte socios", categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Retiro socios", categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Devolución a socios", categoryCode: null },
];
