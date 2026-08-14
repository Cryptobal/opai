/**
 * Apertura económica de la propuesta (oferta_economica).
 * Se resuelve en cada preview/PDF desde el costeo vigente; no se persiste.
 */
import { clpToUf } from "@/lib/uf-utils";
import type { QuoteBreakdownData } from "@/types/cpq-breakdown";

export const ECONOMIC_OPENING_NOTE = "Valores netos; IVA según ley vigente";
export const ECONOMIC_OPENING_TITLE = "Oferta económica — apertura completa";

export type EconomicOpeningRowKey = "labor" | "direct" | "indirect" | "margin" | "sale";

export type EconomicOpeningRow = {
  key: EconomicOpeningRowKey;
  label: string;
  amountClp: number;
  pct: number | null;
  highlight?: boolean;
};

export type EconomicOpening = {
  rows: EconomicOpeningRow[];
  note: string;
  currency: string;
  ufValue: number;
};

function pctOf(part: number, whole: number): number | null {
  if (!(whole > 0)) return 0;
  return (part / whole) * 100;
}

export function economicOpeningFromBreakdown(
  bd: QuoteBreakdownData | null | undefined,
  ufFallback = 0,
): EconomicOpening {
  const labor = bd?.totalLaborCost ?? 0;
  const direct =
    (bd?.holidayAdjustment ?? 0) +
    (bd?.uniforms ?? 0) +
    (bd?.exams ?? 0) +
    (bd?.meals ?? 0);
  const indirect =
    (bd?.equipment ?? 0) +
    (bd?.transport ?? 0) +
    (bd?.vehicles ?? 0) +
    (bd?.infrastructure ?? 0) +
    (bd?.systems ?? 0) +
    (bd?.other ?? 0);
  const margin = bd?.marginAmount ?? 0;
  const sale = bd?.grandTotal ?? 0;
  const ufValue = bd?.ufValue && bd.ufValue > 0 ? bd.ufValue : ufFallback;

  return fromParts({
    labor,
    direct,
    indirect,
    margin,
    marginPct: bd?.marginPct,
    sale,
    currency: bd?.currency ?? "CLP",
    ufValue,
  });
}

/** Vista previa desde el summary de costeo (mismos buckets que Desglose). */
export function economicOpeningFromCostSummary(
  s: {
    monthlyPositions?: number;
    monthlyHolidayAdjustment?: number;
    monthlyUniforms?: number;
    monthlyExams?: number;
    monthlyMeals?: number;
    monthlyVehicles?: number;
    monthlyInfrastructure?: number;
    monthlyCostItems?: number;
    salePriceMonthly?: number;
    marginPct?: number;
  } | null | undefined,
  opts?: { currency?: string; ufValue?: number },
): EconomicOpening {
  const labor = s?.monthlyPositions ?? 0;
  const direct =
    (s?.monthlyHolidayAdjustment ?? 0) +
    (s?.monthlyUniforms ?? 0) +
    (s?.monthlyExams ?? 0) +
    (s?.monthlyMeals ?? 0);
  const indirect =
    (s?.monthlyVehicles ?? 0) +
    (s?.monthlyInfrastructure ?? 0) +
    (s?.monthlyCostItems ?? 0);
  const sale = s?.salePriceMonthly ?? 0;
  const costs = labor + direct + indirect;
  const margin = Math.max(0, sale - costs);
  return fromParts({
    labor,
    direct,
    indirect,
    margin,
    marginPct: s?.marginPct,
    sale,
    currency: opts?.currency ?? "CLP",
    ufValue: opts?.ufValue ?? 0,
  });
}

function fromParts(p: {
  labor: number;
  direct: number;
  indirect: number;
  margin: number;
  marginPct?: number;
  sale: number;
  currency: string;
  ufValue: number;
}): EconomicOpening {
  return {
    rows: [
      { key: "labor", label: "Mano de obra", amountClp: p.labor, pct: pctOf(p.labor, p.sale) },
      { key: "direct", label: "Costos directos", amountClp: p.direct, pct: pctOf(p.direct, p.sale) },
      { key: "indirect", label: "Costos indirectos", amountClp: p.indirect, pct: pctOf(p.indirect, p.sale) },
      {
        key: "margin",
        label: "Margen comercial",
        amountClp: p.margin,
        pct: p.marginPct ?? pctOf(p.margin, p.sale),
      },
      {
        key: "sale",
        label: "Precio venta mensual neto",
        amountClp: p.sale,
        pct: null,
        highlight: true,
      },
    ],
    note: ECONOMIC_OPENING_NOTE,
    currency: p.currency,
    ufValue: p.ufValue,
  };
}

export function formatOpeningClp(clp: number): string {
  return `$${Math.round(clp).toLocaleString("es-CL")}`;
}

export function formatOpeningUf(clp: number, ufValue: number): string {
  if (!(ufValue > 0)) return "—";
  const uf = clpToUf(clp, ufValue);
  return `${new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(uf)} UF`;
}

export function formatOpeningPct(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(pct)}%`;
}

/** UF es columna primaria cuando la cotización se expresa en UF. */
export function openingAmountColumns(currency: string): ["uf" | "clp", "uf" | "clp"] {
  return currency === "UF" ? ["uf", "clp"] : ["clp", "uf"];
}
