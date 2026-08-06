/**
 * Cálculo puro de costo financiero, póliza de garantía y responsabilidad civil.
 * Fuente de verdad compartida por el motor CPQ y el espejo del lead.
 *
 * Auto (gross-up cerrado):
 *   kG = pG × (Mg × rG / 12 + eG)
 *   k  = f + kG
 *   S  = (B + RC + Gfijo) / (1 − k)   si 0 ≤ k < 0.35
 *   S  = (B + RC + Gfijo) × (1 + k)   si k ≥ 0.35 (guarda)
 *
 * Manual: equivalencia con el motor histórico (sin gross-up).
 */

export type FinancialBaseMode = "auto" | "manual";
export type PolicyAmountMode = "pct" | "fija";
export type LiabilityMode = "premium" | "rate";

export interface FinancialPolicyInput {
  baseWithMargin: number;
  additionalLinesTotalWithMargin: number;
  /** Solo para margen efectivo; no entra al gross-up. */
  costsBase?: number;
  additionalLinesTotalBase?: number;

  financialEnabled: boolean;
  financialRatePct: number;
  financialBaseMode: FinancialBaseMode;
  salePriceBase: number;

  policyEnabled: boolean;
  policyAmountMode: PolicyAmountMode;
  policyContractMonths: number;
  policyContractPct: number;
  policyRatePct: number;
  policyAdminRatePct: number;
  policyFixedAmountUF: number;

  liabilityEnabled: boolean;
  liabilityMode: LiabilityMode;
  liabilityRatePct: number;
  liabilityAnnualPremiumUF: number;
  liabilityAllocationPct: number;
  insurancePolicyUF: number | null;
  liabilityDeductibleUF?: number;

  ufValue: number | null;
}

export interface FinancialPolicyResult {
  salePriceMonthly: number;
  monthlyFinancial: number;
  monthlyPolicy: number;
  monthlyPolicyAdmin: number;
  monthlyLiability: number;
  policyGuaranteedAmount: number;
  annualPremiumCLP: number;
  grossUpApplied: boolean;
  grossUpFactor: number;
  k: number;
  effectiveMarginPct: number;
  missingUf: boolean;
  warnings: string[];
}

function safeNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clampDivisor(months: number): number {
  return months > 0 ? months : 1;
}

function roundFinal(v: number): number {
  return Math.round(v);
}

