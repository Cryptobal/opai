/**
 * Avisos no bloqueantes Art. 45.2 al guardar pauta / turno.
 */

import { prisma } from "@/lib/prisma";
import { getJornadaLimits } from "@/lib/dt/jornada-config";
import {
  evaluateShiftAgainstLimits,
  hoursFromShift,
  type JornadaWarning,
} from "@/lib/marcacion-jornada-warnings";

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function weekBoundsUtc(date: Date): { start: Date; end: Date } {
  const d = utcDateOnly(date);
  const dow = d.getUTCDay(); // 0=dom
  const mondayDelta = dow === 0 ? -6 : 1 - dow;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() + mondayDelta);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

export async function warningsForPautaAssignment(params: {
  tenantId: string;
  puestoId: string;
  plannedGuardiaId?: string | null;
  date: Date;
  shiftCode?: string | null;
}): Promise<JornadaWarning[]> {
  if (!params.plannedGuardiaId || params.shiftCode !== "T") return [];

  const puesto = await prisma.opsPuestoOperativo.findFirst({
    where: { id: params.puestoId, tenantId: params.tenantId },
    select: { shiftStart: true, shiftEnd: true },
  });
  if (!puesto) return [];

  const { start, end } = weekBoundsUtc(params.date);
  const weekRows = await prisma.opsPautaMensual.findMany({
    where: {
      tenantId: params.tenantId,
      plannedGuardiaId: params.plannedGuardiaId,
      shiftCode: "T",
      date: { gte: start, lte: end },
    },
    select: {
      date: true,
      puesto: { select: { shiftStart: true, shiftEnd: true } },
    },
  });

  const key = utcDateOnly(params.date).toISOString().slice(0, 10);
  let weeklyHours = 0;
  let sawToday = false;
  for (const row of weekRows) {
    const rowKey = utcDateOnly(row.date).toISOString().slice(0, 10);
    if (rowKey === key) {
      sawToday = true;
      weeklyHours += hoursFromShift(puesto.shiftStart, puesto.shiftEnd);
    } else {
      weeklyHours += hoursFromShift(row.puesto.shiftStart, row.puesto.shiftEnd);
    }
  }
  if (!sawToday) {
    weeklyHours += hoursFromShift(puesto.shiftStart, puesto.shiftEnd);
  }

  const limits = await getJornadaLimits(params.tenantId, params.date);
  return evaluateShiftAgainstLimits({
    shiftStart: puesto.shiftStart,
    shiftEnd: puesto.shiftEnd,
    weeklyHours,
    limits,
  });
}
