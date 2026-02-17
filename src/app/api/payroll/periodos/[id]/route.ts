/**
 * GET/PATCH /api/payroll/periodos/[id]
 * Period detail and status updates
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;

    const period = await prisma.payrollPeriod.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        _count: {
          select: { liquidaciones: true, attendanceRecords: true, attendanceImports: true },
        },
        liquidaciones: {
          orderBy: { createdAt: "desc" },
          take: 500,
          select: {
            id: true,
            guardiaId: true,
            personaId: true,
            installationId: true,
            salarySource: true,
            attendanceSource: true,
            daysWorked: true,
            grossSalary: true,
            netSalary: true,
            totalDeductions: true,
            employerCost: true,
            status: true,
            createdAt: true,
          },
        },
        attendanceRecords: {
          take: 500,
          select: {
            id: true,
            guardiaId: true,
            source: true,
            daysWorked: true,
            daysAbsent: true,
            daysMedicalLeave: true,
            daysVacation: true,
            normalHours: true,
            overtimeHours50: true,
          },
        },
      },
    });

    if (!period) {
      return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data: period });
  } catch (err: any) {
    console.error("[GET /api/payroll/periodos/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.payrollPeriod.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.status) {
      updateData.status = body.status;
      if (body.status === "CLOSED") updateData.closedAt = new Date();
      if (body.status === "PAID") updateData.paidAt = new Date();
    }
    if (body.notes !== undefined) updateData.notes = body.notes;

    const updated = await prisma.payrollPeriod.update({
      where: { id },
      data: updateData,
    });

    // If marking as PAID, update all DRAFT/APPROVED liquidaciones to PAID
    if (body.status === "PAID") {
      await prisma.payrollLiquidacion.updateMany({
        where: { periodId: id, status: { in: ["DRAFT", "APPROVED"] } },
        data: { status: "PAID", paidAt: new Date() },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (err: any) {
    console.error("[PATCH /api/payroll/periodos/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
