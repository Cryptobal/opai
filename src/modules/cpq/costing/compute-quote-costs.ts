import { prisma } from "@/lib/prisma";

interface QuoteCostSummary {
  totalGuards: number;
  monthlyPositions: number;
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
const normalizePct = (value: number) => (value > 1 ? value / 100 : value);

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
  ] = await Promise.all([
    prisma.cpqPosition.findMany({
      where: { quoteId },
      select: { numGuards: true, monthlyPositionCost: true },
    }),
    prisma.cpqQuoteParameters.findUnique({ where: { quoteId } }),
    prisma.cpqQuoteUniformItem.findMany({
      where: { quoteId, active: true },
      include: { catalogItem: true },
    }),
    prisma.cpqQuoteExamItem.findMany({
      where: { quoteId, active: true },
      include: { catalogItem: true },
    }),
    prisma.cpqQuoteCostItem.findMany({
      where: { quoteId, isEnabled: true },
      include: { catalogItem: true },
    }),
    prisma.cpqQuoteMeal.findMany({
      where: { quoteId, isEnabled: true },
    }),
    prisma.cpqQuoteVehicle.findMany({
      where: { quoteId, isEnabled: true },
    }),
    prisma.cpqQuoteInfrastructure.findMany({
      where: { quoteId, isEnabled: true },
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

  const uniformSetCost = uniformItems.reduce((sum, item) => {
    const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
    const base = safeNumber(item.catalogItem.basePrice);
    const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem.unit);
    return sum + unitPrice;
  }, 0);
  const monthlyUniforms =
    totalGuards > 0
      ? ((uniformSetCost * uniformChangesPerYear) / 12) * totalGuards
      : 0;

  const examSetCost = examItems.reduce((sum, item) => {
    const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
    const base = safeNumber(item.catalogItem.basePrice);
    const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem.unit);
    return sum + unitPrice;
  }, 0);
  const examEntriesPerYear = avgStayMonths > 0 ? 12 / avgStayMonths : 0;
  const monthlyExams =
    totalGuards > 0 ? ((examSetCost * examEntriesPerYear) / 12) * totalGuards : 0;

  const financialItems = costItems.filter((item) =>
    ["financial", "policy"].includes(item.catalogItem.type)
  );
  const nonFinancialItems = costItems.filter(
    (item) => !["financial", "policy"].includes(item.catalogItem.type)
  );

  const monthlyCostItems = nonFinancialItems.reduce((sum, item) => {
    const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
    const base = safeNumber(item.catalogItem.basePrice);
    const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem.unit);
    const quantity = safeNumber(item.quantity);
    const calcMode = item.calcMode || "per_month";
    if (calcMode === "per_guard") {
      return sum + unitPrice * quantity * totalGuards;
    }
    return sum + unitPrice * quantity;
  }, 0);

  const catalogMeals = await prisma.cpqCatalogItem.findMany({
    where: {
      type: "meal",
      active: true,
      OR: [{ tenantId }, { tenantId: null }],
    },
  });
  const mealMap = new Map(
    catalogMeals.map((meal) => [meal.name.toLowerCase(), safeNumber(meal.basePrice)])
  );

  const monthlyMeals = meals.reduce((sum, meal) => {
    const override = meal.priceOverride ? safeNumber(meal.priceOverride) : null;
    const base = mealMap.get(meal.mealType.toLowerCase()) ?? 0;
    const catalogUnit = catalogMeals.find(
      (item) => item.name.toLowerCase() === meal.mealType.toLowerCase()
    )?.unit;
    const price = normalizeUnitPrice(override ?? base, catalogUnit);
    return sum + price * meal.mealsPerDay * meal.daysOfService;
  }, 0);

  const monthlyVehicles = vehicles.reduce((sum, vehicle) => {
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
    monthlyUniforms +
    monthlyExams +
    monthlyMeals +
    monthlyVehicles +
    monthlyInfrastructure +
    monthlyCostItems;

  const marginPct = normalizePct(safeNumber(parameters?.marginPct || 20));

  const financialItem = financialItems.find(
    (item) => item.catalogItem.type === "financial"
  );
  const financialRatePct = financialItem
    ? normalizePct(
        safeNumber(
          financialItem.unitPriceOverride ?? financialItem.catalogItem.basePrice
        )
      )
    : 0;

  const policyItem = financialItems.find((item) => item.catalogItem.type === "policy");
  const policyRatePct = policyItem
    ? normalizePct(
        safeNumber(policyItem.unitPriceOverride ?? policyItem.catalogItem.basePrice)
      )
    : 0;

  // Validación crítica: si los porcentajes suman >= 100%, el margen es 0%
  const totalRatePct = marginPct + financialRatePct + policyRatePct;
  if (totalRatePct >= 0.99) {
    console.warn(`[CPQ ${quoteId}] totalRatePct >= 99% (${(totalRatePct * 100).toFixed(1)}%). Margen insuficiente.`);
  }

  // Precio de venta: costo base / (1 - porcentajes totales)
  // Si totalRatePct >= 1, no hay markup (precio = costo)
  const salePriceMonthly =
    totalRatePct < 1 ? costsBase / (1 - totalRatePct) : costsBase;

  // Costo financiero: se calcula sobre el precio de venta
  const monthlyFinancial = salePriceMonthly * financialRatePct;

  // Costo de póliza: se prorratea según duración del contrato
  const contractMonths = parameters?.contractMonths ?? 12;
  const policyContractMonths = parameters?.policyContractMonths ?? 12;
  const policyContractPct = normalizePct(safeNumber(parameters?.policyContractPct || 100));
  const policyContractAmount = salePriceMonthly * policyContractMonths * policyContractPct;
  const policyTotal = policyContractAmount * policyRatePct;
  const monthlyPolicy = contractMonths > 0 ? policyTotal / contractMonths : 0;

  // monthlyExtras: solo costos financieros y póliza (NO duplicar costos base)
  const monthlyExtras = monthlyFinancial + monthlyPolicy;

  // Costo total mensual: costo base + costos financieros
  const monthlyTotal = costsBase + monthlyFinancial + monthlyPolicy;

  return {
    totalGuards,
    monthlyPositions,
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
  };
}

export function computeHourlyCost(monthlyCost: number, monthlyHours = 180) {
  if (!monthlyHours) return 0;
  return monthlyCost / monthlyHours;
}
