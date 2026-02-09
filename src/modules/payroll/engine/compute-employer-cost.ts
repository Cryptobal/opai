/**
 * COMPUTE EMPLOYER COST
 * Calcula el costo mensual total del empleador (usado por CPQ)
 * 
 * Incluye:
 *   - Salario bruto (base + gratificación + horas extra + comisiones)
 *   - Aportes empleador (SIS, AFC, Mutual)
 *   - Haberes no imponibles (colación, movilización, asig. familiar)
 *   - Provisiones (vacaciones, indemnización)
 *   - Estimación líquido trabajador
 */

import type {
  EmployerCostInput,
  EmployerCostOutput,
  PayrollParameters,
  FxReferences,
} from "./types";
import {
  loadActiveParameters,
  loadParametersById,
  resolveFxReferences,
  createParametersSnapshot,
} from "./parameter-loader";
import { calculateTax } from "./tax-calculator";

/**
 * Calcula asignación familiar según tramos IPS (para costeo)
 */
function calculateFamilyAllowance(
  total_taxable_clp: number,
  num_dependents: number,
  has_maternal: boolean,
  params: PayrollParameters
): number {
  if (!params.family_allowance?.enabled || !num_dependents) {
    return 0;
  }

  const tranche = params.family_allowance.tranches.find((t) => {
    if (t.to_clp === null) return total_taxable_clp >= t.from_clp;
    return total_taxable_clp >= t.from_clp && total_taxable_clp <= t.to_clp;
  });

  if (!tranche) return 0;

  let amount = tranche.amount_per_dependent * num_dependents;
  if (has_maternal) amount += tranche.amount_maternal;
  return amount;
}

