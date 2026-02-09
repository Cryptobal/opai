/**
 * API Route: /api/cpq/quotes/[id]/costs
 * GET  - Obtener costos y parámetros de cotización
 * PUT  - Reemplazar costos y parámetros
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

const safeNumber = (value: unknown) => Number(value || 0);
const normalizePct = (value: number) => (value > 1 ? value / 100 : value);
const normalizeDecimal = (value: unknown) => {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(Number(value));
};
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quote = await prisma.cpqQuote.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    const tenantId = quote?.tenantId ?? null;

    const [
      positions,
      parameters,
      uniforms,
      exams,
      costItems,
      meals,
      vehicles,
      infrastructure,
      catalogItems,
    ] = await Promise.all([
      prisma.cpqPosition.findMany({
        where: { quoteId: id },
        select: { numGuards: true, monthlyPositionCost: true },
      }),
        prisma.cpqQuoteParameters.findUnique({ where: { quoteId: id } }),
        prisma.cpqQuoteUniformItem.findMany({
          where: { quoteId: id },
          include: { catalogItem: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.cpqQuoteExamItem.findMany({
          where: { quoteId: id },
          include: { catalogItem: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.cpqQuoteCostItem.findMany({
          where: { quoteId: id },
          include: { catalogItem: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.cpqQuoteMeal.findMany({
          where: { quoteId: id },
          orderBy: { createdAt: "asc" },
        }),
        prisma.cpqQuoteVehicle.findMany({
          where: { quoteId: id },
          orderBy: { createdAt: "asc" },
        }),
        prisma.cpqQuoteInfrastructure.findMany({
          where: { quoteId: id },
          orderBy: { createdAt: "asc" },
        }),
      prisma.cpqCatalogItem.findMany({
        where: {
          OR: [{ tenantId }, { tenantId: null }],
          active: true,
        },
      }),
      ]);

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
          ["phone", "radio", "flashlight", "infrastructure", "fuel", "transport", "system"].includes(
            item.type
          )
        )
        .map((item) => item.id)
    );

    const existingUniformIds = new Set(uniforms.map((item) => item.catalogItemId));
    const existingExamIds = new Set(exams.map((item) => item.catalogItemId));
    const existingCostIds = new Set(costItems.map((item) => item.catalogItemId));
    const existingMealTypes = new Set(meals.map((meal) => meal.mealType.toLowerCase()));

    const defaultUniforms = defaultCatalog
      .filter((item) => uniformDefaultIds.has(item.id))
      .filter((item) => !existingUniformIds.has(item.id))
      .map((item) => ({
        quoteId: id,
        catalogItemId: item.id,
        unitPriceOverride: null,
        active: true,
        catalogItem: item,
      }));

    const defaultExams = defaultCatalog
      .filter((item) => examDefaultIds.has(item.id))
      .filter((item) => !existingExamIds.has(item.id))
      .map((item) => ({
        quoteId: id,
        catalogItemId: item.id,
        unitPriceOverride: null,
        active: true,
        catalogItem: item,
      }));

    const defaultMeals = mealDefaults
      .filter((item) => !existingMealTypes.has(item.name.toLowerCase()))
      .map((item) => ({
        quoteId: id,
        mealType: item.name,
        mealsPerDay: 0,
        daysOfService: 0,
        priceOverride: null,
        isEnabled: true,
        visibility: "visible",
      }));

    const defaultCostItems = defaultCatalog
      .filter((item) => costDefaultIds.has(item.id))
      .filter((item) => !existingCostIds.has(item.id))
      .map((item) => ({
        quoteId: id,
        catalogItemId: item.id,
        calcMode: "per_month",
        quantity: 1,
        unitPriceOverride: null,
        isEnabled: true,
        visibility: item.defaultVisibility || "visible",
        notes: null,
        catalogItem: item,
      }));

    const mergedUniforms = [...uniforms, ...defaultUniforms];
    const mergedExams = [...exams, ...defaultExams];
    const mergedCostItems = [...costItems, ...defaultCostItems];
    const mergedMeals = [...meals, ...defaultMeals];

    const totalGuards = positions.reduce((sum, p) => sum + p.numGuards, 0);
    const monthlyPositions = positions.reduce(
      (sum, p) => sum + safeNumber(p.monthlyPositionCost),
      0
    );

    const uniformChangesPerYear = parameters?.uniformChangesPerYear ?? 3;
    const avgStayMonths = parameters?.avgStayMonths ?? 4;

    const uniformSetCost = mergedUniforms.reduce((sum, item) => {
      if (!item.active) return sum;
      const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
      const base = safeNumber(item.catalogItem?.basePrice);
      const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
      return sum + unitPrice;
    }, 0);
    const monthlyUniforms =
      totalGuards > 0
        ? ((uniformSetCost * uniformChangesPerYear) / 12) * totalGuards
        : 0;

    const examSetCost = mergedExams.reduce((sum, item) => {
      if (!item.active) return sum;
      const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
      const base = safeNumber(item.catalogItem?.basePrice);
      const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
      return sum + unitPrice;
    }, 0);
    const examEntriesPerYear = avgStayMonths > 0 ? 12 / avgStayMonths : 0;
    const monthlyExams =
      totalGuards > 0 ? ((examSetCost * examEntriesPerYear) / 12) * totalGuards : 0;

    const mealMap = new Map(
      catalogItems
        .filter((item) => item.type === "meal")
        .map((meal) => [meal.name.toLowerCase(), meal])
    );
    const monthlyMeals = mergedMeals.reduce((sum, meal) => {
      if (!meal.isEnabled) return sum;
      const override = meal.priceOverride ? safeNumber(meal.priceOverride) : null;
      const catalogItem = mealMap.get(meal.mealType.toLowerCase());
      const base = safeNumber(catalogItem?.basePrice ?? 0);
      const price = normalizeUnitPrice(override ?? base, catalogItem?.unit);
      return sum + price * meal.mealsPerDay * meal.daysOfService;
    }, 0);

    const financialItems = mergedCostItems.filter((item) =>
      ["financial", "policy"].includes(item.catalogItem?.type || "")
    );
    const nonFinancialItems = mergedCostItems.filter(
      (item) => !["financial", "policy"].includes(item.catalogItem?.type || "")
    );

    const monthlyCostItems = nonFinancialItems.reduce((sum, item) => {
      if (!item.isEnabled) return sum;
      const override = item.unitPriceOverride ? safeNumber(item.unitPriceOverride) : null;
      const base = safeNumber(item.catalogItem?.basePrice ?? 0);
      const unitPrice = normalizeUnitPrice(override ?? base, item.catalogItem?.unit);
      const quantity = safeNumber(item.quantity);
      const calcMode = item.calcMode || "per_month";
      if (calcMode === "per_guard") {
        return sum + unitPrice * quantity * totalGuards;
      }
      return sum + unitPrice * quantity;
    }, 0);

    const marginPct = normalizePct(safeNumber(parameters?.marginPct ?? 20));
    const financialItem = financialItems.find(
      (item) => item.catalogItem?.type === "financial"
    );
    const financialRatePct = financialItem
      ? normalizePct(
          safeNumber(
            financialItem.unitPriceOverride ?? financialItem.catalogItem?.basePrice ?? 0
          )
        )
      : 0;
    const policyItem = financialItems.find((item) => item.catalogItem?.type === "policy");
    const policyRatePct = policyItem
      ? normalizePct(
          safeNumber(policyItem.unitPriceOverride ?? policyItem.catalogItem?.basePrice ?? 0)
        )
      : 0;

    const costsBase =
      monthlyPositions + monthlyUniforms + monthlyExams + monthlyMeals + monthlyCostItems;
    const totalRatePct = marginPct + financialRatePct + policyRatePct;
    const salePriceMonthly =
      totalRatePct < 1 ? costsBase / (1 - totalRatePct) : costsBase;
    const monthlyFinancial = salePriceMonthly * financialRatePct;

    const contractMonths = parameters?.contractMonths ?? 12;
    const policyContractMonths = parameters?.policyContractMonths ?? 12;
    const policyContractPct = normalizePct(safeNumber(parameters?.policyContractPct ?? 100));
    const policyContractAmount = salePriceMonthly * policyContractMonths * policyContractPct;
    const policyTotal = policyContractAmount * policyRatePct;
    const monthlyPolicy = contractMonths > 0 ? policyTotal / contractMonths : 0;

    const monthlyExtras =
      monthlyUniforms + monthlyExams + monthlyMeals + monthlyCostItems + monthlyFinancial + monthlyPolicy;
    const monthlyTotal = monthlyPositions + monthlyExtras;

    const summary = {
      totalGuards,
      monthlyPositions,
      monthlyUniforms,
      monthlyExams,
      monthlyMeals,
      monthlyVehicles: 0,
      monthlyInfrastructure: 0,
      monthlyCostItems,
      monthlyFinancial,
      monthlyPolicy,
      monthlyExtras,
      monthlyTotal,
    };

    return NextResponse.json({
      success: true,
      data: {
        parameters,
        uniforms: mergedUniforms,
        exams: mergedExams,
        costItems: mergedCostItems,
        meals: mergedMeals,
        vehicles,
        infrastructure,
        summary,
      },
    });
  } catch (error) {
    console.error("Error fetching CPQ costs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch costs" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const parameters = body?.parameters ?? null;
    const uniforms = Array.isArray(body?.uniforms) ? body.uniforms : [];
    const exams = Array.isArray(body?.exams) ? body.exams : [];
    const costItems = Array.isArray(body?.costItems) ? body.costItems : [];
    const meals = Array.isArray(body?.meals) ? body.meals : [];
    const vehicles = Array.isArray(body?.vehicles) ? body.vehicles : [];
    const infrastructure = Array.isArray(body?.infrastructure) ? body.infrastructure : [];

    await prisma.$transaction(async (tx) => {
      const quote = await tx.cpqQuote.findUnique({
        where: { id },
        select: { tenantId: true },
      });
      const tenantId = quote?.tenantId ?? null;
      const defaultCatalog = await tx.cpqCatalogItem.findMany({
        where: {
          OR: [{ tenantId }, { tenantId: null }],
          active: true,
          isDefault: true,
          type: {
            in: [
              "uniform",
              "exam",
              "meal",
              "phone",
              "radio",
              "flashlight",
              "infrastructure",
              "fuel",
              "transport",
              "system",
              "financial",
              "policy",
            ],
          },
        },
      });

      if (parameters) {
        await tx.cpqQuoteParameters.upsert({
          where: { quoteId: id },
          update: {
            monthlyHoursStandard: parameters.monthlyHoursStandard,
            avgStayMonths: parameters.avgStayMonths,
            uniformChangesPerYear: parameters.uniformChangesPerYear,
            financialRatePct: parameters.financialRatePct,
            salePriceMonthly: parameters.salePriceMonthly,
            policyRatePct: parameters.policyRatePct,
            policyAdminRatePct: parameters.policyAdminRatePct,
            policyContractMonths: parameters.policyContractMonths,
            policyContractPct: parameters.policyContractPct,
            contractMonths: parameters.contractMonths,
            contractAmount: parameters.contractAmount,
            marginPct: parameters.marginPct,
          },
          create: {
            quoteId: id,
            monthlyHoursStandard: parameters.monthlyHoursStandard ?? 180,
            avgStayMonths: parameters.avgStayMonths ?? 4,
            uniformChangesPerYear: parameters.uniformChangesPerYear ?? 3,
            financialRatePct: parameters.financialRatePct ?? 0,
            salePriceMonthly: parameters.salePriceMonthly ?? 0,
            policyRatePct: parameters.policyRatePct ?? 0,
            policyAdminRatePct: parameters.policyAdminRatePct ?? 0,
            policyContractMonths: parameters.policyContractMonths ?? 12,
            policyContractPct: parameters.policyContractPct ?? 100,
            contractMonths: parameters.contractMonths ?? 12,
            contractAmount: parameters.contractAmount ?? 0,
            marginPct: parameters.marginPct ?? 20,
          },
        });
      }

      const existingUniforms = await tx.cpqQuoteUniformItem.findMany({
        where: { quoteId: id },
      });
      const existingExams = await tx.cpqQuoteExamItem.findMany({ where: { quoteId: id } });
      const existingCostItems = await tx.cpqQuoteCostItem.findMany({ where: { quoteId: id } });
      const existingMeals = await tx.cpqQuoteMeal.findMany({ where: { quoteId: id } });

      const uniformDefaults = defaultCatalog.filter((item) => item.type === "uniform");
      const examDefaults = defaultCatalog.filter((item) => item.type === "exam");
      const mealDefaults = defaultCatalog.filter((item) => item.type === "meal");
    const costDefaults = defaultCatalog.filter((item) =>
      ["phone", "radio", "flashlight", "infrastructure", "fuel", "transport", "system", "financial", "policy"].includes(
        item.type
      )
    );

      const uniformMap = new Map(
        existingUniforms.map((item) => [
          item.catalogItemId,
          {
            quoteId: id,
            catalogItemId: item.catalogItemId,
            unitPriceOverride: item.unitPriceOverride ?? null,
            active: item.active ?? true,
          },
        ])
      );
      uniforms.forEach((item: any) => {
        uniformMap.set(item.catalogItemId, {
          ...item,
          quoteId: id,
          unitPriceOverride: item.unitPriceOverride ?? null,
          active: item.active ?? true,
        });
      });
      uniformDefaults.forEach((item) => {
        if (!uniformMap.has(item.id)) {
          uniformMap.set(item.id, {
            quoteId: id,
            catalogItemId: item.id,
            unitPriceOverride: null,
            active: true,
          });
        }
      });
      await tx.cpqQuoteUniformItem.deleteMany({ where: { quoteId: id } });
      await tx.cpqQuoteUniformItem.createMany({
        data: Array.from(uniformMap.values()).map((item: any) => ({
          quoteId: id,
          catalogItemId: item.catalogItemId,
          unitPriceOverride: item.unitPriceOverride ?? null,
          active: item.active ?? true,
        })),
      });

      const examMap = new Map(
        existingExams.map((item) => [
          item.catalogItemId,
          {
            quoteId: id,
            catalogItemId: item.catalogItemId,
            unitPriceOverride: item.unitPriceOverride ?? null,
            active: item.active ?? true,
          },
        ])
      );
      exams.forEach((item: any) => {
        examMap.set(item.catalogItemId, {
          ...item,
          quoteId: id,
          unitPriceOverride: item.unitPriceOverride ?? null,
          active: item.active ?? true,
        });
      });
      examDefaults.forEach((item) => {
        if (!examMap.has(item.id)) {
          examMap.set(item.id, {
            quoteId: id,
            catalogItemId: item.id,
            unitPriceOverride: null,
            active: true,
          });
        }
      });
      await tx.cpqQuoteExamItem.deleteMany({ where: { quoteId: id } });
      await tx.cpqQuoteExamItem.createMany({
        data: Array.from(examMap.values()).map((item: any) => ({
          quoteId: id,
          catalogItemId: item.catalogItemId,
          unitPriceOverride: item.unitPriceOverride ?? null,
          active: item.active ?? true,
        })),
      });

      const costMap = new Map(
        existingCostItems.map((item) => [
          item.catalogItemId,
          {
            quoteId: id,
            catalogItemId: item.catalogItemId,
            calcMode: item.calcMode || "per_month",
            quantity: normalizeDecimal(item.quantity ?? 1),
            unitPriceOverride: item.unitPriceOverride ?? null,
            isEnabled: item.isEnabled ?? true,
            visibility: item.visibility || "visible",
            notes: item.notes ?? null,
          },
        ])
      );
      costItems.forEach((item: any) => {
        costMap.set(item.catalogItemId, {
          ...item,
          quoteId: id,
          calcMode: item.calcMode || "per_month",
          quantity: normalizeDecimal(item.quantity ?? 1),
          unitPriceOverride: item.unitPriceOverride ?? null,
          isEnabled: item.isEnabled ?? true,
          visibility: item.visibility || "visible",
          notes: item.notes ?? null,
        });
      });
      costDefaults.forEach((item) => {
        if (!costMap.has(item.id)) {
          costMap.set(item.id, {
            quoteId: id,
            catalogItemId: item.id,
            calcMode: "per_month",
            quantity: new Prisma.Decimal(1),
            unitPriceOverride: null,
            isEnabled: true,
            visibility: item.defaultVisibility || "visible",
            notes: null,
          });
        }
      });
      await tx.cpqQuoteCostItem.deleteMany({ where: { quoteId: id } });
      await tx.cpqQuoteCostItem.createMany({
        data: Array.from(costMap.values()).map((item: any) => ({
          quoteId: id,
          catalogItemId: item.catalogItemId,
          calcMode: item.calcMode || "per_month",
          quantity: normalizeDecimal(item.quantity ?? 1),
          unitPriceOverride: item.unitPriceOverride ?? null,
          isEnabled: item.isEnabled ?? true,
          visibility: item.visibility || "visible",
          notes: item.notes ?? null,
        })),
      });

      const mealMap = new Map(
        existingMeals.map((meal) => [
          meal.mealType.toLowerCase(),
          {
            quoteId: id,
            mealType: meal.mealType,
            mealsPerDay: meal.mealsPerDay ?? 0,
            daysOfService: meal.daysOfService ?? 0,
            priceOverride: meal.priceOverride ?? null,
            isEnabled: meal.isEnabled ?? true,
            visibility: meal.visibility || "visible",
          },
        ])
      );
      meals.forEach((meal: any) => {
        mealMap.set(meal.mealType.toLowerCase(), {
          ...meal,
          quoteId: id,
          mealsPerDay: meal.mealsPerDay ?? 0,
          daysOfService: meal.daysOfService ?? 0,
          priceOverride:
            meal.priceOverride === null || meal.priceOverride === undefined
              ? null
              : normalizeDecimal(meal.priceOverride),
          isEnabled: meal.isEnabled ?? true,
          visibility: meal.visibility || "visible",
        });
      });
      mealDefaults.forEach((item) => {
        if (!mealMap.has(item.name.toLowerCase())) {
          mealMap.set(item.name.toLowerCase(), {
            quoteId: id,
            mealType: item.name,
            mealsPerDay: 0,
            daysOfService: 0,
            priceOverride: null,
            isEnabled: true,
            visibility: "visible",
          });
        }
      });
      await tx.cpqQuoteMeal.deleteMany({ where: { quoteId: id } });
      await tx.cpqQuoteMeal.createMany({
        data: Array.from(mealMap.values()).map((meal: any) => ({
          quoteId: id,
          mealType: meal.mealType,
          mealsPerDay: meal.mealsPerDay ?? 0,
          daysOfService: meal.daysOfService ?? 0,
          priceOverride:
            meal.priceOverride === null || meal.priceOverride === undefined
              ? null
              : normalizeDecimal(meal.priceOverride),
          isEnabled: meal.isEnabled ?? true,
          visibility: meal.visibility || "visible",
        })),
      });

      await tx.cpqQuoteVehicle.deleteMany({ where: { quoteId: id } });
      if (vehicles.length) {
        await tx.cpqQuoteVehicle.createMany({
          data: vehicles.map((vehicle: any) => ({
            quoteId: id,
            vehiclesCount: vehicle.vehiclesCount ?? 1,
            rentMonthly: vehicle.rentMonthly ?? 0,
            kmPerDay: vehicle.kmPerDay ?? 0,
            daysPerMonth: vehicle.daysPerMonth ?? 0,
            kmPerLiter: vehicle.kmPerLiter ?? 0,
            fuelPrice: vehicle.fuelPrice ?? 0,
            maintenanceMonthly: vehicle.maintenanceMonthly ?? 0,
            isEnabled: vehicle.isEnabled ?? true,
            visibility: vehicle.visibility || "visible",
          })),
        });
      }

      await tx.cpqQuoteInfrastructure.deleteMany({ where: { quoteId: id } });
      if (infrastructure.length) {
        await tx.cpqQuoteInfrastructure.createMany({
          data: infrastructure.map((infra: any) => ({
            quoteId: id,
            itemType: infra.itemType,
            quantity: infra.quantity ?? 1,
            rentMonthly: infra.rentMonthly ?? 0,
            hasFuel: infra.hasFuel ?? false,
            fuelLitersPerHour: infra.fuelLitersPerHour ?? 0,
            fuelHoursPerDay: infra.fuelHoursPerDay ?? 0,
            fuelDaysPerMonth: infra.fuelDaysPerMonth ?? 0,
            fuelPrice: infra.fuelPrice ?? 0,
            isEnabled: infra.isEnabled ?? true,
            visibility: infra.visibility || "visible",
          })),
        });
      }
    });

    const [totalPositions, summary] = await Promise.all([
      prisma.cpqPosition.count({ where: { quoteId: id } }),
      computeCpqQuoteCosts(id),
    ]);

    await prisma.cpqQuote.update({
      where: { id },
      data: {
        totalPositions,
        totalGuards: summary.totalGuards,
        monthlyCost: summary.monthlyTotal,
      },
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("Error updating CPQ costs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update costs" },
      { status: 500 }
    );
  }
}
