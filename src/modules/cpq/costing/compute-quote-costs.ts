import { prisma } from "@/lib/prisma";
import { isDefaultUniform } from "@/lib/cpq-constants";
import { hydrateQuoteCatalogLines } from "@/lib/cpq/resolve-active-catalog-item";
import { getUfValue } from "@/lib/uf";
import { syncContractItemForQuote } from "@/modules/finance/cashflow/generators/sales-contract-sync";
import type {
  AdditionalLineDetail,
  CostByCategory,
} from "@/types/cpq";
import {
  computeFinancialAndPolicy,
  type FinancialBaseMode,
  type LiabilityMode,
  type PolicyAmountMode,
} from "./financial-policy";

interface QuoteCostSummary {
  totalGuards: number;
  monthlyPositions: number;
  monthlyHolidayAdjustment: number;
  monthlyUniforms: number;
  monthlyExams: number;
  monthlyMeals: number;
  monthlyVehicles: number;
  monthlyInfrastructure: number;
  monthlyCostItems: number;
  costsBase: number;
  baseWithMargin: number;
  monthlyFinancial: number;
  monthlyPolicy: number;
  monthlyPolicyAdmin: number;
  monthlyLiability: number;
  policyGuaranteedAmount: number;
  grossUpApplied: boolean;
  grossUpFactor: number;
  effectiveMarginPct: number;
  missingUf: boolean;
  financialWarnings: string[];
  monthlyExtras: number;
  monthlyTotal: number;
  financialRatePct?: number;
  policyRatePct?: number;
  additionalLinesDetails: AdditionalLineDetail[];
  additionalLinesTotalBase: number;
  additionalLinesTotalWithMargin: number;
  additionalLinesOneTimeBase: number;
  additionalLinesOneTimeWithMargin: number;
  costsByCategory: CostByCategory[];
  marginMode: string;
  laborCost: number;
  salePriceMonthly: number;
}

const safeNumber = (value: unknown) => Number(value || 0);
const normalizeUnitPrice = (value: number, unit?: string | null, contractMonths?: number) => {
  if (!unit) return value;
  const normalized = unit.toLowerCase();
  if (normalized.includes("contrato") || normalized.includes("contract")) {
    const months = contractMonths && contractMonths > 0 ? contractMonths : 12;
    return value / months;
  }
  if (normalized.includes("año") || normalized.includes("year")) {
    return value / 12;
  }
  if (normalized.includes("semestre") || normalized.includes("semester")) {
    return value / 6;
  }
  return value;
};
const normalizePct = (value: number) => value / 100;

/* ── Additional Lines with margin & proration ── */

function calculateAdditionalLines(
  lines: Array<{
    id: string;
    nombre: string;
    precio: unknown;
    tipo?: string | null;
    recurrencia?: string | null;
    cantidad?: number | null;
    marginPct?: unknown;
  }>,
): {
  /** Totales RECURRENTES (líneas "mensual"). Alimentan el precio mensual. */
  totalBase: number;
  totalWithMargin: number;
  /** Totales de PAGO ÚNICO (líneas "unico"): valor íntegro, se cobra una sola vez.
   *  No se prorratea ni se suma al mensual — se muestra como subtotal aparte. */
  totalOneTimeBase: number;
  totalOneTimeWithMargin: number;
  details: AdditionalLineDetail[];
} {
  const details: AdditionalLineDetail[] = [];
  let totalBase = 0;
  let totalWithMargin = 0;
  let totalOneTimeBase = 0;
  let totalOneTimeWithMargin = 0;

  for (const line of lines) {
    const isOneTime = line.recurrencia === "unico";
    // Valor íntegro, SIN prorratear. El pago único se factura una sola vez y
    // vive en su propio subtotal; todo lo demás ("mensual", legado "por_evento")
    // es recurrente y alimenta el precio mensual.
    const base = safeNumber(line.precio) * (line.cantidad ?? 1);

    let withMargin = base;
    const marginPct = line.marginPct ? safeNumber(line.marginPct) : 0;
    if (marginPct > 0 && marginPct < 100) {
      withMargin = base / (1 - marginPct / 100);
    }

    details.push({
      id: line.id,
      nombre: line.nombre,
      tipo: line.tipo ?? "servicio",
      recurrencia: line.recurrencia ?? "mensual",
      precioBase: base,
      marginPct,
      precioConMargen: withMargin,
    });

    if (isOneTime) {
      totalOneTimeBase += base;
      totalOneTimeWithMargin += withMargin;
    } else {
      totalBase += base;
      totalWithMargin += withMargin;
    }
  }

  return {
    totalBase,
    totalWithMargin,
    totalOneTimeBase,
    totalOneTimeWithMargin,
    details,
  };
}

