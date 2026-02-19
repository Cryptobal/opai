/**
 * API Route: /api/cpq/quotes/[id]/clone
 * POST - Clonar cotización CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const source = await prisma.cpqQuote.findFirst({
      where: { id, tenantId },
      include: {
        positions: true,
        parameters: true,
        uniformItems: true,
        examItems: true,
        costItems: true,
        meals: true,
        vehicles: true,
        infrastructure: true,
      },
    });

    if (!source) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }

    const count = await prisma.cpqQuote.count({ where: { tenantId } });
    const year = new Date().getFullYear();
    const code = `CPQ-${year}-${String(count + 1).padStart(3, "0")}`;

    const cloned = await prisma.$transaction(async (tx) => {
      const newQuote = await tx.cpqQuote.create({
        data: {
          tenantId,
          code,
          status: "draft",
          clientName: source.clientName,
          validUntil: source.validUntil,
          notes: source.notes,
          totalPositions: source.totalPositions,
          totalGuards: source.totalGuards,
          monthlyCost: source.monthlyCost,
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

      return newQuote;
    });

    return NextResponse.json({ success: true, data: cloned }, { status: 201 });
  } catch (error) {
    console.error("Error cloning CPQ quote:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clone quote" },
      { status: 500 }
    );
  }
}
