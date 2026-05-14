/**
 * Servicio compartido: clonar cotización CPQ (usado por API y por tools del asistente IA).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { syncCrmDealQuoteLink } from "@/lib/crm-sync-quote-deal-link";

export type CloneCpqQuoteResult = {
  id: string;
  code: string;
  tenantId: string;
  dealId: string | null;
};

export async function cloneCpqQuote(opts: {
  tenantId: string;
  /** ID cotización fuente */
  sourceQuoteId: string;
  /** Opcional — si se omite, se usa `{nombre original} (copia)` igual que antes */
  overrideName?: string | null;
  createdBy?: string | null;
}): Promise<CloneCpqQuoteResult> {
  const { tenantId, sourceQuoteId, overrideName } = opts;

  const source = await prisma.cpqQuote.findFirst({
    where: { id: sourceQuoteId, tenantId },
    include: {
      positions: true,
      parameters: true,
      uniformItems: true,
      examItems: true,
      costItems: true,
      meals: true,
      vehicles: true,
      infrastructure: true,
      additionalLines: true,
    },
  });

  if (!source) {
    throw new Error("QUOTE_NOT_FOUND");
  }

  const year = new Date().getFullYear();
  let code = "";
  for (let attempt = 1; attempt <= 10; attempt++) {
    const count = await prisma.cpqQuote.count({ where: { tenantId } });
    const candidate = `CPQ-${year}-${String(count + attempt).padStart(3, "0")}`;
    const exists = await prisma.cpqQuote.findFirst({ where: { code: candidate } });
    if (!exists) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    throw new Error("QUOTE_CODE_UNAVAILABLE");
  }

  const clonedName =
    typeof overrideName === "string" && overrideName.trim()
      ? overrideName.trim()
      : source.name
        ? `${source.name} (copia)`
        : null;

  const cloned = await prisma.$transaction(async (tx) => {
    const newQuote = await tx.cpqQuote.create({
      data: {
        tenantId,
        code,
        name: clonedName,
        status: "draft",
        clientName: source.clientName,
        validUntil: source.validUntil,
        notes: source.notes,
        totalPositions: source.totalPositions,
        totalGuards: source.totalGuards,
        monthlyCost: source.monthlyCost,
        currency: source.currency,
        accountId: source.accountId,
        contactId: source.contactId,
        dealId: source.dealId,
        installationId: source.installationId,
        aiDescription: source.aiDescription,
        serviceDetail: source.serviceDetail,
      },
    });

    if (source.parameters) {
      await tx.cpqQuoteParameters.create({
        data: {
          quoteId: newQuote.id,
          monthlyHoursStandard: source.parameters.monthlyHoursStandard,
          avgStayMonths: source.parameters.avgStayMonths,
          uniformChangesPerYear: source.parameters.uniformChangesPerYear,
          financialRatePct: source.parameters.financialRatePct,
          salePriceMonthly: source.parameters.salePriceMonthly,
          policyRatePct: source.parameters.policyRatePct,
          policyAdminRatePct: source.parameters.policyAdminRatePct,
          policyContractMonths: source.parameters.policyContractMonths,
          policyContractPct: source.parameters.policyContractPct,
          contractMonths: source.parameters.contractMonths,
          contractAmount: source.parameters.contractAmount,
          marginPct: source.parameters.marginPct,
        },
      });
    }

    if (source.positions.length) {
      await tx.cpqPosition.createMany({
        data: source.positions.map((position) => ({
          quoteId: newQuote.id,
          puestoTrabajoId: position.puestoTrabajoId,
          customName: position.customName,
          description: position.description,
          weekdays: position.weekdays,
          startTime: position.startTime,
          endTime: position.endTime,
          numGuards: position.numGuards,
          numPuestos: position.numPuestos,
          cargoId: position.cargoId,
          rolId: position.rolId,
          baseSalary: position.baseSalary,
          afpName: position.afpName,
          healthSystem: position.healthSystem,
          healthPlanPct: position.healthPlanPct,
          employerCost: position.employerCost,
          netSalary: position.netSalary,
          monthlyPositionCost: position.monthlyPositionCost,
          payrollSnapshot:
            position.payrollSnapshot === null || position.payrollSnapshot === undefined
              ? Prisma.DbNull
              : position.payrollSnapshot,
          payrollVersionId: position.payrollVersionId,
          calculatedAt: position.calculatedAt,
        })),
      });
    }

    if (source.uniformItems.length) {
      await tx.cpqQuoteUniformItem.createMany({
        data: source.uniformItems.map((item) => ({
          quoteId: newQuote.id,
          catalogItemId: item.catalogItemId,
          unitPriceOverride: item.unitPriceOverride,
          priceLogic: item.priceLogic ?? "uniform",
          active: item.active,
        })),
      });
    }

    if (source.examItems.length) {
      await tx.cpqQuoteExamItem.createMany({
        data: source.examItems.map((item) => ({
          quoteId: newQuote.id,
          catalogItemId: item.catalogItemId,
          unitPriceOverride: item.unitPriceOverride,
          active: item.active,
        })),
      });
    }

    if (source.costItems.length) {
      await tx.cpqQuoteCostItem.createMany({
        data: source.costItems.map((item) => ({
          quoteId: newQuote.id,
          catalogItemId: item.catalogItemId,
          customName: item.customName,
          customType: item.customType,
          customCategory: item.customCategory,
          calcMode: item.calcMode,
          quantity: item.quantity,
          unitPriceOverride: item.unitPriceOverride,
          isEnabled: item.isEnabled,
          visibility: item.visibility,
          notes: item.notes,
        })),
      });
    }

    if (source.meals.length) {
      await tx.cpqQuoteMeal.createMany({
        data: source.meals.map((meal) => ({
          quoteId: newQuote.id,
          mealType: meal.mealType,
          mealsPerDay: meal.mealsPerDay,
          daysOfService: meal.daysOfService,
          priceOverride: meal.priceOverride,
          isEnabled: meal.isEnabled,
          visibility: meal.visibility,
        })),
      });
    }

    if (source.vehicles.length) {
      await tx.cpqQuoteVehicle.createMany({
        data: source.vehicles.map((vehicle) => ({
          quoteId: newQuote.id,
          vehiclesCount: vehicle.vehiclesCount,
          rentMonthly: vehicle.rentMonthly,
          kmPerDay: vehicle.kmPerDay,
          daysPerMonth: vehicle.daysPerMonth,
          kmPerLiter: vehicle.kmPerLiter,
          fuelPrice: vehicle.fuelPrice,
          maintenanceMonthly: vehicle.maintenanceMonthly,
          isEnabled: vehicle.isEnabled,
          visibility: vehicle.visibility,
        })),
      });
    }

    if (source.infrastructure.length) {
      await tx.cpqQuoteInfrastructure.createMany({
        data: source.infrastructure.map((infra) => ({
          quoteId: newQuote.id,
          itemType: infra.itemType,
          quantity: infra.quantity,
          rentMonthly: infra.rentMonthly,
          hasFuel: infra.hasFuel,
          fuelLitersPerHour: infra.fuelLitersPerHour,
          fuelHoursPerDay: infra.fuelHoursPerDay,
          fuelDaysPerMonth: infra.fuelDaysPerMonth,
          fuelPrice: infra.fuelPrice,
          isEnabled: infra.isEnabled,
          visibility: infra.visibility,
        })),
      });
    }

    if (source.additionalLines.length) {
      await tx.cpqQuoteAdditionalLine.createMany({
        data: source.additionalLines.map((line) => ({
          quoteId: newQuote.id,
          nombre: line.nombre,
          descripcion: line.descripcion,
          precio: line.precio,
          orden: line.orden,
        })),
      });
    }

    if (newQuote.dealId) {
      await syncCrmDealQuoteLink(tx, {
        tenantId,
        quoteId: newQuote.id,
        dealId: newQuote.dealId,
      });
    }

    return newQuote;
  });

  await createCrmHistoryLog({
    tenantId,
    entityType: "quote",
    entityId: cloned.id,
    action: "quote_cloned",
    details: {
      code: cloned.code,
      sourceQuoteId,
      sourceCode: source.code,
    },
    createdBy: opts.createdBy ?? null,
  });

  return { id: cloned.id, code: cloned.code, tenantId: cloned.tenantId, dealId: cloned.dealId };
}
