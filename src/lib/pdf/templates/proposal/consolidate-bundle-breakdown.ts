/**
 * Consolida breakdowns de varias cotizaciones para el PDF de bundle.
 */
import type {
  PositionBreakdownItem,
  QuoteBreakdownData,
  ResourceBreakdownCategory,
  ResourceBreakdownItem,
} from "@/types/cpq-breakdown";

function sumNum(values: Array<number | undefined | null>): number {
  return values.reduce<number>((s, v) => s + (typeof v === "number" ? v : 0), 0);
}

function weightedMarginPct(parts: readonly QuoteBreakdownData[]): number {
  const sale = sumNum(parts.map((p) => p.totalSalePrice));
  if (sale <= 0) return parts[0]?.marginPct ?? 0;
  const weighted = parts.reduce(
    (s, p) => s + (p.marginPct || 0) * (p.totalSalePrice || 0),
    0,
  );
  return weighted / sale;
}

/** Suma montos y concatena posiciones de N breakdowns. */
export function consolidateQuoteBreakdowns(
  parts: readonly (QuoteBreakdownData | null | undefined)[],
): QuoteBreakdownData | undefined {
  const present = parts.filter((p): p is QuoteBreakdownData => Boolean(p));
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];

  const positions: PositionBreakdownItem[] = present.flatMap((p) => p.positions ?? []);
  const currency = present[0]!.currency;
  const ufValue = present.find((p) => p.ufValue != null)?.ufValue;
  const monthlyHoursStandard =
    present.find((p) => p.monthlyHoursStandard > 0)?.monthlyHoursStandard ?? 180;

  return {
    positions,
    totalLaborCost: sumNum(present.map((p) => p.totalLaborCost)),
    holidayAdjustment: sumNum(present.map((p) => p.holidayAdjustment)),
    uniforms: sumNum(present.map((p) => p.uniforms)),
    exams: sumNum(present.map((p) => p.exams)),
    meals: sumNum(present.map((p) => p.meals)),
    vehicles: sumNum(present.map((p) => p.vehicles)),
    infrastructure: sumNum(present.map((p) => p.infrastructure)),
    equipment: sumNum(present.map((p) => p.equipment)),
    transport: sumNum(present.map((p) => p.transport)),
    systems: sumNum(present.map((p) => p.systems)),
    other: sumNum(present.map((p) => p.other)),
    subtotalBase: sumNum(present.map((p) => p.subtotalBase)),
    marginPct: weightedMarginPct(present),
    marginAmount: sumNum(present.map((p) => p.marginAmount)),
    financial: sumNum(present.map((p) => p.financial)),
    financialRatePct: present[0]!.financialRatePct,
    policy: sumNum(present.map((p) => p.policy)),
    policyRatePct: present[0]!.policyRatePct,
    policyAdmin: sumNum(present.map((p) => p.policyAdmin)),
    liability: sumNum(present.map((p) => p.liability)),
    liabilityInsuredUF: sumNum(present.map((p) => p.liabilityInsuredUF ?? 0)) || null,
    effectiveMarginPct: weightedMarginPct(present),
    totalSalePrice: sumNum(present.map((p) => p.totalSalePrice)),
    additionalLines: sumNum(present.map((p) => p.additionalLines)),
    grandTotal: sumNum(present.map((p) => p.grandTotal)),
    monthlyHoursStandard,
    currency,
    ufValue,
  };
}

function mergeItems(
  items: readonly ResourceBreakdownItem[],
): ResourceBreakdownItem[] {
  const byKey = new Map<string, ResourceBreakdownItem>();
  for (const item of items) {
    const key = `${item.name}::${item.unit ?? ""}::${item.calcMode ?? ""}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...item });
      continue;
    }
    byKey.set(key, {
      ...prev,
      amount: prev.amount + item.amount,
      quantity:
        prev.quantity != null || item.quantity != null
          ? (prev.quantity ?? 0) + (item.quantity ?? 0)
          : undefined,
    });
  }
  return [...byKey.values()];
}

/** Fusiona resourceBreakdown por categoría, sumando ítems del mismo nombre. */
export function consolidateResourceBreakdowns(
  parts: readonly (readonly ResourceBreakdownCategory[] | null | undefined)[],
): ResourceBreakdownCategory[] | undefined {
  const present = parts.filter(
    (p): p is readonly ResourceBreakdownCategory[] => Array.isArray(p) && p.length > 0,
  );
  if (present.length === 0) return undefined;
  if (present.length === 1) return [...present[0]!];

  const byCategory = new Map<
    string,
    { category: string; categoryType: "direct" | "indirect"; items: ResourceBreakdownItem[] }
  >();

  for (const list of present) {
    for (const cat of list) {
      const key = `${cat.categoryType}::${cat.category}`;
      const prev = byCategory.get(key);
      if (!prev) {
        byCategory.set(key, {
          category: cat.category,
          categoryType: cat.categoryType,
          items: [...cat.items],
        });
      } else {
        prev.items.push(...cat.items);
      }
    }
  }

  return [...byCategory.values()].map((cat) => {
    const items = mergeItems(cat.items);
    return {
      category: cat.category,
      categoryType: cat.categoryType,
      items,
      subtotal: items.reduce((s, i) => s + i.amount, 0),
    };
  });
}
