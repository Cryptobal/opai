/**
 * POST /api/payroll/attendance/import/[id]/apply
 * Apply a previously uploaded and parsed attendance import.
 * Creates PayrollAttendanceRecord entries from the import data.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { id } = await params;

    const importRecord = await prisma.payrollAttendanceImport.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!importRecord) {
      return NextResponse.json({ error: "Import no encontrado" }, { status: 404 });
    }
    if (importRecord.status === "APPLIED") {
      return NextResponse.json({ error: "Este import ya fue aplicado" }, { status: 409 });
    }

    const rawData = importRecord.rawData as any;
    if (!rawData?.matched || !Array.isArray(rawData.matched)) {
      return NextResponse.json({ error: "No hay datos matched para aplicar" }, { status: 400 });
    }

    let created = 0;
    let updated = 0;

    for (const m of rawData.matched) {
      const existing = await prisma.payrollAttendanceRecord.findUnique({
        where: {
          guardiaId_year_month: {
            guardiaId: m.guardiaId,
            year: rawData.year,
            month: rawData.month,
          },
        },
      });

      const data = {
        tenantId: ctx.tenantId,
        periodId: importRecord.periodId,
        importId: importRecord.id,
        guardiaId: m.guardiaId,
        source: "IMPORT",
        year: rawData.year,
        month: rawData.month,
        daysWorked: m.daysWorked ?? 0,
        daysAbsent: m.daysAbsent ?? 0,
        daysMedicalLeave: m.daysMedicalLeave ?? 0,
        daysVacation: m.daysVacation ?? 0,
        daysUnpaidLeave: m.daysUnpaidLeave ?? 0,
        totalDaysMonth: m.totalDaysMonth ?? 30,
        scheduledDays: m.scheduledDays ?? 0,
        sundaysWorked: m.sundaysWorked ?? 0,
        sundaysScheduled: m.sundaysScheduled ?? 0,
        normalHours: m.normalHours ?? 0,
        overtimeHours50: m.overtimeHours50 ?? 0,
        overtimeHours100: m.overtimeHours100 ?? 0,
        lateHours: m.lateHours ?? 0,
        dailyDetail: m.dailyDetail ?? null,
      };

      if (existing) {
        await prisma.payrollAttendanceRecord.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        await prisma.payrollAttendanceRecord.create({ data });
        created++;
      }
    }

    // Mark import as applied
    await prisma.payrollAttendanceImport.update({
      where: { id },
      data: { status: "APPLIED" },
    });

    return NextResponse.json({
      data: {
        total: rawData.matched.length,
        created,
        updated,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/payroll/attendance/import/[id]/apply]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
