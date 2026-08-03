/**
 * Reglas puras de editabilidad de plan en la planilla v3.
 * Compartidas entre ensamblado (capa efectiva) y UI (menú / teclado).
 */
import type { CommittedCell } from "./types";

/**
 * Ingreso con factura emitida (DTE con folio): la factura manda.
 * El plan manual no la pisa ni se puede editar sobre ella.
 */
export function hasInvoicedIncome(
  section: string,
  committed: CommittedCell | null | undefined,
): boolean {
  if (section !== "INGRESOS" || !committed) return false;
  return committed.items.some((i) => i.kind === "dte");
}

/**
 * ¿Hay un plan manual activo que gana sobre la proyección automática?
 * (capa efectiva = plan, o plan guardado distinto de cero).
 */
export function hasManualPlanOverride(plan: number, layer: string): boolean {
  return plan !== 0 && layer === "plan";
}
