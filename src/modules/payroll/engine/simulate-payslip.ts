/**
 * SIMULATE PAYSLIP
 * Simula liquidación completa de sueldo (haberes, descuentos, líquido)
 * 
 * Orden legal de cálculo:
 *   1. Haberes imponibles (sueldo base, gratificación, horas extra, comisiones)
 *   2. Haberes no imponibles (colación, movilización, asig. familiar)
 *   3. Descuentos previsionales (AFP, Salud, AFC)
 *   4. APV Régimen B (reduce base tributable)
 *   5. Impuesto Único de Segunda Categoría
 *   6. Descuentos judiciales (pensión alimenticia)
 *   7. Descuentos voluntarios (préstamos, anticipos)
 *   8. Costo empleador (SIS, AFC empleador, Mutual)
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

/**
 * Calcula asignación familiar según tramos IPS
 */
function calculateFamilyAllowance(
  total_taxable_clp: number,
  num_dependents: number,
  has_maternal: boolean,
  has_invalidity: boolean,
  params: PayrollParameters
): { per_dependent: number; maternal: number; invalidity: number; total: number } {
  if (!params.family_allowance?.enabled || num_dependents === 0) {
    return { per_dependent: 0, maternal: 0, invalidity: 0, total: 0 };
  }

  // Buscar tramo según ingreso imponible
  const tranche = params.family_allowance.tranches.find((t) => {
    if (t.to_clp === null) return total_taxable_clp >= t.from_clp;
    return total_taxable_clp >= t.from_clp && total_taxable_clp <= t.to_clp;
  });

  if (!tranche) {
    return { per_dependent: 0, maternal: 0, invalidity: 0, total: 0 };
  }

  const per_dependent = tranche.amount_per_dependent * num_dependents;
  const maternal = has_maternal ? tranche.amount_maternal : 0;
  const invalidity = has_invalidity ? tranche.amount_invalidity : 0;

  return {
    per_dependent,
    maternal,
    invalidity,
    total: per_dependent + maternal + invalidity,
  };
}

