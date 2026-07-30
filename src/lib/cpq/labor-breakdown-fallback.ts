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
// Fallback alineado a Agosto 2026: SIS absorbido en reforma 3,5%.
const SIS_RATE = 0.0;
const PENSION_REFORM_RATE = 0.035; // Ley 21.735 (ago-2026 en adelante)
const AFC_RATE_INDEFINITE = 0.024; // AFC empleador, contrato indefinido
const MUTUAL_RATE_BASE = 0.012; // security_industry (1,20%)
const GRATIFICATION_RATE = 0.25; // Art. 50 CT
const GRATIFICATION_CAP_MONTHLY = (553553 * 4.75) / 12; // IMM jul-2026 × 4.75 / 12

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
  pensionReformEmployer: number;
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
  let pensionReformEmployer = readNum(bd, "pension_reform_employer", guards);
  let afcEmployer = readNested(bd, "afc_employer", "total", guards);
  let mutualEmployer = readNested(bd, "work_injury_employer", "amount", guards);

  // Fallback display-only solo si el snapshot no trae cargas sociales.
  const hasAnyEmployerCharge =
    sisEmployer > 0 || pensionReformEmployer > 0 || afcEmployer > 0 || mutualEmployer > 0;
  if (!hasAnyEmployerCharge && totalImponible > 0) {
    sisEmployer = totalImponible * SIS_RATE;
    pensionReformEmployer = totalImponible * PENSION_REFORM_RATE;
    afcEmployer = totalImponible * AFC_RATE_INDEFINITE;
    mutualEmployer = totalImponible * MUTUAL_RATE_BASE;
  }

  const vacationProvision = readNum(bd, "vacation_provision", guards);
  const severanceProvision = readNum(bd, "severance_provision", guards);

  return {
    gratification,
    totalImponible,
    sisEmployer,
    pensionReformEmployer,
    afcEmployer,
    mutualEmployer,
    vacationProvision,
    severanceProvision,
  };
}
