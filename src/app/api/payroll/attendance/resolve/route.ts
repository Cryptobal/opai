/**
 * POST /api/payroll/attendance/resolve
 * Consolidates attendance from OPAI internal system for a period.
 * Creates PayrollAttendanceRecord entries for all active guards.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { resolveAllMonthlyAttendance } from "@/lib/payroll/resolve-attendance";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const { periodId } = await req.json();
    if (!periodId) {
      return NextResponse.json({ error: "periodId requerido" }, { status: 400 });
    }

    const period = await prisma.payrollPeriod.findFirst({
      where: { id: periodId, tenantId: ctx.tenantId },
    });
    if (!period) {
      return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    }

    // Resolve attendance from OPAI
    const attendanceList = await resolveAllMonthlyAttendance(ctx.tenantId, period.year, period.month);

    // Upsert attendance records
    let created = 0;
    let updated = 0;

    for (const att of attendanceList) {
      const existing = await prisma.payrollAttendanceRecord.findUnique({
        where: {
          guardiaId_year_month: {
            guardiaId: att.guardiaId,
            year: att.year,
            month: att.month,
          },
        },
      });

      const data = {
        tenantId: ctx.tenantId,
        periodId,
        guardiaId: att.guardiaId,
        source: "OPAI",
        year: att.year,
        month: att.month,
        daysWorked: att.daysWorked,
        daysAbsent: att.daysAbsent,
        daysMedicalLeave: att.daysMedicalLeave,
        daysVacation: att.daysVacation,
        daysUnpaidLeave: att.daysUnpaidLeave,
        totalDaysMonth: att.totalDaysMonth,
        scheduledDays: att.scheduledDays,
        sundaysWorked: att.sundaysWorked,
        sundaysScheduled: att.sundaysScheduled,
        normalHours: att.normalHours,
        overtimeHours50: att.overtimeHours50,
        overtimeHours100: att.overtimeHours100,
        lateHours: att.lateHours,
        dailyDetail: att.dailyDetail as any,
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

    return NextResponse.json({
      data: {
        total: attendanceList.length,
        created,
        updated,
      },
    });
  } catch (err: any) {
    console.error("[POST /api/payroll/attendance/resolve]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
