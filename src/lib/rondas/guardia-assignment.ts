import { prisma } from "@/lib/prisma";
import { startOfDayChile, endOfDayChile, toChileTime } from "./timezone";

type AssignmentSource = "asistencia_actual" | "asistencia_reemplazo" | "asistencia_planificada" | "asignacion_guardia";

export interface GuardiaAssignmentResult {
  guardiaId: string | null;
  source: AssignmentSource | null;
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
    },
    orderBy: [{ checkInAt: "desc" }, { slotNumber: "asc" }],
  });

  // Filter attendance by shift that covers scheduledAt
  const scheduledHour = toChileTime(input.scheduledAt).getHours();
  const relevantAttendance = attendanceRows.filter((row) => {
    if (!row.checkInAt) return false;
    const checkInHour = toChileTime(row.checkInAt).getHours();
    // Simple heuristic: day shift = checkIn before 14:00, night shift = checkIn after 14:00
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
