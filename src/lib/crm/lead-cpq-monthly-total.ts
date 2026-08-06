/**
 * Pure helpers to compute the same monthly sale (CLP) as LeadInstallationCpq estimate,
 * for aggregating multiple installations in the lead header without mounting each CPQ card.
 */

import type { LeadCpqConfig } from "@/components/crm/LeadInstallationCpq";
import type { MarginMode } from "@/types/cpq";
import { computeFinancialAndPolicy } from "@/modules/cpq/costing/financial-policy";

const COST_TYPE_CATEGORY: Record<string, { category: "direct" | "indirect"; group: string }> = {
  uniform: { category: "direct", group: "Uniformes" },
  exam: { category: "direct", group: "Exámenes" },
  meal: { category: "direct", group: "Alimentación" },
  phone: { category: "indirect", group: "Equipos operativos" },
  radio: { category: "indirect", group: "Equipos operativos" },
  flashlight: { category: "indirect", group: "Equipos operativos" },
  transport: { category: "indirect", group: "Transporte" },
  vehicle_rent: { category: "indirect", group: "Vehículos" },
  vehicle_fuel: { category: "indirect", group: "Vehículos" },
  vehicle_tag: { category: "indirect", group: "Vehículos" },
  infrastructure: { category: "indirect", group: "Infraestructura" },
  fuel: { category: "indirect", group: "Infraestructura" },
  system: { category: "indirect", group: "Sistemas" },
};

function normalizeUnitPrice(value: number, unit?: string | null, contractMonths?: number): number {
  if (!unit) return value;
  const n = unit.toLowerCase();
  if (n.includes("contrato") || n.includes("contract")) {
    const months = contractMonths && contractMonths > 0 ? contractMonths : 12;
    return value / months;
  }
  if (n.includes("año") || n.includes("year")) return value / 12;
  if (n.includes("semestre") || n.includes("semester")) return value / 6;
  return value;
}

function computeCostTotals(config: LeadCpqConfig): {
  directos: number;
  indirectos: number;
  total: number;
} {
  const uniformChangesPerYear = config.uniformChangesPerYear ?? 3;
  const avgStayMonths = config.avgStayMonths ?? 4;
  const contractMonths = config.conditions?.contractDuration ?? 12;
  const guards = config.positions.reduce((s, p) => s + (p.cantidad || 1) * (p.numPuestos || 1), 0);

  let uniformRotatingCost = 0;
  let uniformProratedCost = 0;
  let examSetCost = 0;
  let otherDirectos = 0;
  let indirectos = 0;

  for (const item of config.costItems) {
    if (!item.enabled) continue;
    const cat = COST_TYPE_CATEGORY[item.type];
    if (!cat) continue;

    if (item.type === "uniform") {
      const price = item.priceOverride ?? item.basePrice;
      const logic = item.priceLogic ?? "uniform";
      if (logic === "prorated") {
        uniformProratedCost += normalizeUnitPrice(price, item.unit, contractMonths);
      } else {
        uniformRotatingCost += normalizeUnitPrice(price, item.unit, contractMonths);
      }
    } else if (item.type === "exam") {
      examSetCost += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit, contractMonths);
    } else if (cat.category === "direct") {
      otherDirectos += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit, contractMonths);
    } else {
      indirectos += normalizeUnitPrice(item.priceOverride ?? item.basePrice, item.unit, contractMonths);
    }
  }

  const monthlyUniforms =
    guards > 0 ? ((uniformRotatingCost * uniformChangesPerYear) / 12 + uniformProratedCost) * guards : 0;

  const examEntriesPerYear = avgStayMonths > 0 ? 12 / avgStayMonths : 0;
  const examFrequency = Math.max(examEntriesPerYear, uniformChangesPerYear);
  const monthlyExams = guards > 0 ? ((examSetCost * examFrequency) / 12) * guards : 0;

  const directos = monthlyUniforms + monthlyExams + otherDirectos;
  return {
    directos,
    indirectos,
    total: directos + indirectos,
  };
}

export type PayrollPreviewItem = { employerCostPerGuard: number };

