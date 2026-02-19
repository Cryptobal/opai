/**
 * Resolve monthly attendance for a guard from OPAI internal modules.
 * Reads from OpsAsistenciaDiaria + OpsPautaMensual to build a consolidated record.
 */

import { prisma } from "@/lib/prisma";

export interface MonthlyAttendance {
  source: "OPAI" | "IMPORT";
  guardiaId: string;
  year: number;
  month: number;
  daysWorked: number;
  daysAbsent: number;
  daysMedicalLeave: number;
  daysVacation: number;
  daysUnpaidLeave: number;
  totalDaysMonth: number;
  scheduledDays: number;
  sundaysWorked: number;
  sundaysScheduled: number;
  normalHours: number;
  overtimeHours50: number;
  overtimeHours100: number;
  lateHours: number;
  dailyDetail: Array<{
    date: string;
    code: string;
    checkIn?: string | null;
    checkOut?: string | null;
  }>;
}

/**
 * Resolve attendance from OPAI internal system for a single guard in a given month.
 */
export async function resolveMonthlyAttendance(
  guardiaId: string,
  year: number,
  month: number
): Promise<MonthlyAttendance> {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0)); // last day of month
  const totalDaysMonth = endDate.getUTCDate();

  // Get all pauta entries for this guard in the month
  const pautaEntries = await prisma.opsPautaMensual.findMany({
    where: {
      plannedGuardiaId: guardiaId,
      date: { gte: startDate, lte: endDate },
    },
    select: {
      date: true,
      shiftCode: true,
      puestoId: true,
      slotNumber: true,
    },
    orderBy: { date: "asc" },
  });

  // Get all asistencia entries for this guard in the month
  const asistenciaEntries = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
      OR: [
        { plannedGuardiaId: guardiaId },
        { actualGuardiaId: guardiaId },
      ],
    },
    select: {
      date: true,
      attendanceStatus: true,
      checkInAt: true,
      checkOutAt: true,
      plannedGuardiaId: true,
      actualGuardiaId: true,
      replacementGuardiaId: true,
      puestoId: true,
      slotNumber: true,
    },
    orderBy: { date: "asc" },
  });

  // Get turnos extra where this guard was the replacement (overtime hours)
  const turnosExtra = await prisma.opsTurnoExtra.findMany({
    where: {
      guardiaId: guardiaId,
      date: { gte: startDate, lte: endDate },
    },
    select: {
      date: true,
      status: true,
    },
  });

  // Build daily detail
  const dailyDetail: MonthlyAttendance["dailyDetail"] = [];
  let daysWorked = 0;
  let daysAbsent = 0;
  let daysMedicalLeave = 0;
  let daysVacation = 0;
  let daysUnpaidLeave = 0;
  let scheduledDays = 0;
  let sundaysWorked = 0;
  let sundaysScheduled = 0;
  let normalHours = 0;
  let lateHours = 0;

  // Create a map of pauta entries by date
  const pautaByDate = new Map<string, typeof pautaEntries[0]>();
  for (const p of pautaEntries) {
    const dateKey = p.date.toISOString().slice(0, 10);
    pautaByDate.set(dateKey, p);
  }

  // Create a map of asistencia entries by date
  const asistByDate = new Map<string, typeof asistenciaEntries[0]>();
  for (const a of asistenciaEntries) {
    const dateKey = a.date.toISOString().slice(0, 10);
    asistByDate.set(dateKey, a);
  }

  for (let day = 1; day <= totalDaysMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const dateStr = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getUTCDay(); // 0 = Sunday
    const isSunday = dayOfWeek === 0;

    const pauta = pautaByDate.get(dateStr);
    const asist = asistByDate.get(dateStr);

    let code = "-"; // default: no aplica

    if (pauta) {
      const sc = pauta.shiftCode;
      if (sc === "T") {
        scheduledDays++;
        if (isSunday) sundaysScheduled++;

        if (asist) {
          if (asist.attendanceStatus === "asistio" || asist.actualGuardiaId === guardiaId) {
            code = "AS";
            daysWorked++;
            if (isSunday) sundaysWorked++;

            // Calculate hours from check-in/out
            if (asist.checkInAt && asist.checkOutAt) {
              const diff = (asist.checkOutAt.getTime() - asist.checkInAt.getTime()) / (1000 * 60 * 60);
              normalHours += Math.max(0, diff - 1); // subtract 1h for colación
            }
          } else if (asist.attendanceStatus === "no_asistio") {
            code = "F";
            daysAbsent++;
          } else if (asist.attendanceStatus === "reemplazo" && asist.replacementGuardiaId === guardiaId) {
            code = "AS";
            daysWorked++;
            if (isSunday) sundaysWorked++;
          } else if (asist.attendanceStatus === "pendiente") {
            // If date has passed and still pending, treat as absent
            if (date < new Date()) {
              code = "SC"; // sin controlar
            } else {
              code = "-";
            }
          } else {
            code = "+"; // descanso or other
          }
        } else {
          // Scheduled but no asistencia record - probably not yet created
          if (date < new Date()) {
            code = "SC";
          } else {
            code = "-";
          }
        }
      } else if (sc === "V") {
        code = "V1";
        daysVacation++;
      } else if (sc === "L") {
        code = "LME";
        daysMedicalLeave++;
      } else if (sc === "P") {
        code = "P1";
        daysUnpaidLeave++;
      } else {
        code = "+"; // descanso
      }
    } else {
      // No pauta entry - check if guard worked as replacement via turno extra
      if (asist && asist.actualGuardiaId === guardiaId) {
        code = "AS";
        daysWorked++;
      } else {
        code = "-";
      }
    }

    dailyDetail.push({
      date: dateStr,
      code,
      checkIn: asist?.checkInAt?.toISOString() ?? null,
      checkOut: asist?.checkOutAt?.toISOString() ?? null,
    });
  }

  // Overtime: count turnos extra as overtime hours (each TE = approximately 12h or shift length)
  const overtimeHours100 = turnosExtra.filter((te) => te.status !== "cancelled").length * 12;

  return {
    source: "OPAI",
    guardiaId,
    year,
    month,
    daysWorked,
    daysAbsent,
    daysMedicalLeave,
    daysVacation,
    daysUnpaidLeave,
    totalDaysMonth,
    scheduledDays,
    sundaysWorked,
    sundaysScheduled,
    normalHours: Math.round(normalHours * 100) / 100,
    overtimeHours50: 0,
    overtimeHours100,
    lateHours: Math.round(lateHours * 100) / 100,
    dailyDetail,
  };
}

/**
 * Resolve attendance for ALL active guards in a given month.
 */
export async function resolveAllMonthlyAttendance(
  tenantId: string,
  year: number,
  month: number
): Promise<MonthlyAttendance[]> {
  // Get all active guards with active assignments
  const guards = await prisma.opsGuardia.findMany({
    where: {
      tenantId,
      status: "active",
      asignaciones: {
        some: { isActive: true },
      },
    },
    select: { id: true },
  });

  const results: MonthlyAttendance[] = [];
  for (const g of guards) {
    const attendance = await resolveMonthlyAttendance(g.id, year, month);
    results.push(attendance);
  }

  return results;
}
