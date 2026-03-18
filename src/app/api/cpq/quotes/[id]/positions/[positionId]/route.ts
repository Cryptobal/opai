/**
 * API Route: /api/cpq/quotes/[id]/positions/[positionId]
 * PATCH  - Actualizar puesto y recalcular costos
 * DELETE - Eliminar puesto
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit, requireCpqDelete } from "@/lib/api-auth-cpq";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; positionId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id, positionId } = await params;
    const body = await request.json();

    const current = await prisma.cpqPosition.findFirst({
      where: { id: positionId, quoteId: id },
    });

    if (!current) {
      return NextResponse.json(
        { success: false, error: "Position not found" },
        { status: 404 }
      );
    }

    const updateData: any = {};
    const fields = [
      "puestoTrabajoId",
      "customName",
      "description",
      "weekdays",
      "startTime",
      "endTime",
      "numGuards",
      "numPuestos",
      "cargoId",
      "rolId",
      "baseSalary",
      "afpName",
      "healthSystem",
      "healthPlanPct",
    ];

    for (const field of fields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const nextBaseSalary = Number(updateData.baseSalary ?? current.baseSalary);
    const nextAfpName = updateData.afpName ?? current.afpName;
    const nextHealthSystem = updateData.healthSystem ?? current.healthSystem;
    const nextHealthPlan =
      nextHealthSystem === "isapre"
        ? updateData.healthPlanPct ?? current.healthPlanPct ?? 0.07
        : 0.07;

    const forceRecalculate = body?.forceRecalculate === true;
    const shouldRecalc =
      forceRecalculate ||
      updateData.baseSalary !== undefined ||
      updateData.afpName !== undefined ||
      updateData.healthSystem !== undefined ||
      updateData.healthPlanPct !== undefined ||
      updateData.cargoId !== undefined ||
      updateData.rolId !== undefined;

    let employerCost = Number(current.employerCost);
    let netSalary = current.netSalary ? Number(current.netSalary) : null;
    let payrollSnapshot = current.payrollSnapshot;
    let payrollVersionId = current.payrollVersionId;
    let calculatedAt = current.calculatedAt;

    if (shouldRecalc) {
      const payroll = await computeEmployerCost({
        base_salary_clp: nextBaseSalary,
        contract_type: "indefinite",
        afp_name: nextAfpName,
        health_system: nextHealthSystem,
        health_plan_pct: nextHealthPlan,
        assumptions: {
          include_vacation_provision: true,
          include_severance_provision: true,
          vacation_provision_pct: 0.0833,
          severance_provision_pct: 0.04166,
        },
      });

      employerCost = payroll.monthly_employer_cost_clp;
      netSalary = payroll.worker_net_salary_estimate;
      payrollSnapshot = {
        breakdown: payroll.breakdown,
        worker_breakdown_estimate: payroll.worker_breakdown_estimate,
        parameters_snapshot: payroll.parameters_snapshot,
      } as any;
      payrollVersionId = payroll.parameters_snapshot?.version_id || null;
      calculatedAt = new Date(payroll.computed_at);
    }

    const nextNumGuards = Number(updateData.numGuards ?? current.numGuards);
    const nextNumPuestos = Math.max(1, Number(updateData.numPuestos ?? current.numPuestos ?? 1));
    const monthlyPositionCost = employerCost * nextNumGuards * nextNumPuestos;

    const position = await prisma.cpqPosition.update({
      where: { id: positionId },
      data: {
        ...updateData,
        baseSalary: nextBaseSalary,
        afpName: nextAfpName,
        healthSystem: nextHealthSystem,
        healthPlanPct: nextHealthPlan,
        employerCost,
        netSalary,
        payrollSnapshot,
        payrollVersionId,
        calculatedAt,
        numPuestos: nextNumPuestos,
        monthlyPositionCost,
      },
    });

    await refreshQuoteTotals(id);

    const quote = await prisma.cpqQuote.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { code: true } });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_position_updated",
      details: {
        quoteCode: quote?.code ?? null,
        positionId,
        changedFields: Object.keys(updateData),
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: position });
  } catch (error) {
    console.error("Error updating CPQ position:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update position" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; positionId: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqDelete(ctx);
    if (forbidden) return forbidden;

    const { id, positionId } = await params;
    const existing = await prisma.cpqPosition.findFirst({
      where: { id: positionId, quoteId: id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Position not found" },
        { status: 404 }
      );
    }

    await prisma.cpqPosition.delete({ where: { id: positionId } });
    await refreshQuoteTotals(id);

    const quote = await prisma.cpqQuote.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { code: true } });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_position_deleted",
      details: { quoteCode: quote?.code ?? null, positionId },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting CPQ position:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete position" },
      { status: 500 }
    );
  }
}
