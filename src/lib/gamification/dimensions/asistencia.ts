import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreAsistencia(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const asistencias = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      OR: [{ actualGuardiaId: guardiaId }, { plannedGuardiaId: guardiaId }],
      date: { gte: fechaInicio, lte: fechaFin },
    },
    select: {
      attendanceStatus: true,
      checkInAt: true,
      lateMinutes: true,
    },
  });

  if (asistencias.length === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const diasProgramados = asistencias.length;
  const diasAsistidos = asistencias.filter(
    (a) => a.attendanceStatus !== "pendiente" && a.checkInAt != null,
  ).length;
  const tardanzas = asistencias.filter((a) => a.lateMinutes > 0).length;

  const inasistenciasInjust = await prisma.opsGuardEvent.count({
    where: {
      tenantId,
      guardiaId,
      category: "ausencia",
      subtype: { notIn: ["vacaciones", "licencia_medica", "permiso"] },
      startDate: { gte: fechaInicio, lte: fechaFin },
    },
  });

  const turnosExtra = await prisma.opsTurnoExtra.count({
    where: {
      tenantId,
      guardiaId,
      status: "approved",
      date: { gte: fechaInicio, lte: fechaFin },
    },
  });

  const tasaAsistencia = diasAsistidos / diasProgramados;
  const penalTardanza = (tardanzas / diasProgramados) * 0.3;
  const penalInasistencia = inasistenciasInjust * 0.15;
  const bonusTurnoExtra = Math.min(turnosExtra * 0.05, 0.15);

  const score = Math.min(100, Math.max(0, Math.round(
    (tasaAsistencia - penalTardanza - penalInasistencia + bonusTurnoExtra) * 100,
  )));

  return {
    score,
    detalle: {
      diasProgramados,
      diasAsistidos,
      tardanzas,
      inasistenciasInjustificadas: inasistenciasInjust,
      turnosExtra,
      tasaAsistencia: Math.round(tasaAsistencia * 100),
    },
  };
}
