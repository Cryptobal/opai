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
 * F29 cuyo IVA determinado ya se movió a «IVA postergado». El plan manual
 * de esa celda no debe pisar el comprometido (resto PPM) ni el vacío.
 */
export function committedHasPostponedIvaF29(
  committed: CommittedCell | null | undefined,
): boolean {
  if (!committed) return false;
  return committed.items.some(
    (i) => i.kind === "scheduled" && i.milestoneKey === "f29" && i.ivaPostponed === true,
  );
}

export function hasPostponedIvaF29(
  canonicalKey: string | null | undefined,
  committed: CommittedCell | null | undefined,
): boolean {
  if (canonicalKey !== "IVA_F29") return false;
  return committedHasPostponedIvaF29(committed);
}

/**
 * El plan manual no pisa la capa efectiva: factura de ingreso o F29 con IVA
 * postergado. Mismo criterio para editar la celda.
 */
export function planYieldsToCommitted(
  section: string,
  canonicalKey: string | null | undefined,
  committed: CommittedCell | null | undefined,
): boolean {
  return hasInvoicedIncome(section, committed) || hasPostponedIvaF29(canonicalKey, committed);
}

/** Motivo corto cuando el plan no se puede editar / no suma. */
export function planYieldsReason(
  section: string,
  canonicalKey: string | null | undefined,
  committed: CommittedCell | null | undefined,
): string | null {
  if (hasInvoicedIncome(section, committed)) {
    return "Ingreso facturado (la factura manda)";
  }
  if (hasPostponedIvaF29(canonicalKey, committed)) {
    return "IVA postergado (no suma en este mes)";
  }
  return null;
}

/**
 * ¿Hay un plan manual activo que gana sobre la proyección automática?
 * (capa efectiva = plan, o plan guardado distinto de cero).
 */
export function hasManualPlanOverride(plan: number, layer: string): boolean {
  return plan !== 0 && layer === "plan";
}
