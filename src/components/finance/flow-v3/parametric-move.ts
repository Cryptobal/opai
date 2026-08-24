import { normalizeNameForDedupe } from "@/modules/finance/flow-v3/row-visibility";

/** Filas paramétricas v5 que admiten "Mover" desde capa committed (sin template/hito). */
const PARAMETRIC_MOVE_NAMES = new Set([
  "retiro socios",
  "retiro socio",
  "finiquitos",
  "finiquito",
  "turnos extra",
  "turno extra",
]);

export function isParametricMoveRow(rowName: string): boolean {
  return PARAMETRIC_MOVE_NAMES.has(normalizeNameForDedupe(rowName));
}

/**
 * Monto de plan al mover una proyección paramétrica.
 * FINANCIAMIENTO guarda el plan signado (egreso −); el resto, magnitud positiva.
 */
export function signedParametricPlanAmount(section: string, magnitude: number): number {
  const mag = Math.round(Math.abs(magnitude));
  if (mag === 0) return 0;
  return section === "FINANCIAMIENTO" ? -mag : mag;
}
