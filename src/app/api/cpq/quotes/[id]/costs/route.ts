/**
 * API Route: /api/cpq/quotes/[id]/costs
 * GET  - Obtener costos y parámetros de cotización
 * PUT  - Reemplazar costos y parámetros
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { isDefaultUniform } from "@/lib/cpq-constants";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

const normalizeDecimal = (value: unknown) => {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(Number(value));
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { tenantId: true, createdFromLeadId: true },
    });
    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }
    const tenantId = quote?.tenantId ?? null;
    const skipDefaultCosts = Boolean(quote?.createdFromLeadId);

    const [
      parameters,
      uniforms,
      exams,
      costItems,
      meals,
      vehicles,
      infrastructure,
      catalogItems,
      additionalLines,
      summary,
    ] = await Promise.all([
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
      prisma.cpqQuoteAdditionalLine.findMany({
        where: { quoteId: id },
        orderBy: { orden: "asc" },
      }),
      computeCpqQuoteCosts(id),
    ]);

    // Merge defaults for UI display (the summary already accounts for them)
    const defaultCatalog = catalogItems.filter((item) => item.isDefault);
    const uniformCatalog = catalogItems.filter((item) => item.type === "uniform");
    const uniformDefaultIds = new Set(
      uniformCatalog.filter((item) => isDefaultUniform(item.name)).map((item) => item.id)
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

    const existingUniformIds = new Set(uniforms.map((item) => item.catalogItemId));
    const existingExamIds = new Set(exams.map((item) => item.catalogItemId));
    const existingCostIds = new Set(costItems.map((item) => item.catalogItemId));
    const existingMealTypes = new Set(meals.map((meal) => meal.mealType.toLowerCase()));

    const defaultUniforms = skipDefaultCosts
      ? []
      : uniformCatalog
          .filter((item) => uniformDefaultIds.has(item.id))
          .filter((item) => !existingUniformIds.has(item.id))
          .map((item) => ({
            quoteId: id,
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
            quoteId: id,
            catalogItemId: item.id,
            unitPriceOverride: null,
            active: true,
            catalogItem: item,
          }));

    const defaultMeals = skipDefaultCosts
      ? []
      : mealDefaults
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

    const defaultCostItems = skipDefaultCosts
      ? []
      : defaultCatalog
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
        additionalLines: additionalLines.map((l) => ({
          id: l.id,
          nombre: l.nombre,
          descripcion: l.descripcion || "",
          precio: Number(l.precio),
          orden: l.orden,
          tipo: l.tipo ?? "servicio",
          recurrencia: l.recurrencia ?? "mensual",
          cantidad: l.cantidad ?? 1,
          marginPct: l.marginPct != null ? Number(l.marginPct) : null,
        })),
        summary,
        skipDefaultCosts,
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
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { tenantId: true, createdFromLeadId: true },
    });
    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }
    const tenantId = quote.tenantId;
    const body = await request.json();

    const parameters = body?.parameters ?? null;
    const uniforms = Array.isArray(body?.uniforms) ? body.uniforms : [];
    const exams = Array.isArray(body?.exams) ? body.exams : [];
    const costItems = Array.isArray(body?.costItems) ? body.costItems : [];
    const meals = Array.isArray(body?.meals) ? body.meals : [];
    const vehicles = Array.isArray(body?.vehicles) ? body.vehicles : [];
    const infrastructure = Array.isArray(body?.infrastructure) ? body.infrastructure : [];
    const additionalLines = Array.isArray(body?.additionalLines) ? body.additionalLines : [];

    await prisma.$transaction(async (tx) => {
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
            financialEnabled: parameters.financialEnabled ?? false,
            financialRatePct: parameters.financialRatePct,
            salePriceBase: parameters.salePriceBase,
            salePriceMonthly: parameters.salePriceMonthly,
            policyEnabled: parameters.policyEnabled,
            policyRatePct: parameters.policyRatePct,
            policyAdminRatePct: parameters.policyAdminRatePct,
            policyContractMonths: parameters.policyContractMonths,
            policyContractPct: parameters.policyContractPct,
            contractMonths: parameters.contractMonths,
            contractAmount: parameters.contractAmount,
            marginPct: parameters.marginPct,
            marginMode: parameters.marginMode ?? "margin_on_sale",
          },
          create: {
            quoteId: id,
            monthlyHoursStandard: parameters.monthlyHoursStandard ?? 180,
            avgStayMonths: parameters.avgStayMonths ?? 4,
            uniformChangesPerYear: parameters.uniformChangesPerYear ?? 3,
            financialEnabled: parameters.financialEnabled ?? false,
            financialRatePct: parameters.financialRatePct ?? 2.5,
            salePriceBase: parameters.salePriceBase ?? 0,
            salePriceMonthly: parameters.salePriceMonthly ?? 0,
            policyEnabled: parameters.policyEnabled ?? false,
            policyRatePct: parameters.policyRatePct ?? 0,
            policyAdminRatePct: parameters.policyAdminRatePct ?? 0,
            policyContractMonths: parameters.policyContractMonths ?? 12,
            policyContractPct: parameters.policyContractPct ?? 20,
            contractMonths: parameters.contractMonths ?? 12,
            contractAmount: parameters.contractAmount ?? 0,
            marginPct: parameters.marginPct ?? 13,
            marginMode: parameters.marginMode ?? "margin_on_sale",
          },
        });
      }

      const existingUniforms = await tx.cpqQuoteUniformItem.findMany({
        where: { quoteId: id },
      });
      const existingExams = await tx.cpqQuoteExamItem.findMany({ where: { quoteId: id } });
      const existingCostItems = await tx.cpqQuoteCostItem.findMany({ where: { quoteId: id } });
      const existingMeals = await tx.cpqQuoteMeal.findMany({ where: { quoteId: id } });

      const uniformCatalogForPut = await tx.cpqCatalogItem.findMany({
        where: {
          OR: [{ tenantId }, { tenantId: null }],
          active: true,
          type: "uniform",
        },
      });
      const uniformDefaults = uniformCatalogForPut.filter((item) => isDefaultUniform(item.name));
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

      const catalogCostItems: any[] = [];
      const inlineCostItems: any[] = [];
      for (const item of costItems) {
        if (item.catalogItemId) {
          catalogCostItems.push(item);
        } else {
          if (!item.customName || !item.customType) continue;
          inlineCostItems.push(item);
        }
      }

      const costMap = new Map(
        existingCostItems
          .filter((item) => item.catalogItemId)
          .map((item) => [
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
              isAmortizable: item.isAmortizable ?? false,
              investmentAmount: item.investmentAmount ?? null,
              amortizationMonths: item.amortizationMonths ?? null,
              customName: item.customName ?? null,
              customType: item.customType ?? null,
              customCategory: item.customCategory ?? null,
            },
          ])
      );
      catalogCostItems.forEach((item: any) => {
        costMap.set(item.catalogItemId, {
          ...item,
          quoteId: id,
          calcMode: item.calcMode || "per_month",
          quantity: normalizeDecimal(item.quantity ?? 1),
          unitPriceOverride: item.unitPriceOverride ?? null,
          isEnabled: item.isEnabled ?? true,
          visibility: item.visibility || "visible",
          notes: item.notes ?? null,
          isAmortizable: item.isAmortizable ?? false,
          investmentAmount: item.investmentAmount ?? null,
          amortizationMonths: item.amortizationMonths ?? null,
          customName: item.customName ?? null,
          customType: item.customType ?? null,
          customCategory: item.customCategory ?? null,
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
            isAmortizable: false,
            investmentAmount: null,
            amortizationMonths: null,
            customName: null,
            customType: null,
            customCategory: null,
          });
        }
      });

      const savedToCatalogItems: any[] = [];
      for (const item of inlineCostItems) {
        if (item.savedToCatalog) {
          const catalogItem = await tx.cpqCatalogItem.create({
            data: {
              tenantId,
              name: String(item.customName).slice(0, 200),
              type: String(item.customType).slice(0, 50),
              unit: item.unit || "mes",
              basePrice: item.unitPriceOverride ?? 0,
              isDefault: false,
              defaultVisibility: item.visibility || "visible",
              active: true,
            },
          });
          savedToCatalogItems.push({ ...item, catalogItemId: catalogItem.id });
        }
      }

      await tx.cpqQuoteCostItem.deleteMany({ where: { quoteId: id } });

      const allCostData = [
        ...Array.from(costMap.values()),
        ...inlineCostItems.filter((i: any) => !i.savedToCatalog),
        ...savedToCatalogItems,
      ];
      if (allCostData.length > 0) {
        await tx.cpqQuoteCostItem.createMany({
          data: allCostData.map((item: any) => ({
            quoteId: id,
            catalogItemId: item.catalogItemId || null,
            calcMode: item.calcMode || "per_month",
            quantity: normalizeDecimal(item.quantity ?? 1),
            unitPriceOverride: item.unitPriceOverride ?? null,
            isEnabled: item.isEnabled ?? true,
            visibility: item.visibility || "visible",
            notes: item.notes ?? null,
            customName: item.customName ? String(item.customName).slice(0, 200) : null,
            customType: item.customType ? String(item.customType).slice(0, 50) : null,
            customCategory: item.customCategory ? String(item.customCategory).slice(0, 50) : null,
            isAmortizable: item.isAmortizable ?? false,
            investmentAmount: item.investmentAmount != null ? normalizeDecimal(item.investmentAmount) : null,
            amortizationMonths: item.amortizationMonths != null ? Number(item.amortizationMonths) : null,
          })),
        });
      }

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

      await tx.cpqQuoteAdditionalLine.deleteMany({ where: { quoteId: id } });
      if (additionalLines.length) {
        await tx.cpqQuoteAdditionalLine.createMany({
          data: additionalLines.map((line: any, idx: number) => ({
            quoteId: id,
            nombre: String(line.nombre || "").slice(0, 200),
            descripcion: line.descripcion || null,
            precio: Number(line.precio) || 0,
            orden: line.orden ?? idx,
            tipo: String(line.tipo || "servicio").slice(0, 30),
            recurrencia: String(line.recurrencia || "mensual").slice(0, 20),
            cantidad: Number(line.cantidad) || 1,
            marginPct: line.marginPct != null ? Number(line.marginPct) : null,
          })),
        });
      }
    }, { timeout: 15000 });

    let summary;
    try {
      const [totalPositions, computedSummary] = await Promise.all([
        prisma.cpqPosition.count({ where: { quoteId: id } }),
        computeCpqQuoteCosts(id),
      ]);
      summary = computedSummary;

      await prisma.cpqQuote.update({
        where: { id },
        data: {
          totalPositions,
          totalGuards: summary.totalGuards,
          monthlyCost: summary.monthlyTotal,
        },
      });
    } catch (computeError: any) {
      console.error("Error computing/updating CPQ quote totals:", computeError?.message, computeError?.code, computeError?.meta);
      // Transaction succeeded but computation failed — return partial success
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({ success: true, data: summary });
  } catch (error: any) {
    console.error("Error updating CPQ costs:", error?.message, error?.code, error?.meta);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to update costs" },
      { status: 500 }
    );
  }
}