/* ── Category slug matcher ── */

function matchesCategorySlug(
  itemType: string | undefined,
  categorySlug: string,
): boolean {
  const mapping: Record<string, string[]> = {
    uniform: ["uniform"],
    exam: ["exam"],
    meal: ["meal"],
    operational: ["phone", "radio", "flashlight"],
    system: ["system"],
    transport: ["transport"],
    vehicle: ["vehicle_rent", "vehicle_fuel", "vehicle_tag"],
    infrastructure: ["infrastructure", "fuel"],
    communications: ["radio", "phone"],
    other: ["other"],
  };
  return mapping[categorySlug]?.includes(itemType ?? "") ?? false;
}

export async function computeCpqQuoteCosts(quoteId: string): Promise<QuoteCostSummary> {
  const quote = await prisma.cpqQuote.findUnique({
    where: { id: quoteId },
    select: {
      tenantId: true,
      createdFromLeadId: true,
      contractDuration: true,
      insurancePolicyUF: true,
      status: true,
    },
  });
  const tenantId = quote?.tenantId ?? null;
  const contractDuration = quote?.contractDuration ?? 12;

  const [
    positions,
    parameters,
    uniformItemsRaw,
    examItemsRaw,
    costItemsRaw,
    meals,
    vehicles,
    infrastructure,
    catalogItems,
    additionalLines,
  ] = await Promise.all([
    prisma.cpqPosition.findMany({
      where: { quoteId },
      select: { numGuards: true, numPuestos: true, monthlyPositionCost: true },
    }),
    prisma.cpqQuoteParameters.findUnique({ where: { quoteId } }),
    prisma.cpqQuoteUniformItem.findMany({
      where: { quoteId },
      include: { catalogItem: true },
    }),
    prisma.cpqQuoteExamItem.findMany({
      where: { quoteId },
      include: { catalogItem: true },
    }),
    prisma.cpqQuoteCostItem.findMany({
      where: { quoteId },
      include: { catalogItem: true },
    }),
    prisma.cpqQuoteMeal.findMany({
      where: { quoteId },
    }),
    prisma.cpqQuoteVehicle.findMany({
      where: { quoteId },
    }),
    prisma.cpqQuoteInfrastructure.findMany({
      where: { quoteId },
    }),
    prisma.cpqCatalogItem.findMany({
      where: {
        active: true,
        OR: [{ tenantId }, { tenantId: null }],
      },
    }),
    prisma.cpqQuoteAdditionalLine.findMany({
      where: { quoteId },
      orderBy: { orden: "asc" },
    }),
  ]);

  const uniformItems =
    quote?.status === "draft"
      ? hydrateQuoteCatalogLines(uniformItemsRaw, catalogItems, tenantId)
      : uniformItemsRaw;
  const examItems =
    quote?.status === "draft"
      ? hydrateQuoteCatalogLines(examItemsRaw, catalogItems, tenantId)
      : examItemsRaw;
  const costItems =
    quote?.status === "draft"
      ? hydrateQuoteCatalogLines(costItemsRaw, catalogItems, tenantId)
      : costItemsRaw;

  const totalGuards = positions.reduce(
    (sum, p) => sum + Number(p.numGuards || 0) * Number(p.numPuestos || 1),
    0
  );
  const monthlyPositions = positions.reduce(
    (sum, p) => sum + safeNumber(p.monthlyPositionCost),
    0
  );

  const uniformChangesPerYear = parameters?.uniformChangesPerYear ?? 3;
  const avgStayMonths = parameters?.avgStayMonths ?? 4;
  const holidaySettingKeys = [
    "cpq.holidayAnnualCount",
    "cpq.holidayCommercialBufferPct",
  ];
  const holidaySettings = await prisma.setting.findMany({
    where: {
      key: { in: holidaySettingKeys },
      tenantId,
    },
    select: {
      key: true,
      value: true,
    },
  });
  const holidayAnnualCount = safeNumber(
    holidaySettings.find((item) => item.key === "cpq.holidayAnnualCount")?.value ?? 12
  );
  const holidayCommercialBufferPct = safeNumber(
    holidaySettings.find((item) => item.key === "cpq.holidayCommercialBufferPct")?.value ?? 10
  );
  const holidayMonthlyFactor = holidayAnnualCount / 12;
  const holidayCommercialFactor = 1 + holidayCommercialBufferPct / 100;
  const monthlyHolidayAdjustment =
    (monthlyPositions / 30) *
    0.5 *
    holidayMonthlyFactor *
    holidayCommercialFactor;

  /* ── Default cost merging ── */

  const defaultCatalog = catalogItems.filter((item) => item.isDefault);
  const uniformCatalog = catalogItems.filter((item) => item.type === "uniform");
  const uniformDefaultIds = new Set(
    uniformCatalog.filter((item) => isDefaultUniform(item.name, item.isDefault)).map((item) => item.id)
  );
  const examDefaultIds = new Set(
    defaultCatalog.filter((item) => item.type === "exam").map((item) => item.id)
  );
  const mealDefaults = defaultCatalog.filter((item) => item.type === "meal");
  const costDefaultIds = new Set(
    defaultCatalog
      .filter((item) =>
        ["phone", "radio", "flashlight", "infrastructure", "fuel", "transport", "system"].includes(
          item.type
        )
      )
      .map((item) => item.id)
  );

  const existingUniformIds = new Set(uniformItems.map((item) => item.catalogItemId));
  const existingExamIds = new Set(examItems.map((item) => item.catalogItemId));
  const existingCostIds = new Set(costItems.map((item) => item.catalogItemId));
  const existingMealTypes = new Set(meals.map((meal) => meal.mealType.toLowerCase()));

  const skipDefaultCosts = Boolean(quote?.createdFromLeadId);

  const defaultUniforms = skipDefaultCosts
    ? []
    : uniformCatalog
        .filter((item) => uniformDefaultIds.has(item.id))
        .filter((item) => !existingUniformIds.has(item.id))
        .map((item) => ({
          catalogItemId: item.id,
          unitPriceOverride: null,
          active: true,
          catalogItem: item,
        }));
  const defaultExams = skipDefaultCosts
    ? []
    : defaultCatalog
        .filter((item) => examDefaultIds.has(item.id))
        .filter((item) => !existingExamIds.has(item.id))
        .map((item) => ({
          catalogItemId: item.id,
          unitPriceOverride: null,
          active: true,
          catalogItem: item,
        }));
  const defaultCostItems = skipDefaultCosts
    ? []
    : defaultCatalog
        .filter((item) => costDefaultIds.has(item.id))
        .filter((item) => !existingCostIds.has(item.id))
        .map((item) => ({
          catalogItemId: item.id,
          calcMode: "per_month" as const,
          quantity: 1,
          unitPriceOverride: null,
          isEnabled: true,
          isAmortizable: false,
          investmentAmount: null as unknown,
          amortizationMonths: null as number | null,
          customName: null as string | null,
          customType: null as string | null,
          catalogItem: item,
        }));
  const defaultMeals = skipDefaultCosts
    ? []
    : mealDefaults
        .filter((item) => !existingMealTypes.has(item.name.toLowerCase()))
        .map((item) => ({
          mealType: item.name,
          mealsPerDay: 0,
          daysOfService: 0,
          priceOverride: null,
          isEnabled: true,
        }));

  const mergedUniforms = [...uniformItems, ...defaultUniforms];
  const mergedExams = [...examItems, ...defaultExams];
  const mergedCostItems = [...costItems, ...defaultCostItems];
  const mergedMeals = [...meals, ...defaultMeals];

  /* ── Uniforms ── */

  let uniformRotatingCost = 0;
  let uniformProratedCost = 0;

  for (const item of mergedUniforms) {
    if (!item.active) continue;
    const base = safeNumber(item.catalogItem?.basePrice ?? 0);
    const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
    const price = override ?? base;
    const logic = (item as { priceLogic?: string }).priceLogic ?? item.catalogItem?.priceLogic ?? "uniform";

    if (logic === "prorated") {
      uniformProratedCost += normalizeUnitPrice(price, item.catalogItem?.unit, contractDuration);
    } else {
      uniformRotatingCost += normalizeUnitPrice(price, item.catalogItem?.unit, contractDuration);
    }
  }

  const monthlyUniforms =
    totalGuards > 0
      ? (((uniformRotatingCost * uniformChangesPerYear) / 12) + uniformProratedCost) * totalGuards
      : 0;

  /* ── Exams ── */

  const examSetCost = mergedExams.reduce((sum, item) => {
    if (!item.active) return sum;
    const base = safeNumber(item.catalogItem?.basePrice ?? 0);
    const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
    const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
    return sum + unitPrice;
  }, 0);
  const examEntriesPerYear = avgStayMonths > 0 ? 12 / avgStayMonths : 0;
  const examFrequency = Math.max(examEntriesPerYear, uniformChangesPerYear);
  const monthlyExams =
    totalGuards > 0 ? ((examSetCost * examFrequency) / 12) * totalGuards : 0;

  /* ── Cost items (with amortization support) ── */

  const financialItems = mergedCostItems.filter((item) =>
    ["financial", "policy"].includes(item.catalogItem?.type ?? "")
  );
  const nonFinancialItems = mergedCostItems.filter(
    (item) => !["financial", "policy"].includes(item.catalogItem?.type ?? "")
  );

  const monthlyCostItems = nonFinancialItems.reduce((sum, item) => {
    if (!item.isEnabled) return sum;

    // §2.2 — Amortizable items use investmentAmount / months, NOT normalizeUnitPrice
    if (item.isAmortizable && item.investmentAmount && Number(item.investmentAmount) > 0) {
      const months = item.amortizationMonths ?? contractDuration;
      const monthlyAmort = Number(item.investmentAmount) / months;
      const quantity = safeNumber(item.quantity);
      const calcMode = item.calcMode || "per_month";
      if (calcMode === "per_guard") {
        return sum + monthlyAmort * quantity * totalGuards;
      }
      return sum + monthlyAmort * quantity;
    }

    const base = safeNumber(item.catalogItem?.basePrice ?? 0);
    const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
    const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
    const quantity = safeNumber(item.quantity);
    const calcMode = item.calcMode || "per_month";
    if (calcMode === "per_guard") {
      return sum + unitPrice * quantity * totalGuards;
    }
    return sum + unitPrice * quantity;
  }, 0);

  /* ── Meals ── */

  const mealCatalog = catalogItems.filter((item) => item.type === "meal");
  const mealMap = new Map(
    mealCatalog.map((meal) => [meal.name.toLowerCase(), meal])
  );
  const monthlyMeals = mergedMeals.reduce((sum, meal) => {
    if (!meal.isEnabled) return sum;
    const override = meal.priceOverride ? safeNumber(meal.priceOverride) : null;
    const catalogItem = mealMap.get(meal.mealType.toLowerCase());
    const base = safeNumber(catalogItem?.basePrice ?? 0);
    const price = normalizeUnitPrice(override ?? base, catalogItem?.unit);
    return sum + price * meal.mealsPerDay * meal.daysOfService;
  }, 0);

  /* ── Vehicles ── */

  const monthlyVehicles = vehicles.reduce((sum, vehicle) => {
    if (!vehicle.isEnabled) return sum;
    const kmPerDay = safeNumber(vehicle.kmPerDay);
    const daysPerMonth = safeNumber(vehicle.daysPerMonth);
    const kmPerLiter = safeNumber(vehicle.kmPerLiter);
    const liters =
      kmPerLiter > 0 ? (kmPerDay * daysPerMonth) / kmPerLiter : 0;
    const fuelCost = liters * safeNumber(vehicle.fuelPrice);
    const vehicleMonthly =
      safeNumber(vehicle.rentMonthly) +
      safeNumber(vehicle.maintenanceMonthly) +
      fuelCost;
    return sum + vehicleMonthly * vehicle.vehiclesCount;
  }, 0);

  /* ── Infrastructure ── */

  const monthlyInfrastructure = infrastructure.reduce((sum, infra) => {
    if (!infra.isEnabled) return sum;
    const base = safeNumber(infra.rentMonthly);
    let fuelCost = 0;
    if (infra.hasFuel) {
      const liters =
        safeNumber(infra.fuelLitersPerHour) *
        safeNumber(infra.fuelHoursPerDay) *
        safeNumber(infra.fuelDaysPerMonth);
      fuelCost = liters * safeNumber(infra.fuelPrice);
    }
    return sum + (base + fuelCost) * infra.quantity;
  }, 0);

  /* ── Costs base ── */

  const costsBase =
    monthlyPositions +
    monthlyHolidayAdjustment +
    monthlyUniforms +
    monthlyExams +
    monthlyMeals +
    monthlyVehicles +
    monthlyInfrastructure +
    monthlyCostItems;

  /* ── §2.4 — Margin mode ── */

  const marginMode = (parameters as any)?.marginMode ?? "margin_on_sale";
  const marginPctRaw = safeNumber(parameters?.marginPct ?? 13);
  const marginPct = normalizePct(marginPctRaw);
  const laborCost = monthlyPositions + monthlyHolidayAdjustment;

  let baseWithMargin: number;

  switch (marginMode) {
    case "markup":
      baseWithMargin = costsBase * (1 + marginPct);
      break;

    case "margin_on_labor": {
      const laborWithMargin = marginPct < 1 ? laborCost / (1 - marginPct) : laborCost;
      const nonLaborCosts = costsBase - laborCost;
      baseWithMargin = laborWithMargin + nonLaborCosts;
      break;
    }

    case "margin_on_sale":
    default:
      baseWithMargin = marginPct < 1 ? costsBase / (1 - marginPct) : costsBase;
      break;
  }

  /* ── §2.3 — Additional lines with margin & proration ── */

  const addlResult = calculateAdditionalLines(additionalLines);

  /* ── Financial, garantía y RC (función pura) ── */

  const financialRatePctRaw = safeNumber(parameters?.financialRatePct ?? 2.5);
  const policyRatePctRaw = safeNumber(parameters?.policyRatePct ?? 2);
  let ufValue: number | null = null;
  try {
    ufValue = await getUfValue();
  } catch {
    ufValue = null;
  }

  const finResult = computeFinancialAndPolicy({
    baseWithMargin,
    additionalLinesTotalWithMargin: addlResult.totalWithMargin,
    costsBase,
    additionalLinesTotalBase: addlResult.totalBase,
    financialEnabled: parameters?.financialEnabled ?? false,
    financialRatePct: financialRatePctRaw,
    financialBaseMode: (parameters?.financialBaseMode as FinancialBaseMode) || "auto",
    salePriceBase: safeNumber(parameters?.salePriceBase ?? 0),
    policyEnabled: parameters?.policyEnabled ?? false,
    policyAmountMode: (parameters?.policyAmountMode as PolicyAmountMode) || "pct",
    policyContractMonths: parameters?.policyContractMonths ?? contractDuration,
    policyContractPct: safeNumber(parameters?.policyContractPct ?? 10),
    policyRatePct: policyRatePctRaw,
    policyAdminRatePct: safeNumber(parameters?.policyAdminRatePct ?? 0),
    policyFixedAmountUF: safeNumber(parameters?.policyFixedAmountUF ?? 0),
    liabilityEnabled: parameters?.liabilityEnabled ?? false,
    liabilityMode: (parameters?.liabilityMode as LiabilityMode) || "premium",
    liabilityRatePct: safeNumber(parameters?.liabilityRatePct ?? 0.3),
    liabilityAnnualPremiumUF: safeNumber(parameters?.liabilityAnnualPremiumUF ?? 0),
    liabilityAllocationPct: safeNumber(parameters?.liabilityAllocationPct ?? 100),
    insurancePolicyUF:
      quote?.insurancePolicyUF != null ? safeNumber(quote.insurancePolicyUF) : null,
    liabilityDeductibleUF: safeNumber(parameters?.liabilityDeductibleUF ?? 0),
    ufValue,
  });

  const monthlyFinancial = finResult.monthlyFinancial;
  const monthlyPolicy = finResult.monthlyPolicy;
  const monthlyPolicyAdmin = finResult.monthlyPolicyAdmin;
  const monthlyLiability = finResult.monthlyLiability;
  const salePriceMonthly = finResult.salePriceMonthly;

  /* ── Monthly totals ── */

  const baseExtras =
    monthlyHolidayAdjustment +
    monthlyUniforms +
    monthlyExams +
    monthlyMeals +
    monthlyVehicles +
    monthlyInfrastructure +
    monthlyCostItems;
  const monthlyExtras =
    baseExtras + monthlyFinancial + monthlyPolicy + monthlyPolicyAdmin + monthlyLiability;
  const monthlyTotal = monthlyPositions + monthlyExtras;

  /* ── §2.5 — Group costs by category ── */

  let costsByCategory: CostByCategory[] = [];
  try {
    const categories = await prisma.cpqCostCategory.findMany({
      where: { OR: [{ tenantId }, { tenantId: null }], active: true },
      orderBy: { sortOrder: "asc" },
    });

    const allCostItems = nonFinancialItems;

    const calculateItemAmount = (item: typeof allCostItems[number]): number => {
      if (!item.isEnabled) return 0;

      if (item.isAmortizable && item.investmentAmount && Number(item.investmentAmount) > 0) {
        const months = item.amortizationMonths ?? contractDuration;
        const monthlyAmort = Number(item.investmentAmount) / months;
        const qty = safeNumber(item.quantity);
        if ((item.calcMode || "per_month") === "per_guard") {
          return monthlyAmort * qty * totalGuards;
        }
        return monthlyAmort * qty;
      }

      const base = safeNumber(item.catalogItem?.basePrice ?? 0);
      const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
      const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
      const qty = safeNumber(item.quantity);
      if ((item.calcMode || "per_month") === "per_guard") {
        return unitPrice * qty * totalGuards;
      }
      return unitPrice * qty;
    };

    costsByCategory = categories
      .map((cat) => {
        const items = allCostItems
          .filter((item) => {
            const itemType = (item as any).customType ?? item.catalogItem?.type;
            return matchesCategorySlug(itemType, cat.slug);
          })
          .map((item) => ({
            name: (item as any).customName ?? item.catalogItem?.name ?? "Sin nombre",
            amount: calculateItemAmount(item),
            calcMode: item.isAmortizable ? "amortizable" : item.calcMode,
            technicalSpecs: (item as any).technicalSpecs ?? item.catalogItem?.defaultTechnicalSpecs ?? null,
          }));

        return {
          category: cat.name,
          categorySlug: cat.slug,
          categoryType: cat.type as "direct" | "indirect",
          items,
          subtotal: items.reduce((sum, i) => sum + i.amount, 0),
        };
      })
      .filter((cat) => cat.items.length > 0 || cat.subtotal > 0);
  } catch {
    // Non-critical: if CpqCostCategory table doesn't exist yet, return empty
  }

  return {
    totalGuards,
    monthlyPositions,
    monthlyHolidayAdjustment,
    monthlyUniforms,
    monthlyExams,
    monthlyMeals,
    monthlyVehicles,
    monthlyInfrastructure,
    monthlyCostItems,
    costsBase,
    baseWithMargin,
    monthlyFinancial,
    monthlyPolicy,
    monthlyPolicyAdmin,
    monthlyLiability,
    policyGuaranteedAmount: finResult.policyGuaranteedAmount,
    grossUpApplied: finResult.grossUpApplied,
    grossUpFactor: finResult.grossUpFactor,
    effectiveMarginPct: finResult.effectiveMarginPct,
    missingUf: finResult.missingUf,
    financialWarnings: finResult.warnings,
    monthlyExtras,
    monthlyTotal,
    financialRatePct: financialRatePctRaw,
    policyRatePct: policyRatePctRaw,
    additionalLinesDetails: addlResult.details,
    additionalLinesTotalBase: addlResult.totalBase,
    additionalLinesTotalWithMargin: addlResult.totalWithMargin,
    additionalLinesOneTimeBase: addlResult.totalOneTimeBase,
    additionalLinesOneTimeWithMargin: addlResult.totalOneTimeWithMargin,
    costsByCategory,
    marginMode,
    laborCost,
    salePriceMonthly,
  };
}

