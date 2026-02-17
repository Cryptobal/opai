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
            breakdown: true,
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

    // Enrich with guard names and RUTs
    const allGuardIds = new Set<string>();
    period.liquidaciones.forEach((l) => allGuardIds.add(l.guardiaId));
    period.attendanceRecords.forEach((r) => allGuardIds.add(r.guardiaId));

    const guardNames = allGuardIds.size > 0
      ? await prisma.opsGuardia.findMany({
          where: { id: { in: [...allGuardIds] } },
          select: {
            id: true,
            persona: { select: { rut: true, firstName: true, lastName: true } },
          },
        })
      : [];

    const guardMap = new Map(guardNames.map((g) => [
      g.id,
      { rut: g.persona.rut || "", name: `${g.persona.firstName} ${g.persona.lastName}` },
    ]));

    const enrichedLiquidaciones = period.liquidaciones.map((l) => ({
      ...l,
      guardiaRut: guardMap.get(l.guardiaId)?.rut || "",
      guardiaName: guardMap.get(l.guardiaId)?.name || "",
    }));

    const enrichedAttendance = period.attendanceRecords.map((r) => ({
      ...r,
      guardiaRut: guardMap.get(r.guardiaId)?.rut || "",
      guardiaName: guardMap.get(r.guardiaId)?.name || "",
    }));

    return NextResponse.json({
      data: {
        ...period,
        liquidaciones: enrichedLiquidaciones,
        attendanceRecords: enrichedAttendance,
      },
    });
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

    // If reopening (PAID -> OPEN), revert liquidaciones to DRAFT
    if (body.status === "OPEN" && existing.status === "PAID") {
      await prisma.payrollLiquidacion.updateMany({
        where: { periodId: id, status: "PAID" },
        data: { status: "DRAFT", paidAt: null },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (err: any) {
    console.error("[PATCH /api/payroll/periodos/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;

    const existing = await prisma.payrollPeriod.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    }
    if (existing.status === "PAID") {
      return NextResponse.json(
        { error: "No se puede eliminar un período pagado. Primero reabre el período." },
        { status: 400 }
      );
    }

    // Delete in order: liquidaciones, attendance records, attendance imports, then period
    // Cascade should handle most, but be explicit
    await prisma.payrollLiquidacion.deleteMany({ where: { periodId: id } });
    await prisma.payrollAttendanceRecord.deleteMany({ where: { periodId: id } });
    await prisma.payrollAttendanceImport.deleteMany({ where: { periodId: id } });
    await prisma.payrollAnticipoProcess.deleteMany({ where: { periodId: id } });
    await prisma.payrollPeriod.delete({ where: { id } });

    return NextResponse.json({ data: { deleted: true } });
  } catch (err: any) {
    console.error("[DELETE /api/payroll/periodos/[id]]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
