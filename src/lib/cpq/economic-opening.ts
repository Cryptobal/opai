/**
 * Apertura económica de la propuesta (oferta_economica).
 * Se resuelve en cada preview/PDF desde el costeo vigente; no se persiste.
 */
import { clpToUf } from "@/lib/uf-utils";
import type {
  QuoteBreakdownData,
  ResourceBreakdownCategory,
} from "@/types/cpq-breakdown";

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

export type EconomicOpeningLine = {
  label: string;
  amountClp: number;
  quantity?: number;
};

export type EconomicOpeningSalaryComponent = {
  label: string;
  amountClp: number;
};

export type EconomicOpeningSalary = {
  cargo: string;
  count: number;
  /** Componentes presentes en el snapshot (sin ceros de relleno). Montos por persona/mes. */
  components: EconomicOpeningSalaryComponent[];
  costoEmpresaClp: number;
  /** @deprecated Agregados legacy — preferir `components`. */
  baseClp: number;
  gratificacionClp: number;
  colacionMovilizacionClp: number;
  leyesSocialesClp: number;
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
  salariesByRole?: EconomicOpeningSalary[];
  directLines?: EconomicOpeningLine[];
  indirectLines?: EconomicOpeningLine[];
};

type EconomicOpeningDetails = Pick<
  EconomicOpening,
  "serviceLines" | "byInstallation" | "salariesByRole" | "directLines" | "indirectLines"
>;

function pctOf(part: number, whole: number): number | null {
  if (!(whole > 0)) return 0;
  return (part / whole) * 100;
}

function perPerson(total: number, count: number): number {
  if (!(count > 0)) return 0;
  return total / count;
}

function pushComponent(
  list: EconomicOpeningSalaryComponent[],
  label: string,
  amountClp: number,
) {
  if (!(amountClp > 0)) return;
  list.push({ label, amountClp });
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
    gratificationClp: number;
    mealClp: number;
    transportClp: number;
    sisClp: number;
    pensionReformClp: number;
    afcClp: number;
    mutualClp: number;
    vacationClp: number;
    severanceClp: number;
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
      gratificationClp: 0,
      mealClp: 0,
      transportClp: 0,
      sisClp: 0,
      pensionReformClp: 0,
      afcClp: 0,
      mutualClp: 0,
      vacationClp: 0,
      severanceClp: 0,
      costoEmpresaClp: 0,
    };
    current.count += count;
    current.baseClp += position.baseSalary;
    current.gratificationClp += position.gratification;
    current.mealClp += position.mealAllowance ?? 0;
    current.transportClp += position.transportAllowance ?? 0;
    current.sisClp += position.sisEmployer;
    current.pensionReformClp += position.pensionReformEmployer ?? 0;
    current.afcClp += position.afcEmployer;
    current.mutualClp += position.mutualEmployer;
    current.vacationClp += position.vacationProvision;
    current.severanceClp += position.severanceProvision;
    current.costoEmpresaClp += position.totalLaborCost;
    byRole.set(cargo, current);
  }

  return Array.from(byRole.values()).map((role) => {
    const n = role.count;
    const components: EconomicOpeningSalaryComponent[] = [];
    pushComponent(components, "Sueldo base", perPerson(role.baseClp, n));
    pushComponent(components, "Gratificación legal", perPerson(role.gratificationClp, n));
    pushComponent(components, "Colación", perPerson(role.mealClp, n));
    pushComponent(components, "Movilización", perPerson(role.transportClp, n));
    pushComponent(components, "SIS (empleador)", perPerson(role.sisClp, n));
    pushComponent(components, "Reforma previsional (empleador)", perPerson(role.pensionReformClp, n));
    pushComponent(components, "AFC (empleador)", perPerson(role.afcClp, n));
    pushComponent(components, "Mutual", perPerson(role.mutualClp, n));
    pushComponent(components, "Provisión vacaciones", perPerson(role.vacationClp, n));
    pushComponent(components, "Provisión indemnización", perPerson(role.severanceClp, n));

    return {
      cargo: role.cargo,
      count: role.count,
      components,
      costoEmpresaClp: perPerson(role.costoEmpresaClp, n),
      baseClp: perPerson(role.baseClp, n),
      gratificacionClp: perPerson(role.gratificationClp, n),
      colacionMovilizacionClp: perPerson(role.mealClp + role.transportClp, n),
      leyesSocialesClp: perPerson(
        role.sisClp + role.pensionReformClp + role.afcClp + role.mutualClp,
        n,
      ),
    };
  });
}

function linesFromResourceCategories(
  categories: readonly ResourceBreakdownCategory[] | undefined,
  type: "direct" | "indirect",
): EconomicOpeningLine[] {
  if (!categories?.length) return [];
  const lines: EconomicOpeningLine[] = [];
  for (const category of categories) {
    if (category.categoryType !== type) continue;
    for (const item of category.items) {
      if (!(item.amount > 0)) continue;
      lines.push({
        label: item.name,
        amountClp: item.amount,
        quantity: item.quantity,
      });
    }
  }
  return lines;
}

