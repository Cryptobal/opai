/**
 * Filas canónicas de la planilla (compartidas por el auto-bootstrap y el
 * reconcile). Archivo puro, sin prisma.
 */
import type { FlowRowKey } from "@prisma/client";

export interface CanonicalFlowRow {
  section: "INGRESOS" | "REMUNERACIONES" | "IMPUESTOS" | "GAV" | "FINANCIAMIENTO" | "OTROS";
  name: string;
  /** @deprecated Preferir canonicalKey. Código legacy para espejo. */
  categoryCode: string | null;
  /** Llave canónica del renglón (payroll/F29/bandejas). */
  canonicalKey: FlowRowKey | null;
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
  { section: "INGRESOS", name: FALLBACK_INCOME_NAME, categoryCode: null, canonicalKey: "BANDEJA_INGRESO" },
  { section: "REMUNERACIONES", name: "Sueldos líquidos", categoryCode: "EGR_SUELDO", canonicalKey: "SUELDO" },
  { section: "REMUNERACIONES", name: "Quincena (anticipos)", categoryCode: "EGR_QUINCENA", canonicalKey: "QUINCENA" },
  { section: "REMUNERACIONES", name: "Imposiciones (Previred)", categoryCode: "EGR_PREVIRED", canonicalKey: "PREVIRED" },
  { section: "REMUNERACIONES", name: "Turnos extra", categoryCode: "EGR_TURNO_EXTRA", canonicalKey: "TURNO_EXTRA" },
  { section: "REMUNERACIONES", name: "Finiquitos", categoryCode: "EGR_FINIQUITO", canonicalKey: "FINIQUITO" },
  { section: "IMPUESTOS", name: "IVA F29", categoryCode: "EGR_IVA_F29", canonicalKey: "IVA_F29" },
  { section: "GAV", name: FALLBACK_EXPENSE_NAME, categoryCode: null, canonicalKey: "BANDEJA_EGRESO" },
  { section: "FINANCIAMIENTO", name: "Créditos / financiamiento", categoryCode: null, canonicalKey: "CREDITO" },
  { section: "FINANCIAMIENTO", name: "Costo factoring", categoryCode: "EGR_FACTORING", canonicalKey: "FACTORING" },
  { section: "FINANCIAMIENTO", name: "Aporte socios", categoryCode: "ING_PRESTAMO_SOCIO", canonicalKey: "APORTE_SOCIO" },
  { section: "FINANCIAMIENTO", name: "Retiro socios", categoryCode: "EGR_RETIRO_SOCIO", canonicalKey: "RETIRO_SOCIO" },
  { section: "FINANCIAMIENTO", name: "Devolución a socios", categoryCode: "EGR_DEVOL_PRESTAMO_SOCIO", canonicalKey: "DEVOL_PRESTAMO_SOCIO" },
];

/** Nombre canónico de la fila de merma de cesión (shortfall al conciliar). */
export const COST_FACTORING_ROW_NAME = "Costo factoring";

/**
 * Filas que dejaron de ser canónicas. El reconcile las elimina si no tienen
 * plan/comprometido/real; si tienen histórico, las archiva (no se recrean).
 */
export const RETIRED_CANONICAL_ROW_NAMES: readonly string[] = [
  "Devolución préstamo socios",
];
