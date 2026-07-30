/**
 * Agregación pura de totales consolidados de un proposal bundle.
 * Fuente de verdad: cotizaciones miembro (no materializa montos en el bundle).
 */

export type BundleQuoteTotalsInput = {
  quoteId: string;
  includedInProposal: boolean;
  monthlyCost: number;
  totalGuards: number;
  totalPositions: number;
  marginPct: number | null;
  currency: string;
  installationName?: string | null;
};

export type BundleTotals = {
  totalMonthly: number;
  totalGuards: number;
  totalPositions: number;
  /** Margen ponderado por monthlyCost (0–100). null si no hay base. */
  weightedMarginPct: number | null;
  includedCount: number;
  installationCount: number;
  currency: string;
  byQuote: Array<{
    quoteId: string;
    monthlyCost: number;
    totalGuards: number;
    totalPositions: number;
    marginPct: number | null;
    includedInProposal: boolean;
    installationName: string | null;
  }>;
};

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Consolida totales solo de cotizaciones con `includedInProposal`.
 * Moneda: la del primer miembro incluido (caller debe validar moneda única).
 */
export function computeBundleTotals(
  quotes: BundleQuoteTotalsInput[],
): BundleTotals {
  const byQuote = quotes.map((q) => ({
    quoteId: q.quoteId,
    monthlyCost: toNum(q.monthlyCost),
    totalGuards: Math.max(0, Math.round(toNum(q.totalGuards))),
    totalPositions: Math.max(0, Math.round(toNum(q.totalPositions))),
    marginPct: q.marginPct == null ? null : toNum(q.marginPct),
    includedInProposal: Boolean(q.includedInProposal),
    installationName: q.installationName ?? null,
  }));

  const included = byQuote.filter((q) => q.includedInProposal);
  let totalMonthly = 0;
  let totalGuards = 0;
  let totalPositions = 0;
  let marginWeightSum = 0;
  let marginBase = 0;

  for (const q of included) {
    totalMonthly += q.monthlyCost;
    totalGuards += q.totalGuards;
    totalPositions += q.totalPositions;
    if (q.marginPct != null && q.monthlyCost > 0) {
      marginWeightSum += q.monthlyCost * q.marginPct;
      marginBase += q.monthlyCost;
    }
  }

  const firstIncluded = quotes.find((q) => q.includedInProposal);
  const currency =
    firstIncluded?.currency || quotes[0]?.currency || "UF";

  return {
    totalMonthly,
    totalGuards,
    totalPositions,
    weightedMarginPct:
      marginBase > 0 ? marginWeightSum / marginBase : null,
    includedCount: included.length,
    installationCount: quotes.length,
    currency,
    byQuote,
  };
}

/** Campos de condiciones comerciales sincronizables entre cotizaciones. */
export const SYNCABLE_CONDITION_FIELDS = [
  "paymentTerms",
  "serviceStartDays",
  "contractDuration",
  "isOngoingService",
  "adjustmentType",
  "adjustmentFreq",
  "ipcWeight",
  "imoWeight",
  "realAnnualIncrement",
  "paymentDays",
  "paymentDayMode",
  "insurancePolicyUF",
  "liabilityMonths",
  "validUntil",
  "currency",
] as const;

export type SyncableConditionField =
  (typeof SYNCABLE_CONDITION_FIELDS)[number];

export type ConditionsSnapshot = Partial<
  Record<SyncableConditionField, unknown>
>;

/**
 * Compara condiciones de las cotizaciones contra la referencia (primera).
 * Retorna true si todas coinciden en los campos sincronizables presentes.
 */
export function conditionsAreSynced(
  reference: ConditionsSnapshot,
  others: ConditionsSnapshot[],
): boolean {
  if (others.length === 0) return true;
  for (const other of others) {
    for (const field of SYNCABLE_CONDITION_FIELDS) {
      const a = normalizeConditionValue(reference[field]);
      const b = normalizeConditionValue(other[field]);
      if (a !== b) return false;
    }
  }
  return true;
}

function normalizeConditionValue(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v !== null && "toISOString" in v) {
    try {
      return String((v as Date).toISOString()).slice(0, 10);
    } catch {
      return String(v);
    }
  }
  if (typeof v === "object" && v !== null && "toString" in v) {
    // Decimal-like
    const s = String(v);
    if (s !== "[object Object]") return s;
  }
  return String(v);
}
