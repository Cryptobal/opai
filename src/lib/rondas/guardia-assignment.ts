import { prisma } from "@/lib/prisma";
import { startOfDayChile, endOfDayChile, toChileTime } from "./timezone";

type AssignmentSource = "asistencia_actual" | "asistencia_reemplazo" | "asistencia_planificada" | "asignacion_guardia";

export interface GuardiaAssignmentResult {
  guardiaId: string | null;
  source: AssignmentSource | null;
}

/**
 * Check if a scheduled time falls within a shift defined by HH:mm start/end strings.
 * Handles overnight shifts (e.g. 22:00 - 06:00).
 */
function isWithinShift(scheduledAt: Date, shiftStart: string, shiftEnd: string): boolean {
  const scheduled = toChileTime(scheduledAt);
  const schedH = scheduled.getHours() * 60 + scheduled.getMinutes();
  const [startH, startM] = shiftStart.split(":").map(Number);
  const [endH, endM] = shiftEnd.split(":").map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  if (startMin <= endMin) {
    // Day shift (e.g. 08:00 - 20:00)
    return schedH >= startMin && schedH < endMin;
  }
  // Overnight shift (e.g. 22:00 - 06:00)
  return schedH >= startMin || schedH < endMin;
}

export async function resolveOnDutyGuardiaForInstallation(input: {
  tenantId: string;
  installationId: string;
  scheduledAt: Date;
}): Promise<GuardiaAssignmentResult> {
  const dayStart = startOfDayChile(input.scheduledAt);
  const dayEnd = endOfDayChile(input.scheduledAt);

  const attendanceRows = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId: input.tenantId,
      installationId: input.installationId,
      date: { gte: dayStart, lte: dayEnd },
    },
    select: {
      slotNumber: true,
      plannedGuardiaId: true,
      actualGuardiaId: true,
      replacementGuardiaId: true,
      checkInAt: true,
      plannedShiftStart: true,
      plannedShiftEnd: true,
    },
    orderBy: [{ checkInAt: "desc" }, { slotNumber: "asc" }],
  });

  // Filter attendance by shift that covers scheduledAt.
  // Prefer using plannedShiftStart/End when available; fall back to checkIn-based heuristic.
  const scheduledHour = toChileTime(input.scheduledAt).getHours();
  const relevantAttendance = attendanceRows.filter((row) => {
    // Use real shift times if available
    if (row.plannedShiftStart && row.plannedShiftEnd) {
      return isWithinShift(input.scheduledAt, row.plannedShiftStart, row.plannedShiftEnd);
    }
    // Fallback: heuristic based on checkIn time
    if (!row.checkInAt) return false;
    const checkInHour = toChileTime(row.checkInAt).getHours();
    const isNightShift = checkInHour >= 14;
    const isNightRonda = scheduledHour >= 14 || scheduledHour < 6;
    return isNightShift === isNightRonda;
  });

  // Use filtered list, fall back to full list if no match
  const effectiveRows = relevantAttendance.length > 0 ? relevantAttendance : attendanceRows;

  for (const row of effectiveRows) {
    if (row.actualGuardiaId) return { guardiaId: row.actualGuardiaId, source: "asistencia_actual" };
    if (row.replacementGuardiaId) return { guardiaId: row.replacementGuardiaId, source: "asistencia_reemplazo" };
    if (row.plannedGuardiaId) return { guardiaId: row.plannedGuardiaId, source: "asistencia_planificada" };
  }

  const fallback = await prisma.opsAsignacionGuardia.findFirst({
    where: {
      tenantId: input.tenantId,
      installationId: input.installationId,
      isActive: true,
      startDate: { lte: dayEnd },
      OR: [{ endDate: null }, { endDate: { gte: dayStart } }],
    },
    select: { guardiaId: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (!fallback?.guardiaId) {
    console.warn(`[GUARDIA_ASSIGNMENT] No guard found for installation=${input.installationId} at ${input.scheduledAt.toISOString()}`);
    return { guardiaId: null, source: null };
  }
  return { guardiaId: fallback.guardiaId, source: "asignacion_guardia" };
}
