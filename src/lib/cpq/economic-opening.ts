/**
 * Apertura económica de la propuesta (oferta_economica).
 * Se resuelve en cada preview/PDF desde el costeo vigente; no se persiste.
 * Incluye: estructura del precio, cotización por servicio, por instalación
 * y sueldos por cargo (payrollSnapshot / PositionBreakdownItem).
 */
import { clpToUf } from "@/lib/uf-utils";
import type { QuoteBreakdownData, PositionBreakdownItem } from "@/types/cpq-breakdown";

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

/** Línea de cotización por servicio / puesto. */
export type EconomicServiceLine = {
  name: string;
  guards: number;
  puestos: number;
  saleClp: number;
  laborClp: number;
};

/** Apertura agregada por instalación. */
export type EconomicInstallationLine = {
  name: string;
  saleClp: number;
  laborClp: number;
  positions: number;
};

/** Apertura de sueldos por cargo (desde payroll / breakdown). */
export type EconomicSalaryByCargo = {
  cargo: string;
  guards: number;
  baseSalary: number;
  gratification: number;
  /** Colación + movilización asignadas (si hay). */
  allowances: number;
  socialLaws: number;
  employerCost: number;
};

export type EconomicOpening = {
  rows: EconomicOpeningRow[];
  note: string;
  currency: string;
  ufValue: number;
  services: EconomicServiceLine[];
  installations: EconomicInstallationLine[];
  salariesByCargo: EconomicSalaryByCargo[];
};

function pctOf(part: number, whole: number): number | null {
  if (!(whole > 0)) return 0;
  return (part / whole) * 100;
}

function emptyExtras(): Pick<EconomicOpening, "services" | "installations" | "salariesByCargo"> {
  return { services: [], installations: [], salariesByCargo: [] };
}

function socialLawsOf(p: PositionBreakdownItem): number {
  return (
    (p.sisEmployer ?? 0) +
    (p.pensionReformEmployer ?? 0) +
    (p.afcEmployer ?? 0) +
    (p.mutualEmployer ?? 0) +
    (p.vacationProvision ?? 0) +
    (p.severanceProvision ?? 0)
  );
}

/**
 * Extrae bloques de apertura completa desde el breakdown (sin I/O).
 * Reutiliza PositionBreakdownItem que ya arma build-quotation-props.
 */
export function enrichOpeningFromBreakdown(
  base: Omit<EconomicOpening, "services" | "installations" | "salariesByCargo">,
  bd: QuoteBreakdownData | null | undefined,
  opts?: {
    installationName?: string | null;
    /** Total colación+movilización a repartir proporcional a guardias. */
    allowancesTotal?: number;
  },
): EconomicOpening {
  const positions = bd?.positions ?? [];
  const totalGuards = positions.reduce((s, p) => s + p.totalGuardsInPosition, 0) || 1;
  const allowancesTotal = opts?.allowancesTotal ?? bd?.meals ?? 0;

  const services: EconomicServiceLine[] = positions.map((p) => ({
    name: p.name,
    guards: p.numGuards,
    puestos: p.numPuestos,
    saleClp: p.salePrice,
    laborClp: p.totalLaborCost,
  }));

  const instName = opts?.installationName?.trim() || "Instalación cotizada";
  const installations: EconomicInstallationLine[] =
    positions.length === 0
      ? []
      : [
          {
            name: instName,
            saleClp: positions.reduce((s, p) => s + p.salePrice, 0),
            laborClp: positions.reduce((s, p) => s + p.totalLaborCost, 0),
            positions: positions.length,
          },
        ];

  // Agrupar por nombre de puesto/cargo
  const byCargo = new Map<string, EconomicSalaryByCargo>();
  for (const p of positions) {
    const key = p.name || "Cargo";
    const prev = byCargo.get(key);
    const allow =
      totalGuards > 0 ? (allowancesTotal * p.totalGuardsInPosition) / totalGuards : 0;
    if (prev) {
      prev.guards += p.totalGuardsInPosition;
      prev.baseSalary += p.baseSalary;
      prev.gratification += p.gratification;
      prev.allowances += allow;
      prev.socialLaws += socialLawsOf(p);
      prev.employerCost += p.totalLaborCost;
    } else {
      byCargo.set(key, {
        cargo: key,
        guards: p.totalGuardsInPosition,
        baseSalary: p.baseSalary,
        gratification: p.gratification,
        allowances: allow,
        socialLaws: socialLawsOf(p),
        employerCost: p.totalLaborCost,
      });
    }
  }

  return {
    ...base,
    services,
    installations,
    salariesByCargo: [...byCargo.values()],
  };
}

export function economicOpeningFromBreakdown(
  bd: QuoteBreakdownData | null | undefined,
  ufFallback = 0,
  opts?: { installationName?: string | null },
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

  const base = fromParts({
    labor,
    direct,
    indirect,
    margin,
    marginPct: bd?.marginPct,
    sale,
    currency: bd?.currency ?? "CLP",
    ufValue,
  });

  return enrichOpeningFromBreakdown(base, bd, {
    installationName: opts?.installationName,
    allowancesTotal: bd?.meals ?? 0,
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
  opts?: { currency?: string; ufValue?: number; installationName?: string | null },
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
  const base = fromParts({
    labor,
    direct,
    indirect,
    margin,
    marginPct: s?.marginPct,
    sale,
    currency: opts?.currency ?? "CLP",
    ufValue: opts?.ufValue ?? 0,
  });
  return {
    ...base,
    ...emptyExtras(),
    installations: sale > 0
      ? [
          {
            name: opts?.installationName?.trim() || "Instalación cotizada",
            saleClp: sale,
            laborClp: labor,
            positions: 0,
          },
        ]
      : [],
  };
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
}): Omit<EconomicOpening, "services" | "installations" | "salariesByCargo"> {
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