export async function computeEmployerCost(
  input: EmployerCostInput
): Promise<EmployerCostOutput> {
  // ── 0. VALIDACIONES ──────────────────────────────────────
  if (input.base_salary_clp <= 0) {
    throw new Error("base_salary_clp debe ser mayor a 0");
  }

  // ── 1. CARGAR PARÁMETROS ─────────────────────────────────
  const paramsVersion = input.params_version_id
    ? await loadParametersById(input.params_version_id)
    : await loadActiveParameters();

  const params = paramsVersion.data;

  // ── 2. RESOLVER REFERENCIAS FX (UF/UTM/IMM) ─────────────
  const references = await resolveFxReferences(
    input.uf_value,
    input.uf_date,
    input.utm_value,
    input.utm_month,
    params.imm?.value_clp
  );

  // ── 3. CONFIGURACIÓN DEFAULTS ────────────────────────────
  const afp_name = input.afp_name || "habitat";
  const health_system = input.health_system || "fonasa";
  const health_plan_pct = input.health_plan_pct || 0.07;
  const work_injury_risk = input.work_injury_risk || "medium";

  const includeGratification = input.assumptions?.include_gratification !== false;
  const includeVacation = input.assumptions?.include_vacation_provision !== false;
  const includeSeverance = input.assumptions?.include_severance_provision !== false;

  const vacationPct = input.assumptions?.vacation_provision_pct || 0.0833;
  const severancePct = input.assumptions?.severance_provision_pct || 0.04166;

  // ── 4. CALCULAR TOPES EN CLP ─────────────────────────────
  const pension_cap_clp = params.caps.pension_uf * references.uf_clp;
  const health_cap_clp = params.caps.health_uf * references.uf_clp;
  const afc_cap_clp = params.caps.afc_uf * references.uf_clp;

  // ── 5. SUELDO BASE ───────────────────────────────────────
  const base_salary = input.base_salary_clp;

  // ── 6. GRATIFICACIÓN LEGAL (Art. 50 CT) ──────────────────
  let gratification = 0;
  if (includeGratification) {
    const monthly_rate = params.gratification?.regime_25_monthly?.monthly_rate || 0.25;
    const cap_multiple = params.gratification?.regime_25_monthly?.annual_cap_imm_multiple || 4.75;
    const monthly_gratification = base_salary * monthly_rate;
    const annual_cap = references.imm_clp * cap_multiple;
    const monthly_cap = annual_cap / 12;
    gratification = Math.min(monthly_gratification, monthly_cap);
  }

  // ── 7. HORAS EXTRA ───────────────────────────────────────
  let overtime = 0;
  if (input.overtime_hours_50 && input.overtime_hours_50 > 0) {
    const hour_value = base_salary / 30 / 8;
    overtime = input.overtime_hours_50 * hour_value * 1.5;
  }

  // ── 8. COMISIONES ────────────────────────────────────────
  const commissions = input.commissions || 0;

  // ── 9. TOTAL IMPONIBLE ───────────────────────────────────
  const total_taxable = base_salary + gratification + overtime + commissions;
  const imponible_pension = Math.min(total_taxable, pension_cap_clp);
  const imponible_health = Math.min(total_taxable, health_cap_clp);
  const imponible_afc = Math.min(total_taxable, afc_cap_clp);

  // ── 10. HABERES NO IMPONIBLES ────────────────────────────
  const transport_allowance = input.transport_allowance || 0;
  const meal_allowance = input.meal_allowance || 0;
  const family_allowance = calculateFamilyAllowance(
    total_taxable,
    input.num_dependents || 0,
    input.has_maternal_allowance || false,
    params
  );
  const total_non_taxable = transport_allowance + meal_allowance + family_allowance;

  // ── 11. AFC EMPLEADOR ────────────────────────────────────
  const afc_config =
    input.contract_type === "indefinite"
      ? params.afc.indefinite.employer
      : params.afc.fixed_term.employer;

  const afc_employer_cic = imponible_afc * afc_config.cic_rate;
  const afc_employer_fcs = imponible_afc * afc_config.fcs_rate;
  const afc_employer_total = afc_employer_cic + afc_employer_fcs;

  // ── 12. SIS EMPLEADOR ────────────────────────────────────
  const sis_employer = imponible_pension * params.sis.employer_rate;

  // ── 13. MUTUAL / ACCIDENTES DEL TRABAJO ──────────────────
  let work_injury_base_rate: number;
  let work_injury_additional_rate: number;
  let work_injury_total_rate: number;

  if (input.assumptions?.work_injury_override?.total_rate) {
    work_injury_total_rate = input.assumptions.work_injury_override.total_rate;
    work_injury_base_rate = params.work_injury.base_rate;
    work_injury_additional_rate = work_injury_total_rate - work_injury_base_rate;
  } else if (input.assumptions?.work_injury_override) {
    const override = input.assumptions.work_injury_override;
    work_injury_base_rate = override.basic_rate || params.work_injury.base_rate;
    work_injury_additional_rate =
      (override.additional_rate || 0) + (override.extra_rate || 0);
    work_injury_total_rate = work_injury_base_rate + work_injury_additional_rate;
  } else {
    // Usar risk level o base_rate
    work_injury_total_rate =
      params.work_injury.risk_levels?.[work_injury_risk] ||
      params.work_injury.base_rate ||
      0.0093;
    work_injury_base_rate = params.work_injury.base_rate;
    work_injury_additional_rate = work_injury_total_rate - work_injury_base_rate;
  }

  const work_injury_employer = imponible_pension * work_injury_total_rate;

  // ── 14. COSTO DIRECTO ────────────────────────────────────
  // Salario bruto imponible + no imponible + aportes empleador
  const direct_cost =
    total_taxable +
    total_non_taxable +
    sis_employer +
    afc_employer_total +
    work_injury_employer;

  // ── 15. PROVISIONES ──────────────────────────────────────
  const vacation_provision = includeVacation ? direct_cost * vacationPct : 0;
  const severance_provision = includeSeverance ? direct_cost * severancePct : 0;

  // ── 16. TOTAL COSTO EMPLEADOR ────────────────────────────
  const total_cost = direct_cost + vacation_provision + severance_provision;

  // ── 17. ESTIMACIÓN DESCUENTOS TRABAJADOR ─────────────────
  const afp_commission =
    params.afp.commissions[afp_name]?.commission_rate || 0;
  const afp_total_rate = params.afp.base_rate + afp_commission;
  const afp_worker = Math.floor(imponible_pension * afp_total_rate);

  const health_rate = health_system === "fonasa" ? 0.07 : health_plan_pct;
  const health_worker = Math.floor(imponible_health * health_rate);

  const afc_worker_config =
    input.contract_type === "indefinite"
      ? params.afc.indefinite.worker
      : params.afc.fixed_term.worker;
  const afc_worker = Math.floor(imponible_afc * afc_worker_config.total_rate);

  const taxable_base = total_taxable - afp_worker - health_worker - afc_worker;
  const tax = calculateTax(Math.max(0, taxable_base), params.tax_brackets);

  const total_deductions = afp_worker + health_worker + afc_worker + tax;
  const net_salary_estimate = total_taxable + total_non_taxable - total_deductions;

  // ── 18. CREAR SNAPSHOT ───────────────────────────────────
  const snapshot = createParametersSnapshot(
    paramsVersion.id,
    params.version_metadata.name,
    paramsVersion.effectiveFrom,
    paramsVersion.effectiveUntil,
    params,
    references
  );

  // ── 19. RETORNAR RESULTADO ───────────────────────────────
  return {
    monthly_employer_cost_clp: Math.round(total_cost),
    breakdown: {
      base_salary: Math.round(base_salary),
      gratification: Math.round(gratification),
      overtime: Math.round(overtime),
      total_taxable_income: Math.round(total_taxable),

      // Haberes no imponibles
      transport_allowance: Math.round(transport_allowance),
      meal_allowance: Math.round(meal_allowance),
      family_allowance: Math.round(family_allowance),
      total_non_taxable_income: Math.round(total_non_taxable),

      // Aportes empleador
      sis_employer: Math.round(sis_employer),
      afc_employer: {
        cic: Math.round(afc_employer_cic),
        fcs: Math.round(afc_employer_fcs),
        total: Math.round(afc_employer_total),
      },
      work_injury_employer: {
        base_rate: Math.round(work_injury_base_rate * 10000) / 10000,
        additional_rate:
          Math.round(work_injury_additional_rate * 10000) / 10000,
        total_rate: Math.round(work_injury_total_rate * 10000) / 10000,
        amount: Math.round(work_injury_employer),
      },
      vacation_provision: Math.round(vacation_provision),
      severance_provision: Math.round(severance_provision),
      subtotal_direct_cost: Math.round(direct_cost),
      total_cost: Math.round(total_cost),
    },
    worker_breakdown_estimate: {
      afp: {
        base_rate: params.afp.base_rate,
        commission_rate: afp_commission,
        total_rate: afp_total_rate,
        amount: afp_worker,
      },
      health: health_worker,
      afc: afc_worker,
      tax: Math.round(tax),
      total_deductions: Math.round(total_deductions),
    },
    worker_net_salary_estimate: Math.round(net_salary_estimate),
    cost_to_net_ratio:
      net_salary_estimate > 0
        ? Math.round((total_cost / net_salary_estimate) * 100) / 100
        : 0,
    parameters_snapshot: snapshot,
    computed_at: new Date().toISOString(),
  };
}