/**
 * Monthly sale price in CLP for one installation config, given employer-cost preview rows
 * (same length as config.positions). Mirrors LeadInstallationCpq `estimate.precioVenta`.
 */
export function computeLeadCpqMonthlySaleClp(
  config: LeadCpqConfig,
  payrollPreview: PayrollPreviewItem[],
  opts?: { ufValue?: number | null },
): number {
  const laborPayrollReady =
    payrollPreview.length === config.positions.length && config.positions.length > 0;

  const totalCostoManoObra = laborPayrollReady
    ? config.positions.reduce((sum, p, i) => {
        const per = payrollPreview[i]?.employerCostPerGuard ?? 0;
        const guards = (p.cantidad || 1) * (p.numPuestos || 1);
        return sum + per * guards;
      }, 0)
    : 0;

  const holidayAnnualCount = 12;
  const holidayBufferPct = 10;
  const holidayAdjustment =
    totalCostoManoObra > 0
      ? (totalCostoManoObra / 30) * 0.5 * (holidayAnnualCount / 12) * (1 + holidayBufferPct / 100)
      : 0;

  const contractDur = config.conditions.contractDuration > 0 ? config.conditions.contractDuration : 12;
  const totalLineas = config.additionalLines.reduce((sum, l) => {
    const base = Number(l.precio || 0) * Number(l.cantidad || 1);
    const m = Number(l.marginPct || 0);
    const venta = m > 0 && m < 100 ? base / (1 - m / 100) : base;
    return sum + (l.recurrencia === "unico" && contractDur > 0 ? venta / contractDur : venta);
  }, 0);

  const costTotals = computeCostTotals(config);
  const costosAdicionales = costTotals.total;
  const costoBase = totalCostoManoObra + holidayAdjustment + costosAdicionales;
  const marginPct = config.marginPercentage / 100;
  const laborCost = totalCostoManoObra + holidayAdjustment;
  const nonLaborCost = costosAdicionales;

  const marginMode: MarginMode = config.marginMode ?? "margin_on_sale";
  let baseConMargen: number;
  if (marginMode === "markup") {
    baseConMargen = costoBase * (1 + marginPct);
  } else if (marginMode === "margin_on_labor") {
    const laborWithMargin = marginPct < 1 ? laborCost / (1 - marginPct) : laborCost;
    baseConMargen = laborWithMargin + nonLaborCost;
  } else {
    baseConMargen = marginPct < 1 ? costoBase / (1 - marginPct) : costoBase;
  }

  const fc = config.financialCosts;
  const fin = computeFinancialAndPolicy({
    baseWithMargin: baseConMargen,
    additionalLinesTotalWithMargin: totalLineas,
    costsBase: costoBase,
    additionalLinesTotalBase: totalLineas,
    financialEnabled: fc.financialEnabled,
    financialRatePct: fc.financialRatePct,
    financialBaseMode: fc.financialBaseMode ?? (fc.salePriceBase > 0 ? "manual" : "auto"),
    salePriceBase: fc.salePriceBase,
    policyEnabled: fc.policyEnabled ?? false,
    policyAmountMode: fc.policyAmountMode ?? "pct",
    policyContractMonths: fc.policyContractMonths ?? 12,
    policyContractPct: fc.policyContractPct ?? 10,
    policyRatePct: fc.policyRatePct ?? 2,
    policyAdminRatePct: fc.policyAdminRatePct ?? 0.2,
    policyFixedAmountUF: fc.policyFixedAmountUF ?? 0,
    liabilityEnabled: fc.liabilityEnabled ?? false,
    liabilityMode: fc.liabilityMode ?? "premium",
    liabilityRatePct: fc.liabilityRatePct ?? 0.3,
    liabilityAnnualPremiumUF: fc.liabilityAnnualPremiumUF ?? 0,
    liabilityAllocationPct: fc.liabilityAllocationPct ?? 100,
    insurancePolicyUF: fc.insurancePolicyUF ?? null,
    liabilityDeductibleUF: fc.liabilityDeductibleUF ?? 0,
    ufValue: opts?.ufValue ?? null,
  });

  return fin.salePriceMonthly;
}
