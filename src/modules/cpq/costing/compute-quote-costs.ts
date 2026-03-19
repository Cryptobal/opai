import { prisma } from "@/lib/prisma";
import { isDefaultUniform } from "@/lib/cpq-constants";
import type {
  AdditionalLineDetail,
  CostByCategory,
} from "@/types/cpq";

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
  monthlyExtras: number;
  monthlyTotal: number;
  financialRatePct?: number;
  policyRatePct?: number;
  additionalLinesDetails: AdditionalLineDetail[];
  additionalLinesTotalBase: number;
  additionalLinesTotalWithMargin: number;
  costsByCategory: CostByCategory[];
  marginMode: string;
  laborCost: number;
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
  contractDuration: number,
): {
  totalBase: number;
  totalWithMargin: number;
  details: AdditionalLineDetail[];
} {
  const details: AdditionalLineDetail[] = [];
  let totalBase = 0;
  let totalWithMargin = 0;

  for (const line of lines) {
    let monthlyBase = safeNumber(line.precio) * (line.cantidad ?? 1);

    if (line.recurrencia === "unico" && contractDuration > 0) {
      monthlyBase = monthlyBase / contractDuration;
    }

    let monthlyWithMargin = monthlyBase;
    const marginPct = line.marginPct ? safeNumber(line.marginPct) : 0;
    if (marginPct > 0 && marginPct < 100) {
      monthlyWithMargin = monthlyBase / (1 - marginPct / 100);
    }

    details.push({
      id: line.id,
      nombre: line.nombre,
      tipo: line.tipo ?? "servicio",
      recurrencia: line.recurrencia ?? "mensual",
      precioBase: monthlyBase,
      marginPct,
      precioConMargen: monthlyWithMargin,
    });

    totalBase += monthlyBase;
    totalWithMargin += monthlyWithMargin;
  }

  return { totalBase, totalWithMargin, details };
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
    },
  });
  const tenantId = quote?.tenantId ?? null;
  const contractDuration = quote?.contractDuration ?? 12;

  const [
    positions,
    parameters,
    uniformItems,
    examItems,
    costItems,
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

  /* ── Financial & Policy ── */

  const financialEnabled = parameters?.financialEnabled ?? false;
  const policyEnabled = parameters?.policyEnabled ?? false;
  const salePriceBase = safeNumber(parameters?.salePriceBase ?? 0);
  const effectiveSalePriceBase = salePriceBase > 0 ? salePriceBase : baseWithMargin;

  const financialRatePctRaw = safeNumber(parameters?.financialRatePct ?? 2.5);
  const financialRatePct = normalizePct(financialRatePctRaw);
  const policyRatePctRaw = safeNumber(parameters?.policyRatePct ?? 0);
  const policyRatePct = normalizePct(policyRatePctRaw);

  const policyContractMonths = parameters?.policyContractMonths ?? 12;
  const policyContractPct = normalizePct(safeNumber(parameters?.policyContractPct ?? 20));

  const monthlyFinancial =
    financialEnabled && effectiveSalePriceBase > 0
      ? effectiveSalePriceBase * financialRatePct
      : 0;

  const montoAnual = effectiveSalePriceBase * policyContractMonths;
  const valorGarantia = montoAnual * policyContractPct;
  const monthlyPolicy =
    policyEnabled && effectiveSalePriceBase > 0
      ? (valorGarantia * policyRatePct) / 12
      : 0;

  /* ── §2.3 — Additional lines with margin & proration ── */

  const addlResult = calculateAdditionalLines(additionalLines, contractDuration);

  /* ── Monthly totals ── */

  const baseExtras =
    monthlyHolidayAdjustment +
    monthlyUniforms +
    monthlyExams +
    monthlyMeals +
    monthlyVehicles +
    monthlyInfrastructure +
    monthlyCostItems;
  const monthlyExtras = baseExtras + monthlyFinancial + monthlyPolicy;
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
    monthlyExtras,
    monthlyTotal,
    financialRatePct: financialRatePctRaw,
    policyRatePct: policyRatePctRaw,
    additionalLinesDetails: addlResult.details,
    additionalLinesTotalBase: addlResult.totalBase,
    additionalLinesTotalWithMargin: addlResult.totalWithMargin,
    costsByCategory,
    marginMode,
    laborCost,
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

  const salePriceMonthly =
    costSummary.baseWithMargin +
    (costSummary.monthlyFinancial ?? 0) +
    (costSummary.monthlyPolicy ?? 0) +
    costSummary.additionalLinesTotalWithMargin;

  await prisma.cpqQuoteParameters.upsert({
    where: { quoteId },
    update: { salePriceMonthly },
    create: { quoteId, salePriceMonthly },
  });

  return prisma.cpqQuote.update({
    where: { id: quoteId },
    data: {
      totalPositions,
      totalGuards: costSummary.totalGuards,
      monthlyCost: costSummary.monthlyTotal,
    },
  });
}
