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

export const SECTION_MOVES: ReadonlyArray<{
  name: string;
  fromSection: CanonicalFlowRow["section"];
  toSection: CanonicalFlowRow["section"];
}> = [
  { name: "Devolución préstamo socios", fromSection: "INGRESOS", toSection: "FINANCIAMIENTO" },
];

/**
 * Resuelve la sección destino tras aplicar SECTION_MOVES (puro, idempotente).
 * Retorna null si la fila no debe moverse.
 */
export function resolveSectionMove(
  rowName: string,
  currentSection: CanonicalFlowRow["section"],
): CanonicalFlowRow["section"] | null {
  const normalized = rowName.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  for (const move of SECTION_MOVES) {
    const moveKey = move.name.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    if (currentSection === move.fromSection && normalized === moveKey) {
      return move.toSection;
    }
  }
  return null;
}

export const CANONICAL_FLOW_ROWS: CanonicalFlowRow[] = [
  { section: "INGRESOS", name: FALLBACK_INCOME_NAME, categoryCode: null },
  { section: "REMUNERACIONES", name: "Sueldos líquidos", categoryCode: "EGR_SUELDO" },
  { section: "REMUNERACIONES", name: "Quincena (anticipos)", categoryCode: "EGR_QUINCENA" },
  { section: "REMUNERACIONES", name: "Imposiciones (Previred)", categoryCode: "EGR_PREVIRED" },
  { section: "REMUNERACIONES", name: "Turnos extra", categoryCode: "EGR_TURNO_EXTRA" },
  { section: "REMUNERACIONES", name: "Finiquitos", categoryCode: null },
  { section: "IMPUESTOS", name: "IVA F29", categoryCode: "EGR_IVA_F29" },
  { section: "GAV", name: FALLBACK_EXPENSE_NAME, categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Créditos / financiamiento", categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Aporte socios", categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Retiro socios", categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Devolución a socios", categoryCode: null },
];

/**
 * Filas que dejaron de ser canónicas. El reconcile las elimina si no tienen
 * plan/comprometido/real; si tienen histórico, las archiva (no se recrean).
 */
export const RETIRED_CANONICAL_ROW_NAMES: readonly string[] = [
  "Devolución préstamo socios",
];
