import { prisma } from "@/lib/prisma";

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
  monthlyFinancial: number;
  monthlyPolicy: number;
  monthlyExtras: number;
  monthlyTotal: number;
  financialRatePct?: number;
  policyRatePct?: number;
}

const safeNumber = (value: unknown) => Number(value || 0);
const normalizeUnitPrice = (value: number, unit?: string | null) => {
  if (!unit) return value;
  const normalized = unit.toLowerCase();
  if (normalized.includes("año") || normalized.includes("year")) {
    return value / 12;
  }
  if (normalized.includes("semestre") || normalized.includes("semester")) {
    return value / 6;
  }
  return value;
};
const normalizePct = (value: number) => value / 100;

export async function computeCpqQuoteCosts(quoteId: string): Promise<QuoteCostSummary> {
  const quote = await prisma.cpqQuote.findUnique({
    where: { id: quoteId },
    select: { tenantId: true },
  });
  const tenantId = quote?.tenantId ?? null;

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
  ] = await Promise.all([
    prisma.cpqPosition.findMany({
      where: { quoteId },
      select: { numGuards: true, monthlyPositionCost: true },
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
  ]);

  const totalGuards = positions.reduce((sum, p) => sum + p.numGuards, 0);
  const monthlyPositions = positions.reduce(
    (sum, p) => sum + safeNumber(p.monthlyPositionCost),
    0
  );

  const uniformChangesPerYear = parameters?.uniformChangesPerYear ?? 3;
  const avgStayMonths = parameters?.avgStayMonths ?? 4;
  const monthlyHoursStandard = parameters?.monthlyHoursStandard ?? 180;
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

  const defaultCatalog = catalogItems.filter((item) => item.isDefault);
  const uniformDefaultIds = new Set(
    defaultCatalog.filter((item) => item.type === "uniform").map((item) => item.id)
  );
  const examDefaultIds = new Set(
    defaultCatalog.filter((item) => item.type === "exam").map((item) => item.id)
  );
  const mealDefaults = defaultCatalog.filter((item) => item.type === "meal");
  const costDefaultIds = new Set(
    defaultCatalog
      .filter((item) =>
        ["phone", "radio", "flashlight", "infrastructure", "fuel", "transport", "system", "financial", "policy"].includes(
          item.type
        )
      )
      .map((item) => item.id)
  );

  const existingUniformIds = new Set(uniformItems.map((item) => item.catalogItemId));
  const existingExamIds = new Set(examItems.map((item) => item.catalogItemId));
  const existingCostIds = new Set(costItems.map((item) => item.catalogItemId));
  const existingMealTypes = new Set(meals.map((meal) => meal.mealType.toLowerCase()));

  const defaultUniforms = defaultCatalog
    .filter((item) => uniformDefaultIds.has(item.id))
    .filter((item) => !existingUniformIds.has(item.id))
    .map((item) => ({
      catalogItemId: item.id,
      unitPriceOverride: null,
      active: true,
      catalogItem: item,
    }));
  const defaultExams = defaultCatalog
    .filter((item) => examDefaultIds.has(item.id))
    .filter((item) => !existingExamIds.has(item.id))
    .map((item) => ({
      catalogItemId: item.id,
      unitPriceOverride: null,
      active: true,
      catalogItem: item,
    }));
  const defaultCostItems = defaultCatalog
    .filter((item) => costDefaultIds.has(item.id))
    .filter((item) => !existingCostIds.has(item.id))
    .map((item) => ({
      catalogItemId: item.id,
      calcMode: "per_month",
      quantity: 1,
      unitPriceOverride: null,
      isEnabled: true,
      catalogItem: item,
    }));
  const defaultMeals = mealDefaults
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

  const uniformSetCost = mergedUniforms.reduce((sum, item) => {
    if (!item.active) return sum;
    const base = safeNumber(item.catalogItem?.basePrice ?? 0);
    const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
    const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
    return sum + unitPrice;
  }, 0);
  const monthlyUniforms =
    totalGuards > 0
      ? ((uniformSetCost * uniformChangesPerYear) / 12) * totalGuards
      : 0;

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

  const financialItems = mergedCostItems.filter((item) =>
    ["financial", "policy"].includes(item.catalogItem?.type ?? "")
  );
  const nonFinancialItems = mergedCostItems.filter(
    (item) => !["financial", "policy"].includes(item.catalogItem?.type ?? "")
  );

  const monthlyCostItems = nonFinancialItems.reduce((sum, item) => {
    if (!item.isEnabled) return sum;
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

  const costsBase =
    monthlyPositions +
    monthlyHolidayAdjustment +
    monthlyUniforms +
    monthlyExams +
    monthlyMeals +
    monthlyVehicles +
    monthlyInfrastructure +
    monthlyCostItems;

  const marginPct = normalizePct(safeNumber(parameters?.marginPct ?? 13));
  const baseWithMargin = marginPct < 1 ? costsBase / (1 - marginPct) : costsBase;

  const financialEnabled = true;
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
    monthlyFinancial,
    monthlyPolicy,
    monthlyExtras,
    monthlyTotal,
    financialRatePct: financialRatePctRaw,
    policyRatePct: policyRatePctRaw,
  };
}

export function computeHourlyCost(monthlyCost: number, monthlyHours = 180) {
  if (!monthlyHours) return 0;
  return monthlyCost / monthlyHours;
}
