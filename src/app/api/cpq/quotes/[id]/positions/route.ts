/**
 * API Route: /api/cpq/quotes/[id]/positions
 * POST - Crear puesto de trabajo con estructura de servicio
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import { buildCpqStyleEmployerCostInput } from "@/lib/cpq/cpq-employer-cost-input";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";
import { requireTenantModule } from '@/lib/require-module';
import { normalizeWeekdays } from "@/lib/cpq/weekdays";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const {
      puestoTrabajoId,
      customName,
      description,
      weekdays,
      startTime,
      endTime,
      numGuards,
      numPuestos,
      cargoId,
      rolId,
      baseSalary,
      afpName,
      healthSystem,
      healthPlanPct,
    } = body || {};

    if (
      !puestoTrabajoId ||
      !Array.isArray(weekdays) ||
      !startTime ||
      !endTime ||
      !numGuards ||
      !cargoId ||
      !rolId ||
      !baseSalary
    ) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const normalizedWeekdays = normalizeWeekdays(weekdays);
    if (normalizedWeekdays.length === 0) {
      return NextResponse.json(
        { success: false, error: "weekdays must contain at least one valid day" },
        { status: 400 }
      );
    }

    const healthPlan =
      healthSystem === "isapre"
        ? healthPlanPct ?? 0.07
        : 0.07;

    const payroll = await computeEmployerCost(
      buildCpqStyleEmployerCostInput(Number(baseSalary), {
        afpName: afpName || "modelo",
        healthSystem: healthSystem || "fonasa",
        healthPlanPct: healthPlanPct ?? 0.07,
      })
    );

    const employerCost = payroll.monthly_employer_cost_clp;
    const netSalary = payroll.worker_net_salary_estimate;
    const safeNumPuestos = Math.max(1, Number(numPuestos ?? 1));
    const monthlyPositionCost = employerCost * Number(numGuards) * safeNumPuestos;

    const result = await prisma.$transaction(async (tx) => {
      return tx.cpqPosition.create({
        data: {
          quoteId: id,
          puestoTrabajoId,
          customName: customName?.trim() || null,
          description: description?.trim() || null,
          weekdays: normalizedWeekdays,
          startTime,
          endTime,
          numGuards: Number(numGuards),
          numPuestos: safeNumPuestos,
          cargoId,
          rolId,
          baseSalary: Number(baseSalary),
          afpName: afpName || "modelo",
          healthSystem: healthSystem || "fonasa",
          healthPlanPct: healthPlan,
          employerCost,
          netSalary,
          monthlyPositionCost,
          payrollSnapshot: {
            breakdown: payroll.breakdown,
            worker_breakdown_estimate: payroll.worker_breakdown_estimate,
            parameters_snapshot: payroll.parameters_snapshot,
          } as any,
          payrollVersionId: payroll.parameters_snapshot?.version_id || null,
          calculatedAt: new Date(payroll.computed_at),
        },
      });
    });

    await refreshQuoteTotals(id);

    const quote = await prisma.cpqQuote.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { code: true } });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_position_added",
      details: {
        quoteCode: quote?.code ?? null,
        positionId: result.id,
        puestoTrabajoId,
        numGuards: Number(numGuards),
        numPuestos: safeNumPuestos,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("Error creating CPQ position:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create position" },
      { status: 500 }
    );
  }
}
