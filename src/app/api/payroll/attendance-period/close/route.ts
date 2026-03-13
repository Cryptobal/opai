/**
 * POST /api/payroll/attendance-period/close
 * Calculates attendance summary and locks the period.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, ensureModuleAccess, parseBody } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CloseSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureModuleAccess(ctx, "payroll");
    if (forbidden) return forbidden;

    const parsed = await parseBody(req, CloseSchema);
    if (parsed.error) return parsed.error;
    const { year, month } = parsed.data;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const pautaRows = await prisma.opsPautaMensual.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: startDate, lte: endDate },
        shiftCode: "T",
      },
      select: {
        plannedGuardiaId: true,
        replacementGuardiaId: true,
        date: true,
        status: true,
      },
    });

    const guardiaScheduledDays = new Map<string, Set<string>>();
    for (const row of pautaRows) {
      const gid = row.replacementGuardiaId ?? row.plannedGuardiaId;
      if (!gid) continue;
      const dateKey = row.date.toISOString().slice(0, 10);
      if (!guardiaScheduledDays.has(gid)) guardiaScheduledDays.set(gid, new Set());
      guardiaScheduledDays.get(gid)!.add(dateKey);
    }

    const allGuardiaIds = [...guardiaScheduledDays.keys()];

    const asistenciaRows = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        tenantId: ctx.tenantId,
        date: { gte: startDate, lte: endDate },
        deletedAt: null,
        OR: [
          { plannedGuardiaId: { in: allGuardiaIds } },
          { actualGuardiaId: { in: allGuardiaIds } },
        ],
      },
      select: {
        plannedGuardiaId: true,
        actualGuardiaId: true,
        date: true,
        attendanceStatus: true,
        marcacionEntradaId: true,
        marcacionSalidaId: true,
      },
    });

    type AsistRow = (typeof asistenciaRows)[number];
    const asistByGuardiaDate = new Map<string, AsistRow>();
    for (const row of asistenciaRows) {
      const gid = row.actualGuardiaId ?? row.plannedGuardiaId;
      if (!gid) continue;
      const dateKey = row.date.toISOString().slice(0, 10);
      asistByGuardiaDate.set(`${gid}|${dateKey}`, row);
    }

    let completos = 0;
    let parciales = 0;
    let sinMarcacion = 0;
    const discrepancias: Array<{
      guardiaId: string;
      date: string;
      tipo: string;
      detalle: string;
    }> = [];

    for (const [guardiaId, scheduledDates] of guardiaScheduledDays) {
      let daysWithFullMark = 0;
      let daysWithPartialMark = 0;
      let daysWithNoMark = 0;

      for (const dateKey of scheduledDates) {
        const asist = asistByGuardiaDate.get(`${guardiaId}|${dateKey}`);
        const hasEntrada = !!asist?.marcacionEntradaId;
        const hasSalida = !!asist?.marcacionSalidaId;

        if (hasEntrada && hasSalida) {
          daysWithFullMark++;
        } else if (hasEntrada || hasSalida) {
          daysWithPartialMark++;
        } else {
          daysWithNoMark++;
        }

        const pautaSaysWorked =
          asist?.attendanceStatus === "asistio" ||
          asist?.attendanceStatus === "reemplazo";
        const hasMarcacion = hasEntrada || hasSalida;

        if (pautaSaysWorked && !hasMarcacion) {
          discrepancias.push({
            guardiaId,
            date: dateKey,
            tipo: "pauta_sin_marca",
            detalle: "Pauta indica asistencia pero no hay marcación electrónica",
          });
        }
        if (!pautaSaysWorked && hasMarcacion) {
          discrepancias.push({
            guardiaId,
            date: dateKey,
            tipo: "marca_sin_pauta",
            detalle: "Hay marcación electrónica pero pauta no indica asistencia",
          });
        }
      }

      if (daysWithNoMark === scheduledDates.size) {
        sinMarcacion++;
      } else if (daysWithFullMark === scheduledDates.size) {
        completos++;
      } else {
        parciales++;
      }
    }

    const summary = {
      totalGuardias: allGuardiaIds.length,
      completos,
      parciales,
      sinMarcacion,
      discrepancias: discrepancias.length,
      discrepanciasDetalle: discrepancias.slice(0, 100),
    };

    const record = await prisma.payrollAttendancePeriod.upsert({
      where: {
        tenantId_year_month: {
          tenantId: ctx.tenantId,
          year,
          month,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        year,
        month,
        status: "closed",
        lockedAt: new Date(),
        lockedBy: ctx.userId,
        summary,
      },
      update: {
        status: "closed",
        lockedAt: new Date(),
        lockedBy: ctx.userId,
        summary,
      },
    });

    return NextResponse.json({ data: record });
  } catch (err: any) {
    console.error("[POST /api/payroll/attendance-period/close]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
