/**
 * Defaults de costeo empleador alineados con CPQ (creación/edición de puestos).
 * Único lugar para evitar divergencia Lead / CPQ / PDF preview.
 */

import type { EmployerCostInput } from "@/modules/payroll/engine";

export function buildCpqStyleEmployerCostInput(
  baseSalary: number,
  opts?: {
    ufValue?: number | null;
    afpName?: string;
    healthSystem?: string;
    healthPlanPct?: number;
  }
): EmployerCostInput {
  const healthSystem = opts?.healthSystem ?? "fonasa";
  const healthPlanPct =
    healthSystem === "isapre"
      ? opts?.healthPlanPct ?? 0.07
      : 0.07;

  return {
    base_salary_clp: Math.round(Number(baseSalary)),
    contract_type: "indefinite",
    afp_name: opts?.afpName ?? "modelo",
    health_system: healthSystem,
    health_plan_pct: healthPlanPct,
    assumptions: {
      include_vacation_provision: true,
      include_severance_provision: true,
      vacation_provision_pct: 0.0833,
      severance_provision_pct: 0.04166,
    },
    ...(opts?.ufValue != null && opts.ufValue > 0 ? { uf_value: opts.ufValue } : {}),
  };
}