export async function simulatePayslip(
  input: PayslipSimulationInput
): Promise<PayslipSimulationOutput> {
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

  // ── 3. CONFIGURACIÓN Y DEFAULTS ─────────────────────────
  const total_days_month = input.total_days_month || 30;
  const health_plan_pct = input.health_plan_pct || 0.07;
  const save_simulation = input.save_simulation !== false;

  // ── 4. CALCULAR DÍAS EFECTIVOS (AUSENCIAS) ──────────────
  const absences = input.absence_days || {};
  const unpaid_leave_days = absences.unpaid_leave || 0;
  // Licencia médica y vacaciones NO descuentan del proporcional
  // Solo permiso sin goce descuenta
  const effective_worked_days = input.worked_days
    ? input.worked_days
    : total_days_month - unpaid_leave_days;

  // ── 5. CALCULAR TOPES EN CLP ───────────────────────────
  const pension_cap_clp = params.caps.pension_uf * references.uf_clp;
  const health_cap_clp = params.caps.health_uf * references.uf_clp;
  const afc_cap_clp = params.caps.afc_uf * references.uf_clp;

  // ── 6. HABERES IMPONIBLES ──────────────────────────────
  // 6a. Sueldo base proporcional por días
  const proportional_base =
    (input.base_salary_clp / total_days_month) * effective_worked_days;

  // 6b. Recargo Legal por Trabajo en Día Feriado (Art. 38 CT)
  // Los trabajadores que trabajan en feriados tienen derecho a recargo del 100% del valor hora
  const hour_value = input.base_salary_clp / 30 / 8; // Valor hora normal (Art. 32 CT)
  const holiday_hours = input.holiday_hours_worked || 0;
  const holiday_surcharge = Math.round(holiday_hours * hour_value * 2); // Doble pago por feriado

  // 6c. Gratificación Legal (Art. 50 CT - Régimen 25% mensual)
  // La base incluye sueldo base + recargo feriado (Art. 41 CT - remuneración)
  const gratification_base = proportional_base + holiday_surcharge;
  let gratification = 0;
  if (input.gratification_clp !== undefined) {
    gratification = input.gratification_clp;
  } else if (params.gratification?.regime_25_monthly) {
    const monthly_rate = params.gratification?.regime_25_monthly?.monthly_rate || 0.25;
    const cap_multiple = params.gratification?.regime_25_monthly?.annual_cap_imm_multiple || 4.75;
    const monthly_gratification = gratification_base * monthly_rate;
    const annual_cap = references.imm_clp * cap_multiple;
    const monthly_cap = annual_cap / 12;
    gratification = Math.min(monthly_gratification, monthly_cap);
  }

  // 6d. Horas extra
  const overtime_50 = (input.overtime_hours_50 || 0) * hour_value * 1.5;
  const overtime_100 = (input.overtime_hours_100 || 0) * hour_value * 2.0;

  // 6d. Comisiones
  const commissions = input.commissions || 0;

  // 6e. Otros haberes imponibles
  const other_taxable = input.other_taxable_allowances || 0;

  // 6g. Total imponible
  const total_taxable =
    proportional_base + holiday_surcharge + gratification + overtime_50 + overtime_100 + commissions + other_taxable;

  // ── 7. HABERES NO IMPONIBLES ───────────────────────────
  const non_taxable = input.non_taxable_allowances || {};

  // 7a. Asignación Familiar (calculada desde tramos IPS)
  const family = calculateFamilyAllowance(
    total_taxable,
    input.num_dependents || 0,
    input.has_maternal_allowance || false,
    input.has_invalidity_allowance || false,
    params
  );

  const transport = non_taxable.transport || 0;
  const meal = non_taxable.meal || 0;
  const other_non_taxable = non_taxable.other || 0;

  const total_non_taxable =
    transport + meal + family.total + other_non_taxable;

  const gross_salary = total_taxable + total_non_taxable;

  // ── 8. APLICAR TOPES ──────────────────────────────────
  const base_pension = Math.min(total_taxable, pension_cap_clp);
  const base_health = Math.min(total_taxable, health_cap_clp);
  const base_afc = Math.min(total_taxable, afc_cap_clp);

  // ── 9. DESCUENTOS PREVISIONALES ───────────────────────
  // 9a. AFP (10% + comisión)
  // Case-insensitive lookup: params store lowercase ("modelo"), input may be "Modelo"
  const afp_key = Object.keys(params.afp.commissions).find(
    (k) => k.toLowerCase() === input.afp_name.toLowerCase()
  ) || input.afp_name;
  const afp_commission =
    params.afp.commissions[afp_key]?.commission_rate || 0;
  const afp_base_rate = params.afp.base_rate;
  const afp_total_rate = afp_base_rate + afp_commission;
  const afp_amount = Math.floor(base_pension * afp_total_rate);

  // 9b. Salud (Fonasa 7% fijo / Isapre variable)
  const health_rate =
    input.health_system === "fonasa"
      ? params.health.fonasa.rate
      : health_plan_pct;
  const health_amount = Math.floor(base_health * health_rate);

  // 9c. AFC Trabajador
  const afc_worker_config =
    input.contract_type === "indefinite"
      ? params.afc.indefinite.worker
      : params.afc.fixed_term.worker;
  const afc_worker_amount = Math.floor(base_afc * afc_worker_config.total_rate);

  // ── 10. APV (RÉGIMEN B REDUCE BASE TRIBUTABLE) ───────
  const apv_amount = input.additional_deductions?.apv || 0;
  const apv_rebate_tax = apv_amount > 0; // Régimen B: descuenta de base tributable

  // ── 11. BASE TRIBUTABLE ───────────────────────────────
  // Base tributable = Total imponible - AFP - Salud - AFC - APV(régimen B)
  let taxable_base_clp =
    total_taxable - afp_amount - health_amount - afc_worker_amount;

  if (apv_rebate_tax && apv_amount > 0) {
    taxable_base_clp -= apv_amount;
  }

  // La base tributable no puede ser negativa
  taxable_base_clp = Math.max(0, taxable_base_clp);

  // ── 12. IMPUESTO ÚNICO (SII) ─────────────────────────
  const tax_amount = calculateTax(taxable_base_clp, params.tax_brackets);
  const tax_bracket_index = findTaxBracketIndex(
    taxable_base_clp,
    params.tax_brackets
  );
  const tax_bracket = params.tax_brackets[tax_bracket_index];

  // ── 13. TOTAL DESCUENTOS LEGALES ─────────────────────
  const total_legal_deductions =
    afp_amount + health_amount + afc_worker_amount + apv_amount + tax_amount;

  // ── 14. DESCUENTOS VOLUNTARIOS / JUDICIALES ──────────
  const additional_deductions_obj = input.additional_deductions || {};
  const pension_alimenticia = additional_deductions_obj.pension_alimenticia || 0;
  const loan = additional_deductions_obj.loan || 0;
  const advance = additional_deductions_obj.advance || 0;
  const caja_loan = additional_deductions_obj.caja_loan || 0;
  const other_deductions = additional_deductions_obj.other || 0;
  const additional_deductions_total =
    pension_alimenticia + loan + advance + caja_loan + other_deductions;

  // ── 15. TOTAL DESCUENTOS ─────────────────────────────
  const total_deductions = total_legal_deductions + additional_deductions_total;

  // ── 16. SUELDO LÍQUIDO ───────────────────────────────
  const net_salary = gross_salary - total_deductions;

  // ── 17. COSTO EMPLEADOR ──────────────────────────────
  // 17a. SIS (sobre base pensión)
  const sis_employer_rate = params.sis.employer_rate;
  const sis_employer_amount = Math.round(base_pension * sis_employer_rate);

  // 17b. AFC Empleador
  const afc_employer_config =
    input.contract_type === "indefinite"
      ? params.afc.indefinite.employer
      : params.afc.fixed_term.employer;
  const afc_employer_cic = Math.round(base_afc * afc_employer_config.cic_rate);
  const afc_employer_fcs = Math.round(base_afc * afc_employer_config.fcs_rate);
  const afc_employer_total = afc_employer_cic + afc_employer_fcs;

  // 17c. Mutual / Accidentes del Trabajo (sobre base pensión)
  const work_injury_base_rate = params.work_injury.base_rate || 0.0093;
  const work_injury_additional_rate =
    params.work_injury.additional_rate_default || 0;
  const work_injury_total_rate =
    work_injury_base_rate + work_injury_additional_rate;
  const work_injury_amount = Math.round(base_pension * work_injury_total_rate);

  // 17d. Total aportes empleador (solo contribuciones, no salario)
  const employer_contributions_total =
    sis_employer_amount + afc_employer_total + work_injury_amount;

  // 17e. Costo total empleador (salario bruto + contribuciones)
  const employer_cost_total = gross_salary + employer_contributions_total;

  // ── 18. CREAR SNAPSHOT ───────────────────────────────
  const snapshot = createParametersSnapshot(
    paramsVersion.id,
    params.version_metadata.name,
    paramsVersion.effectiveFrom,
    paramsVersion.effectiveUntil,
    params,
    references
  );

  // ── 19. GUARDAR SIMULACIÓN ───────────────────────────
  let simulation_id: string | undefined;

  if (save_simulation) {
    const simulation = await prisma.payrollSimulation.create({
      data: {
        simulationType: "payslip",
        paramsVersionId: paramsVersion.id,
        inputs: input as any,
        results: {
          total_taxable_income: Math.round(total_taxable),
          total_non_taxable_income: Math.round(total_non_taxable),
          gross_salary: Math.round(gross_salary),
          net_salary: Math.round(net_salary),
          total_deductions: Math.round(total_deductions),
          employer_cost_total: Math.round(employer_cost_total),
        },
        parametersSnapshot: snapshot as any,
        createdByUserId: null,
        tenantId: null,
      },
    });

    simulation_id = simulation.id;
  }

  // ── 20. RETORNAR RESULTADO ───────────────────────────
  return {
    simulation_id,

    haberes: {
      base_salary: Math.round(proportional_base),
      gratification: Math.round(gratification),
      holiday_surcharge: Math.round(holiday_surcharge),
      overtime_50: Math.round(overtime_50),
      overtime_100: Math.round(overtime_100),
      commissions: Math.round(commissions),
      other_taxable: Math.round(other_taxable),
      total_taxable: Math.round(total_taxable),

      transport: Math.round(transport),
      meal: Math.round(meal),
      family_allowance: Math.round(family.per_dependent),
      maternal_allowance: Math.round(family.maternal),
      other_non_taxable: Math.round(other_non_taxable),
      total_non_taxable: Math.round(total_non_taxable),

      gross_salary: Math.round(gross_salary),
    },

    deductions: {
      afp: {
        base_rate: afp_base_rate,
        commission_rate: afp_commission,
        total_rate: afp_total_rate,
        base_imponible: Math.round(base_pension),
        amount: afp_amount,
      },
      health: {
        rate: health_rate,
        base_imponible: Math.round(base_health),
        amount: health_amount,
      },
      afc: {
        worker_cic_rate: afc_worker_config.cic_rate,
        worker_fcs_rate: afc_worker_config.fcs_rate,
        total_rate: afc_worker_config.total_rate,
        base_imponible: Math.round(base_afc),
        amount: afc_worker_amount,
      },
      apv: {
        amount: Math.round(apv_amount),
        rebate_tax: apv_rebate_tax,
      },
      tax: {
        base_clp: Math.round(taxable_base_clp),
        bracket_index: tax_bracket_index,
        factor: tax_bracket.factor,
        rebate_clp: tax_bracket.rebate_clp,
        amount: Math.round(tax_amount),
      },
      total_legal: Math.round(total_legal_deductions),
    },

    voluntary_deductions: {
      pension_alimenticia: Math.round(pension_alimenticia),
      loan: Math.round(loan),
      advance: Math.round(advance),
      caja_loan: Math.round(caja_loan),
      other: Math.round(other_deductions),
      total: Math.round(additional_deductions_total),
    },

    total_deductions: Math.round(total_deductions),
    net_salary: Math.round(net_salary),

    employer_cost: {
      sis: {
        rate: sis_employer_rate,
        base: Math.round(base_pension),
        amount: sis_employer_amount,
      },
      afc: {
        cic_rate: afc_employer_config.cic_rate,
        fcs_rate: afc_employer_config.fcs_rate,
        total_rate: afc_employer_config.total_rate,
        base: Math.round(base_afc),
        cic_amount: afc_employer_cic,
        fcs_amount: afc_employer_fcs,
        total_amount: afc_employer_total,
      },
      work_injury: {
        base_rate: work_injury_base_rate,
        additional_rate: work_injury_additional_rate,
        total_rate: work_injury_total_rate,
        base: Math.round(base_pension),
        amount: work_injury_amount,
      },
      total: employer_contributions_total,
    },

    total_employer_cost: Math.round(employer_cost_total),
    parameters_snapshot: snapshot,
    computed_at: new Date().toISOString(),
  };
}