export function computeFinancialAndPolicy(
  input: FinancialPolicyInput,
): FinancialPolicyResult {
  const warnings: string[] = [];
  const baseWithMargin = Math.max(0, safeNum(input.baseWithMargin));
  const addlWithMargin = Math.max(0, safeNum(input.additionalLinesTotalWithMargin));
  const B = baseWithMargin + addlWithMargin;

  const f = input.financialEnabled
    ? Math.max(0, safeNum(input.financialRatePct)) / 100
    : 0;

  const Mg = clampDivisor(safeNum(input.policyContractMonths));
  const pG = input.policyEnabled
    ? Math.max(0, safeNum(input.policyContractPct)) / 100
    : 0;
  const rG = input.policyEnabled
    ? Math.max(0, safeNum(input.policyRatePct)) / 100
    : 0;
  const eG = input.policyEnabled
    ? Math.max(0, safeNum(input.policyAdminRatePct)) / 100
    : 0;

  const uf = safeNum(input.ufValue);
  const needsUf =
    (input.policyEnabled && input.policyAmountMode === "fija") ||
    (input.liabilityEnabled &&
      (input.liabilityMode === "premium" || input.liabilityMode === "rate"));
  const missingUf = needsUf && uf <= 0;

  // ── Responsabilidad civil (independiente de S) ──
  let monthlyLiability = 0;
  let annualPremiumCLP = 0;
  if (input.liabilityEnabled && !missingUf) {
    const alloc = Math.max(0, safeNum(input.liabilityAllocationPct)) / 100;
    if (input.liabilityMode === "premium") {
      annualPremiumCLP =
        Math.max(0, safeNum(input.liabilityAnnualPremiumUF)) * uf;
    } else {
      const insured = safeNum(input.insurancePolicyUF);
      if (insured > 0) {
        annualPremiumCLP =
          insured * uf * (Math.max(0, safeNum(input.liabilityRatePct)) / 100);
      }
    }
    monthlyLiability = (annualPremiumCLP * alloc) / 12;
  } else if (input.liabilityEnabled && missingUf) {
    warnings.push("falta valor UF");
  }

  // ── Garantía modo fija (independiente de S) ──
  let Gfijo = 0;
  let fixedGuaranteedCLP = 0;
  let monthlyPolicyFixed = 0;
  let monthlyPolicyAdminFixed = 0;
  if (
    input.policyEnabled &&
    input.policyAmountMode === "fija" &&
    !missingUf
  ) {
    fixedGuaranteedCLP = Math.max(0, safeNum(input.policyFixedAmountUF)) * uf;
    monthlyPolicyFixed = (fixedGuaranteedCLP * rG) / 12;
    monthlyPolicyAdminFixed = (fixedGuaranteedCLP * eG) / Mg;
    Gfijo = monthlyPolicyFixed + monthlyPolicyAdminFixed;
  } else if (
    input.policyEnabled &&
    input.policyAmountMode === "fija" &&
    missingUf
  ) {
    warnings.push("falta valor UF");
  }

  const mode: FinancialBaseMode =
    input.financialBaseMode === "manual" ? "manual" : "auto";

  // ── Modo manual: equivalencia exacta con el motor histórico ──
  if (mode === "manual") {
    const salePriceBase = Math.max(0, safeNum(input.salePriceBase));
    const effectiveBase = salePriceBase > 0 ? salePriceBase : baseWithMargin;

    const monthlyFinancial =
      input.financialEnabled && effectiveBase > 0 ? effectiveBase * f : 0;

    let monthlyPolicy = 0;
    let monthlyPolicyAdmin = 0;
    let policyGuaranteedAmount = 0;

    if (input.policyEnabled && effectiveBase > 0) {
      if (input.policyAmountMode === "fija") {
        monthlyPolicy = monthlyPolicyFixed;
        monthlyPolicyAdmin = monthlyPolicyAdminFixed;
        policyGuaranteedAmount = fixedGuaranteedCLP;
      } else {
        policyGuaranteedAmount = effectiveBase * Mg * pG;
        monthlyPolicy = (policyGuaranteedAmount * rG) / 12;
        monthlyPolicyAdmin = policyGuaranteedAmount * eG / Mg;
        // Histórico: admin no se sumaba. Para no-regresión con admin=0 es idéntico.
        // Con admin>0 en manual, lo sumamos prorrateado (misma semántica que auto).
      }
    }

    const salePriceMonthly = roundFinal(
      baseWithMargin +
        monthlyFinancial +
        monthlyPolicy +
        monthlyPolicyAdmin +
        monthlyLiability +
        addlWithMargin,
    );

    const costsBase = Math.max(0, safeNum(input.costsBase ?? 0));
    const addlBase = Math.max(0, safeNum(input.additionalLinesTotalBase ?? 0));
    const instrumentCosts =
      monthlyFinancial + monthlyPolicy + monthlyPolicyAdmin + monthlyLiability;
    const effectiveMarginPct =
      salePriceMonthly > 0
        ? ((salePriceMonthly - costsBase - addlBase - instrumentCosts) /
            salePriceMonthly) *
          100
        : 0;

    return {
      salePriceMonthly,
      monthlyFinancial,
      monthlyPolicy,
      monthlyPolicyAdmin,
      monthlyLiability,
      policyGuaranteedAmount,
      annualPremiumCLP,
      grossUpApplied: false,
      grossUpFactor: 1,
      k: f + (input.policyAmountMode === "pct" ? pG * ((Mg * rG) / 12 + eG) : 0),
      effectiveMarginPct,
      missingUf,
      warnings: [...new Set(warnings)],
    };
  }

  // ── Modo auto: gross-up cerrado ──
  const kG =
    input.policyEnabled && input.policyAmountMode === "pct"
      ? pG * ((Mg * rG) / 12 + eG)
      : 0;
  const k = f + kG;

  let grossUpApplied = false;
  let S: number;

  if (k >= 0.35 || k < 0) {
    S = (B + monthlyLiability + Gfijo) * (1 + Math.max(0, k));
    grossUpApplied = false;
    warnings.push(
      `Las tasas suman ${(k * 100).toFixed(1)}% del precio. Sobre 35% no se aplica el cálculo cerrado: se estima de forma directa y el resultado queda subvalorado.`,
    );
  } else {
    S = (B + monthlyLiability + Gfijo) / (1 - k);
    grossUpApplied = k > 0;
  }

  const monthlyFinancial = S * f;
  let monthlyPolicy = 0;
  let monthlyPolicyAdmin = 0;
  let policyGuaranteedAmount = 0;

  if (input.policyEnabled) {
    if (input.policyAmountMode === "fija") {
      monthlyPolicy = monthlyPolicyFixed;
      monthlyPolicyAdmin = monthlyPolicyAdminFixed;
      policyGuaranteedAmount = fixedGuaranteedCLP;
    } else {
      policyGuaranteedAmount = S * pG * Mg;
      monthlyPolicy = (policyGuaranteedAmount * rG) / 12;
      monthlyPolicyAdmin = S * pG * eG;
    }
  }

  const salePriceMonthly = roundFinal(S);

  const costsBase = Math.max(0, safeNum(input.costsBase ?? 0));
  const addlBase = Math.max(0, safeNum(input.additionalLinesTotalBase ?? 0));
  const instrumentCosts =
    monthlyFinancial + monthlyPolicy + monthlyPolicyAdmin + monthlyLiability;
  const effectiveMarginPct =
    salePriceMonthly > 0
      ? ((salePriceMonthly - costsBase - addlBase - instrumentCosts) /
          salePriceMonthly) *
        100
      : 0;

  return {
    salePriceMonthly,
    monthlyFinancial,
    monthlyPolicy,
    monthlyPolicyAdmin,
    monthlyLiability,
    policyGuaranteedAmount,
    annualPremiumCLP,
    grossUpApplied,
    grossUpFactor: k > 0 && k < 0.35 ? 1 / (1 - k) : 1 + Math.max(0, k),
    k,
    effectiveMarginPct,
    missingUf,
    warnings: [...new Set(warnings)],
  };
}