export function computeHourlyCost(monthlyCost: number, monthlyHours = 180) {
  if (!monthlyHours) return 0;
  return monthlyCost / monthlyHours;
}

/**
 * Recalcula totales de la cotización (totalPositions, totalGuards, monthlyCost)
 * y los persiste en CpqQuote. Usar después de crear/editar posiciones o ítems de costo.
 */
export async function refreshQuoteTotals(quoteId: string) {
  const positions = await prisma.cpqPosition.findMany({
    where: { quoteId },
    select: { numPuestos: true },
  });
  const totalPositions = positions.reduce(
    (sum, pos) => sum + Number(pos.numPuestos || 1),
    0
  );
  const costSummary = await computeCpqQuoteCosts(quoteId);

  const salePriceMonthly = costSummary.salePriceMonthly;

  await prisma.cpqQuoteParameters.upsert({
    where: { quoteId },
    update: { salePriceMonthly },
    create: { quoteId, salePriceMonthly },
  });

  const updated = await prisma.cpqQuote.update({
    where: { id: quoteId },
    data: {
      totalPositions,
      totalGuards: costSummary.totalGuards,
      monthlyCost: costSummary.monthlyTotal,
    },
  });

  // Cashflow: si el quote ya está activo, recalcular el item espejo
  // con el nuevo monthlyCost. Si está en draft, será noop.
  try {
    await syncContractItemForQuote(updated.tenantId, updated.id);
  } catch (err) {
    console.error("[CPQ costs] sync cashflow item failed:", err);
  }

  return updated;
}
