/**
 * API Route: /api/cpq/quotes/[id]/services
 * GET  - Listar servicios de la cotización (multi-tenant)
 * POST - Crear servicio (opcionalmente con shifts iniciales desde plantilla)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { getCoveragePatternMeta } from "@/lib/cpq/coverage-patterns";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import { buildCpqStyleEmployerCostInput } from "@/lib/cpq/cpq-employer-cost-input";
import { refreshQuoteTotals } from "@/modules/cpq/costing/compute-quote-costs";
import { normalizeWeekdays } from "@/lib/cpq/weekdays";
import { createCrmHistoryLog } from "@/lib/crm-history";

const WEEKDAY_LONG_FROM_SHORT: Record<string, string> = {
  Lun: "lunes",
  Mar: "martes",
  "Mié": "miercoles",
  Jue: "jueves",
  Vie: "viernes",
  "Sáb": "sabado",
  Dom: "domingo",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const mod = await requireTenantModule("cpq");
    if (!mod.authorized) return mod.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!quote) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 });
    }

    const groups = await prisma.cpqServiceGroup.findMany({
      where: { quoteId: id, tenantId: ctx.tenantId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ success: true, data: groups });
  } catch (error) {
    console.error("Error listing CPQ service groups:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list service groups" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const mod = await requireTenantModule("cpq");
    if (!mod.authorized) return mod.response;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await req.json();

    const {
      name,
      coveragePattern = "custom",
      iconName,
      colorHex,
      notes,
      puestoTrabajoId,
      cargoId,
      rolId,
      baseSalary,
      numPuestos = 1,
      skipShifts = false,
    } = body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre del servicio requerido" },
        { status: 400 }
      );
    }

    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, code: true },
    });
    if (!quote) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 });
    }

    const meta = getCoveragePatternMeta(coveragePattern);
    const template = !skipShifts ? meta.template : null;

    if (template && template.positions.length > 0) {
      if (!puestoTrabajoId || !cargoId || !rolId) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Para generar shifts desde plantilla, puestoTrabajoId/cargoId/rolId son requeridos",
          },
          { status: 400 }
        );
      }
    }

    const lastOrder = await prisma.cpqServiceGroup.findFirst({
      where: { quoteId: id, tenantId: ctx.tenantId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });
    const nextOrder = (lastOrder?.displayOrder ?? -1) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.cpqServiceGroup.create({
        data: {
          tenantId: ctx.tenantId,
          quoteId: id,
          name: name.trim(),
          coveragePattern,
          iconName: iconName || null,
          colorHex: colorHex || null,
          notes: notes?.trim() || null,
          displayOrder: nextOrder,
        },
      });

      if (template && template.positions.length > 0) {
        const safeNumPuestos = Math.max(1, Number(numPuestos) || 1);
        for (const pos of template.positions) {
          const weekdays = normalizeWeekdays(
            pos.daysOfWeek.map((d) => WEEKDAY_LONG_FROM_SHORT[d] ?? d.toLowerCase())
          );
          const payroll = await computeEmployerCost(
            buildCpqStyleEmployerCostInput(Number(baseSalary ?? pos.baseSalary), {
              afpName: "modelo",
              healthSystem: "fonasa",
              healthPlanPct: 0.07,
            })
          );
          await tx.cpqPosition.create({
            data: {
              quoteId: id,
              serviceGroupId: group.id,
              puestoTrabajoId,
              cargoId,
              rolId,
              customName: null,
              description: pos.description ?? null,
              weekdays,
              startTime: pos.shiftStart,
              endTime: pos.shiftEnd,
              numGuards: pos.guardsCount,
              numPuestos: safeNumPuestos,
              baseSalary: Number(baseSalary ?? pos.baseSalary),
              afpName: "modelo",
              healthSystem: "fonasa",
              healthPlanPct: 0.07,
              employerCost: payroll.monthly_employer_cost_clp,
              netSalary: payroll.worker_net_salary_estimate,
              monthlyPositionCost:
                payroll.monthly_employer_cost_clp * pos.guardsCount * safeNumPuestos,
              payrollSnapshot: {
                breakdown: payroll.breakdown,
                worker_breakdown_estimate: payroll.worker_breakdown_estimate,
                parameters_snapshot: payroll.parameters_snapshot,
              } as any,
              payrollVersionId: payroll.parameters_snapshot?.version_id || null,
              calculatedAt: new Date(payroll.computed_at),
            },
          });
        }
      }
      return group;
    });

    await refreshQuoteTotals(id);
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_service_group_added",
      details: {
        quoteCode: quote.code,
        serviceGroupId: created.id,
        name: created.name,
        coveragePattern,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error("Error creating CPQ service group:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create service group" },
      { status: 500 }
    );
  }
}
