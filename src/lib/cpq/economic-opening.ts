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
  serviceLines?: Array<{
    description: string;
    quantity: number;
    unitPriceClp: number;
    subtotalClp: number;
  }>;
  byInstallation?: Array<{
    name: string;
    guards: number;
    amountClp: number;
  }>;
  salariesByRole?: Array<{
    cargo: string;
    count: number;
    baseClp: number;
    gratificacionClp: number;
    colacionMovilizacionClp: number;
    leyesSocialesClp: number;
    costoEmpresaClp: number;
  }>;
};

type EconomicOpeningDetails = Pick<
  EconomicOpening,
  "serviceLines" | "byInstallation" | "salariesByRole"
>;

function pctOf(part: number, whole: number): number | null {
  if (!(whole > 0)) return 0;
  return (part / whole) * 100;
}

function serviceLinesFromBreakdown(
  positions: QuoteBreakdownData["positions"],
): NonNullable<EconomicOpening["serviceLines"]> {
  return positions.map((position) => {
    const quantity = Math.max(0, position.totalGuardsInPosition);
    return {
      description: position.name,
      quantity,
      unitPriceClp: quantity > 0 ? position.salePrice / quantity : position.salePrice,
      subtotalClp: position.salePrice,
    };
  });
}

function salariesFromBreakdown(
  positions: QuoteBreakdownData["positions"],
): NonNullable<EconomicOpening["salariesByRole"]> {
  type SalaryAccumulator = {
    cargo: string;
    count: number;
    baseClp: number;
    gratificacionClp: number;
    colacionMovilizacionClp: number;
    leyesSocialesClp: number;
    costoEmpresaClp: number;
  };

  const byRole = new Map<string, SalaryAccumulator>();
  for (const position of positions) {
    const cargo = position.cargoName?.trim() || position.name;
    const count = Math.max(0, position.totalGuardsInPosition);
    if (count === 0) continue;

    const current = byRole.get(cargo) ?? {
      cargo,
      count: 0,
      baseClp: 0,
      gratificacionClp: 0,
      colacionMovilizacionClp: 0,
      leyesSocialesClp: 0,
      costoEmpresaClp: 0,
    };
    current.count += count;
    current.baseClp += position.baseSalary;
    current.gratificacionClp += position.gratification;
    current.colacionMovilizacionClp +=
      (position.mealAllowance ?? 0) + (position.transportAllowance ?? 0);
    current.leyesSocialesClp +=
      position.sisEmployer +
      (position.pensionReformEmployer ?? 0) +
      position.afcEmployer +
      position.mutualEmployer;
    current.costoEmpresaClp += position.totalLaborCost;
    byRole.set(cargo, current);
  }

  return Array.from(byRole.values()).map((role) => ({
    cargo: role.cargo,
    count: role.count,
    baseClp: role.baseClp / role.count,
    gratificacionClp: role.gratificacionClp / role.count,
    colacionMovilizacionClp: role.colacionMovilizacionClp / role.count,
    leyesSocialesClp: role.leyesSocialesClp / role.count,
    costoEmpresaClp: role.costoEmpresaClp / role.count,
  }));
}

export function economicOpeningFromBreakdown(
  bd: QuoteBreakdownData | null | undefined,
  ufFallback = 0,
  details?: EconomicOpeningDetails,
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
    serviceLines: details?.serviceLines ?? serviceLinesFromBreakdown(bd?.positions ?? []),
    byInstallation: details?.byInstallation ?? [],
    salariesByRole: details?.salariesByRole ?? salariesFromBreakdown(bd?.positions ?? []),
  });
}

export function economicOpeningFromQuote(input: {
  breakdown?: QuoteBreakdownData | null;
  ufFallback?: number;
  serviceLines?: EconomicOpening["serviceLines"];
  installations?: EconomicOpening["byInstallation"];
}): EconomicOpening {
  return economicOpeningFromBreakdown(input.breakdown, input.ufFallback, {
    serviceLines: input.serviceLines,
    byInstallation: input.installations,
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
  opts?: {
    currency?: string;
    ufValue?: number;
    breakdown?: QuoteBreakdownData | null;
    serviceLines?: EconomicOpening["serviceLines"];
    byInstallation?: EconomicOpening["byInstallation"];
    salariesByRole?: EconomicOpening["salariesByRole"];
  },
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
    serviceLines:
      opts?.serviceLines ?? serviceLinesFromBreakdown(opts?.breakdown?.positions ?? []),
    byInstallation: opts?.byInstallation ?? [],
    salariesByRole:
      opts?.salariesByRole ?? salariesFromBreakdown(opts?.breakdown?.positions ?? []),
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
  serviceLines?: EconomicOpening["serviceLines"];
  byInstallation?: EconomicOpening["byInstallation"];
  salariesByRole?: EconomicOpening["salariesByRole"];
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
    serviceLines: p.serviceLines ?? [],
    byInstallation: p.byInstallation ?? [],
    salariesByRole: p.salariesByRole ?? [],
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
