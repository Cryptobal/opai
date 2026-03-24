import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

/**
 * Calcula el score de rondas para un guardia en un período.
 *
 * Lógica:
 * - Premiar por cantidad y calidad de rondas hechas.
 * - Penalizar proporcionalmente por rondas no hechas, dividiendo entre
 *   los guardias que estaban en turno en esa instalación ese día.
 *
 * Fórmula:
 *   totalResponsabilidad = rondasHechas + Σ(rondasNoHechas / guardiasEnTurno)
 *   tasaCompletitud = rondasHechas / totalResponsabilidad
 *   score = (tasaCompletitud × 0.5 + promedioTrustScore/100 × 0.4 + bonusIncidentes) × 100
 */
export async function calcularScoreRondas(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  // ── 1. Rondas que el guardia efectivamente hizo ──
  const ejecucionesHechas = await prisma.opsRondaEjecucion.findMany({
    where: {
      tenantId,
      guardiaId,
      isAdHoc: false,
      scheduledAt: { gte: fechaInicio, lte: fechaFin },
    },
    select: { status: true, trustScore: true },
  });

  const rondasCompletadas = ejecucionesHechas.filter(
    (e) => e.status === "completada" || e.status === "incompleta",
  ).length;
  const rondasPerfectas = ejecucionesHechas.filter(
    (e) => e.status === "completada" && e.trustScore >= 90,
  ).length;

  const trustScoresCompletadas = ejecucionesHechas
    .filter((e) => e.status === "completada" || e.status === "incompleta")
    .map((e) => e.trustScore);

  const promedioTrustScore =
    trustScoresCompletadas.length > 0
      ? trustScoresCompletadas.reduce((a, b) => a + b, 0) / trustScoresCompletadas.length
      : 0;

  // ── 2. Obtener instalaciones donde el guardia estuvo en turno en el período ──
  const asistencias = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId,
      date: { gte: fechaInicio, lte: fechaFin },
      deletedAt: null,
      OR: [
        { actualGuardiaId: guardiaId },
        { replacementGuardiaId: guardiaId },
        { plannedGuardiaId: guardiaId },
      ],
    },
    select: { installationId: true, date: true },
  });

  if (asistencias.length === 0 && ejecucionesHechas.length === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  // ── 3. Para cada instalación/fecha donde estuvo, calcular rondas no hechas y prorrateo ──
  // Group by installationId + date (ISO date string)
  const instDatePairs = new Map<string, { installationId: string; date: Date }>();
  for (const a of asistencias) {
    const dateKey = a.date.toISOString().slice(0, 10);
    const key = `${a.installationId}|${dateKey}`;
    if (!instDatePairs.has(key)) {
      instDatePairs.set(key, { installationId: a.installationId, date: a.date });
    }
  }

  let rondasNoHechasProrrata = 0;

  for (const { installationId, date } of instDatePairs.values()) {
    // Count all missed scheduled rounds for this installation on this date
    // (no_realizada or cerrada_auto = rounds that nobody completed)
    const rondasNoHechas = await prisma.opsRondaEjecucion.count({
      where: {
        tenantId,
        isAdHoc: false,
        status: { in: ["no_realizada", "cerrada_auto"] },
        scheduledAt: {
          gte: date,
          lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
        },
        rondaTemplate: { installationId },
      },
    });

    if (rondasNoHechas === 0) continue;

    // Count how many guards were on duty at this installation on this date
    const guardiasEnTurno = await prisma.opsAsistenciaDiaria.count({
      where: {
        tenantId,
        installationId,
        date,
        deletedAt: null,
        OR: [
          { actualGuardiaId: { not: null } },
          { replacementGuardiaId: { not: null } },
          { plannedGuardiaId: { not: null } },
        ],
      },
    });

    // Prorate: each guard gets an equal share of the missed rounds
    const effectiveGuards = Math.max(guardiasEnTurno, 1);
    rondasNoHechasProrrata += rondasNoHechas / effectiveGuards;
  }

  // ── 4. Calculate score ──
  const totalResponsabilidad = rondasCompletadas + rondasNoHechasProrrata;

  // If guard was on duty but there were no scheduled rounds at all
  if (totalResponsabilidad === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const tasaCompletitud = rondasCompletadas / totalResponsabilidad;

  const incidentesCount = await prisma.opsRondaIncidente.count({
    where: {
      tenantId,
      guardiaId,
      createdAt: { gte: fechaInicio, lte: fechaFin },
    },
  });

  const bonusIncidentes = Math.min(incidentesCount * 0.02, 0.1);
  const score = Math.min(100, Math.max(0, Math.round(
    (tasaCompletitud * 0.5 + (promedioTrustScore / 100) * 0.4 + bonusIncidentes) * 100,
  )));

  return {
    score,
    detalle: {
      rondasCompletadas,
      rondasPerfectas,
      rondasNoHechasProrrata: Math.round(rondasNoHechasProrrata * 10) / 10,
      totalResponsabilidad: Math.round(totalResponsabilidad * 10) / 10,
      promedioTrustScore: Math.round(promedioTrustScore * 10) / 10,
      tasaCompletitud: Math.round(tasaCompletitud * 100),
      incidentesReportados: incidentesCount,
    },
  };
}
