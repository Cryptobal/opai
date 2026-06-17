/**
 * Fallback determinístico para el desglose de mano de obra cuando
 * payrollSnapshot.breakdown está vacío (posiciones clonadas sin recálculo).
 *
 * IMPORTANTE: esto SOLO rellena el desglose INFORMATIVO que ve el cliente.
 * No altera el costo total de la posición (monthlyPositionCost), que sigue
 * siendo el valor oficial calculado por el motor de payroll. Las tasas son
 * aproximaciones legales vigentes para presentación transparente; si el
 * snapshot tiene los valores reales, se usan esos y este fallback no aplica.
 */

// Tasas empleador aproximadas (display-only). Ajustar si cambia la normativa.
const SIS_RATE = 0.0188; // Seguro de Invalidez y Sobrevivencia (empleador)
const AFC_RATE_INDEFINITE = 0.024; // AFC empleador, contrato indefinido
const MUTUAL_RATE_BASE = 0.0093; // Cotización básica Ley 16.744 (0.90% + 0.03% extra)
const GRATIFICATION_RATE = 0.25; // Art. 50 CT
const GRATIFICATION_CAP_MONTHLY = (500000 * 4.75) / 12; // tope mensual aprox (IMM × 4.75 / 12)

export interface LaborChargesInput {
  /** Sueldo base TOTAL de la posición (ya multiplicado por nº de guardias). */
  baseSalaryTotal: number;
  /** Nº de guardias en la posición (para topes per-cápita). */
  totalGuardsInPosition: number;
  /** breakdown crudo del payrollSnapshot (puede estar vacío). */
  snapshot: Record<string, unknown>;
}

export interface LaborChargesOutput {
  gratification: number;
  totalImponible: number;
  sisEmployer: number;
  afcEmployer: number;
  mutualEmployer: number;
  vacationProvision: number;
  severanceProvision: number;
}

function readNum(bd: Record<string, unknown>, key: string, mult: number): number {
  return Number(bd[key] ?? 0) * mult;
}
function readNested(bd: Record<string, unknown>, key: string, sub: string, mult: number): number {
  const v = bd[key] as Record<string, unknown> | undefined;
  return Number(v?.[sub] ?? 0) * mult;
}

export function resolveLaborCharges(input: LaborChargesInput): LaborChargesOutput {
  const { baseSalaryTotal, totalGuardsInPosition: g, snapshot: bd } = input;
  const guards = Math.max(1, g);

  // Gratificación: del snapshot, o fallback con tope per-cápita.
  let gratification = readNum(bd, "gratification", guards);
  if (gratification === 0 && baseSalaryTotal > 0) {
    const perGuard = baseSalaryTotal / guards;
    gratification = Math.min(perGuard * GRATIFICATION_RATE, GRATIFICATION_CAP_MONTHLY) * guards;
  }

  const totalImponible =
    readNum(bd, "total_taxable_income", guards) || baseSalaryTotal + gratification;

  // Cargas: del snapshot, o fallback sobre el imponible.
  let sisEmployer = readNum(bd, "sis_employer", guards);
  let afcEmployer = readNested(bd, "afc_employer", "total", guards);
  let mutualEmployer = readNested(bd, "work_injury_employer", "amount", guards);

  if (sisEmployer === 0 && totalImponible > 0) sisEmployer = totalImponible * SIS_RATE;
  if (afcEmployer === 0 && totalImponible > 0) afcEmployer = totalImponible * AFC_RATE_INDEFINITE;
  if (mutualEmployer === 0 && totalImponible > 0) mutualEmployer = totalImponible * MUTUAL_RATE_BASE;

  const vacationProvision = readNum(bd, "vacation_provision", guards);
  const severanceProvision = readNum(bd, "severance_provision", guards);

  return {
    gratification,
    totalImponible,
    sisEmployer,
    afcEmployer,
    mutualEmployer,
    vacationProvision,
    severanceProvision,
  };
}
