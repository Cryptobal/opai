/**
 * SIMULATE PAYSLIP
 * Simula liquidación completa de sueldo (haberes, descuentos, líquido)
 */

import { prisma } from "@/lib/prisma";
import type {
  PayslipSimulationInput,
  PayslipSimulationOutput,
  PayrollParameters,
  FxReferences,
} from "./types";
import {
  loadActiveParameters,
  loadParametersById,
  resolveFxReferences,
  createParametersSnapshot,
} from "./parameter-loader";
import { calculateTax, findTaxBracketIndex } from "./tax-calculator";

export async function simulatePayslip(
  input: PayslipSimulationInput
): Promise<PayslipSimulationOutput> {
  // 1. Cargar parámetros
  const paramsVersion = input.params_version_id
    ? await loadParametersById(input.params_version_id)
    : await loadActiveParameters();

  const params = paramsVersion.data;

  // 2. Resolver referencias FX
  const references = await resolveFxReferences(
    input.uf_value,
    input.uf_date,
    input.utm_value,
    input.utm_month
  );

  // 3. Configuración defaults
  const worked_days = input.worked_days || 30;
  const total_days_month = input.total_days_month || 30;
  const health_plan_pct = input.health_plan_pct || 0.07;
  const save_simulation = input.save_simulation !== false;

  // 4. Calcular topes en CLP
  const pension_cap_clp = params.caps.pension_uf * references.uf_clp;
  const afc_cap_clp = params.caps.afc_uf * references.uf_clp;

  // 5. CALCULAR HABERES IMPONIBLES
  // Proporcional por días
  const proportional_base = (input.base_salary_clp / total_days_month) * worked_days;

  // Horas extra
  const hour_value = input.base_salary_clp / 30 / 8;
  const overtime_50 = (input.overtime_hours_50 || 0) * hour_value * 1.5;
  const overtime_100 = (input.overtime_hours_100 || 0) * hour_value * 2.0;

  // Total imponible
  const total_taxable =
    proportional_base + overtime_50 + overtime_100 + (input.other_taxable_allowances || 0);

  // 6. HABERES NO IMPONIBLES
  const non_taxable = input.non_taxable_allowances || {};
  const total_non_taxable =
    (non_taxable.transport || 0) +
    (non_taxable.meal || 0) +
    (non_taxable.family || 0) +
    (non_taxable.other || 0);

  const gross_salary = total_taxable + total_non_taxable;

  // 7. APLICAR TOPES
  const base_pension = Math.min(total_taxable, pension_cap_clp);
  const base_afc = Math.min(total_taxable, afc_cap_clp);

  // 8. CALCULAR AFP (10% + comisión)
  const afp_commission = params.afp.commissions[input.afp_name]?.commission_rate || 0;
  const afp_base_rate = 0.1;
  const afp_total_rate = afp_base_rate + afp_commission;
  const afp_amount = base_pension * afp_total_rate;

  // 9. CALCULAR SALUD
  const health_rate = input.health_system === "fonasa" ? 0.07 : health_plan_pct;
  const health_amount = base_pension * health_rate;

  // 10. CALCULAR AFC TRABAJADOR
  const afc_worker_config =
    input.contract_type === "indefinite"
      ? params.afc.indefinite.worker
      : params.afc.fixed_term.worker;
  const afc_worker_amount = base_afc * afc_worker_config.total_rate;

  // 11. CALCULAR BASE TRIBUTARIA
  const taxable_base_clp = total_taxable - afp_amount - health_amount - afc_worker_amount;

  // 12. CALCULAR IMPUESTO ÚNICO
  const tax_amount = calculateTax(taxable_base_clp, params.tax_brackets);
  const tax_bracket_index = findTaxBracketIndex(taxable_base_clp, params.tax_brackets);
  const tax_bracket = params.tax_brackets[tax_bracket_index];

  // 13. DESCUENTOS ADICIONALES
  const additional_deductions_obj = input.additional_deductions || {};
  const additional_deductions_total =
    (additional_deductions_obj.loan || 0) +
    (additional_deductions_obj.advance || 0) +
    (additional_deductions_obj.other || 0);

  // 14. TOTAL DESCUENTOS
  const total_legal_deductions = afp_amount + health_amount + afc_worker_amount + tax_amount;
  const total_deductions = total_legal_deductions + additional_deductions_total;

  // 15. SUELDO LÍQUIDO
  const net_salary = gross_salary - total_deductions;

  // 16. COSTO EMPLEADOR
  // SIS
  const sis_employer_rate = params.sis.employer_rate;
  const sis_employer_amount = base_pension * sis_employer_rate;

  // AFC Empleador
  const afc_employer_config =
    input.contract_type === "indefinite"
      ? params.afc.indefinite.employer
      : params.afc.fixed_term.employer;
  const afc_employer_cic = base_afc * afc_employer_config.cic_rate;
  const afc_employer_fcs = base_afc * afc_employer_config.fcs_rate;
  const afc_employer_total = afc_employer_cic + afc_employer_fcs;

  // Mutual (usar base_rate si existe, sino employer_rate_default)
  const work_injury_rate = params.work_injury.base_rate || params.work_injury.employer_rate_default || 0.0093;
  const work_injury_amount = base_pension * work_injury_rate;

  const employer_cost_total =
    total_taxable +
    total_non_taxable +
    sis_employer_amount +
    afc_employer_total +
    work_injury_amount;

  // 17. Crear snapshot
  const snapshot = createParametersSnapshot(
    paramsVersion.id,
    params.version_metadata.name,
    paramsVersion.effectiveFrom,
    paramsVersion.effectiveUntil,
    params,
    references
  );

  // 18. Guardar simulación (opcional)
  let simulation_id: string | undefined;

  if (save_simulation) {
    const simulation = await prisma.payrollSimulation.create({
      data: {
        simulationType: "payslip",
        paramsVersionId: paramsVersion.id,
        inputs: input as any,
        results: {
          total_taxable_income: total_taxable,
          total_non_taxable_income: total_non_taxable,
          gross_salary,
          net_salary,
          total_deductions,
          employer_cost_total,
        },
        parametersSnapshot: snapshot as any,
        createdByUserId: null, // TODO: Obtener del contexto de sesión
        tenantId: null, // TODO: Obtener del contexto de sesión
      },
    });

    simulation_id = simulation.id;
  }

  // 19. Return result
  return {
    simulation_id,
    total_taxable_income: Math.round(total_taxable * 100) / 100,
    total_non_taxable_income: Math.round(total_non_taxable * 100) / 100,
    gross_salary: Math.round(gross_salary * 100) / 100,

    deductions: {
      afp: {
        base_rate: afp_base_rate,
        commission_rate: afp_commission,
        total_rate: afp_total_rate,
        base: Math.round(base_pension * 100) / 100,
        amount: Math.round(afp_amount * 100) / 100,
      },
      health: {
        rate: health_rate,
        base: Math.round(base_pension * 100) / 100,
        amount: Math.round(health_amount * 100) / 100,
      },
      afc: {
        worker_cic_rate: afc_worker_config.cic_rate,
        worker_fcs_rate: afc_worker_config.fcs_rate,
        total_rate: afc_worker_config.total_rate,
        base: Math.round(base_afc * 100) / 100,
        amount: Math.round(afc_worker_amount * 100) / 100,
      },
      tax: {
        base_clp: Math.round(taxable_base_clp * 100) / 100,
        bracket_index: tax_bracket_index,
        factor: tax_bracket.factor,
        rebate_clp: tax_bracket.rebate_clp,
        amount: Math.round(tax_amount * 100) / 100,
      },
      total_legal: Math.round(total_legal_deductions * 100) / 100,
    },

    additional_deductions: Math.round(additional_deductions_total * 100) / 100,
    total_deductions: Math.round(total_deductions * 100) / 100,
    net_salary: Math.round(net_salary * 100) / 100,

    employer_cost: {
      sis: {
        rate: sis_employer_rate,
        base: Math.round(base_pension * 100) / 100,
        amount: Math.round(sis_employer_amount * 100) / 100,
      },
      afc: {
        cic_rate: afc_employer_config.cic_rate,
        fcs_rate: afc_employer_config.fcs_rate,
        total_rate: afc_employer_config.total_rate,
        base: Math.round(base_afc * 100) / 100,
        cic_amount: Math.round(afc_employer_cic * 100) / 100,
        fcs_amount: Math.round(afc_employer_fcs * 100) / 100,
        total_amount: Math.round(afc_employer_total * 100) / 100,
      },
      work_injury: {
        rate: work_injury_rate,
        base: Math.round(base_pension * 100) / 100,
        amount: Math.round(work_injury_amount * 100) / 100,
      },
      total:
        Math.round(
          (sis_employer_amount + afc_employer_total + work_injury_amount) * 100
        ) / 100,
    },

    total_employer_cost: Math.round(employer_cost_total * 100) / 100,
    parameters_snapshot: snapshot,
    computed_at: new Date().toISOString(),
  };
}
