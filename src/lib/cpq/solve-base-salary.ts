/**
 * Inverso práctico: dado un sueldo líquido objetivo del trabajador, estima base imponible
 * mensual mediante búsqueda binaria sobre `computeEmployerCost` (CPQ / costeo Patrón A).
 */

import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import { buildCpqStyleEmployerCostInput } from "@/lib/cpq/cpq-employer-cost-input";

const MIN_LEGAL_BASE = 500000;
const BINARY_ITERS = 35;

function netForBase(base: number, opts: SolveOpts): Promise<number> {
  const compat = {
    afpName: opts.afpName,
    healthSystem: opts.healthSystem ?? undefined,
    healthPlanPct: opts.healthPlanPct ?? undefined,
  };
  return computeEmployerCost(buildCpqStyleEmployerCostInput(base, compat)).then(
    (p) => p.worker_net_salary_estimate,
  );
}

type SolveOpts = {
  afpName?: string;
  healthSystem?: string | null;
  healthPlanPct?: number | null;
};

export async function solveBaseSalaryFromNet(
  netTarget: number,
  opts: SolveOpts & { toleranceAbs?: number } = {},
): Promise<{ baseSalary: number; resultingNet: number }> {
  if (!Number.isFinite(netTarget) || netTarget <= 0) {
    throw new Error("netTarget debe ser mayor a 0");
  }
  const tolerance = opts.toleranceAbs ?? 500;
  let lo = MIN_LEGAL_BASE;
  let hi = Math.max(lo * 2, Math.ceil(netTarget * 5));

  let netLo = await netForBase(lo, opts);
  let netHi = await netForBase(hi, opts);
  while (netHi < netTarget && hi < netTarget * 25) {
    hi = Math.ceil(hi * 1.35);
    netHi = await netForBase(hi, opts);
  }

  for (let i = 0; i < BINARY_ITERS && lo + 50 < hi; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const netMid = await netForBase(mid, opts);
    if (Math.abs(netMid - netTarget) <= tolerance) {
      return { baseSalary: mid, resultingNet: netMid };
    }
    if (netMid < netTarget) lo = mid;
    else hi = mid;
  }

  const candidate = Math.floor((lo + hi) / 2);
  const resultingNet = await netForBase(candidate, opts);
  return { baseSalary: candidate, resultingNet };
}