function directLinesFromBreakdown(
  bd: QuoteBreakdownData,
  resourceBreakdown?: readonly ResourceBreakdownCategory[],
): EconomicOpeningLine[] {
  const fromResources = linesFromResourceCategories(resourceBreakdown, "direct");
  if (fromResources.length > 0) return fromResources;

  const lines: EconomicOpeningLine[] = [];
  const push = (label: string, amountClp: number) => {
    if (amountClp > 0) lines.push({ label, amountClp });
  };
  push("Ajuste festivos", bd.holidayAdjustment ?? 0);
  push("Uniformes", bd.uniforms ?? 0);
  push("Exámenes", bd.exams ?? 0);
  push("Colación / alimentación", bd.meals ?? 0);
  return lines;
}

function indirectLinesFromBreakdown(
  bd: QuoteBreakdownData,
  resourceBreakdown?: readonly ResourceBreakdownCategory[],
): EconomicOpeningLine[] {
  const fromResources = linesFromResourceCategories(resourceBreakdown, "indirect");
  if (fromResources.length > 0) return fromResources;

  const lines: EconomicOpeningLine[] = [];
  const push = (label: string, amountClp: number) => {
    if (amountClp > 0) lines.push({ label, amountClp });
  };
  push("Equipamiento", bd.equipment ?? 0);
  push("Traslados", bd.transport ?? 0);
  push("Vehículos", bd.vehicles ?? 0);
  push("Infraestructura", bd.infrastructure ?? 0);
  push("Sistemas", bd.systems ?? 0);
  push("Otros", bd.other ?? 0);
  return lines;
}

export function economicOpeningFromBreakdown(
  bd: QuoteBreakdownData | null | undefined,
  ufFallback = 0,
  details?: EconomicOpeningDetails & {
    resourceBreakdown?: readonly ResourceBreakdownCategory[];
  },
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
    directLines:
      details?.directLines ??
      (bd ? directLinesFromBreakdown(bd, details?.resourceBreakdown) : []),
    indirectLines:
      details?.indirectLines ??
      (bd ? indirectLinesFromBreakdown(bd, details?.resourceBreakdown) : []),
  });
}

export function economicOpeningFromQuote(input: {
  breakdown?: QuoteBreakdownData | null;
  ufFallback?: number;
  serviceLines?: EconomicOpening["serviceLines"];
  installations?: EconomicOpening["byInstallation"];
  resourceBreakdown?: readonly ResourceBreakdownCategory[];
}): EconomicOpening {
  return economicOpeningFromBreakdown(input.breakdown, input.ufFallback, {
    serviceLines: input.serviceLines,
    byInstallation: input.installations,
    resourceBreakdown: input.resourceBreakdown,
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
    directLines?: EconomicOpening["directLines"];
    indirectLines?: EconomicOpening["indirectLines"];
    resourceBreakdown?: readonly ResourceBreakdownCategory[];
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

  const syntheticBd: QuoteBreakdownData | null = opts?.breakdown
    ? opts.breakdown
    : s
      ? {
          positions: [],
          totalLaborCost: labor,
          holidayAdjustment: s.monthlyHolidayAdjustment ?? 0,
          uniforms: s.monthlyUniforms ?? 0,
          exams: s.monthlyExams ?? 0,
          meals: s.monthlyMeals ?? 0,
          vehicles: s.monthlyVehicles ?? 0,
          infrastructure: s.monthlyInfrastructure ?? 0,
          equipment: 0,
          transport: 0,
          systems: 0,
          other: s.monthlyCostItems ?? 0,
          subtotalBase: costs,
          marginPct: s.marginPct ?? 0,
          marginAmount: margin,
          financial: 0,
          financialRatePct: 0,
          policy: 0,
          policyRatePct: 0,
          totalSalePrice: sale,
          additionalLines: 0,
          grandTotal: sale,
          monthlyHoursStandard: 180,
          currency: opts?.currency ?? "CLP",
          ufValue: opts?.ufValue,
        }
      : null;

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
    directLines:
      opts?.directLines ??
      (syntheticBd
        ? directLinesFromBreakdown(syntheticBd, opts?.resourceBreakdown)
        : []),
    indirectLines:
      opts?.indirectLines ??
      (syntheticBd
        ? indirectLinesFromBreakdown(syntheticBd, opts?.resourceBreakdown)
        : []),
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
  directLines?: EconomicOpening["directLines"];
  indirectLines?: EconomicOpening["indirectLines"];
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
    directLines: p.directLines ?? [],
    indirectLines: p.indirectLines ?? [],
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

export function sumOpeningLines(lines: readonly EconomicOpeningLine[] | undefined): number {
  return (lines ?? []).reduce((sum, line) => sum + line.amountClp, 0);
}
