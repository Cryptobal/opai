/**
 * CRON: /api/cron/gamification-calculate
 *
 * Daily gamification score calculation — runs at 2:00 AM Chile time.
 * - Calculates daily trust scores for all active guards
 * - Updates streaks and evaluates badge conditions
 * - Calculates installation and global rankings
 * - On Mondays: weekly scores
 * - On 1st of month: monthly scores + bonus suggestions
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calcularTrustScoreCompuesto,
  calcularRachaActual,
  evaluarBadges,
  calcularRankings,
  getNivelActual,
  generarSugerenciasBono,
} from "@/lib/gamification";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const hoy = new Date(now);
    hoy.setHours(0, 0, 0, 0);

    // Yesterday as the calculation target
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const ayerFin = new Date(hoy);
    ayerFin.setMilliseconds(-1);

    const esLunes = now.getDay() === 1;
    const esPrimeroDeMes = now.getDate() === 1;

    // Get all tenants with active gamification
    const configs = await prisma.gamificacionConfig.findMany({
      where: { moduloActivo: true },
    });

    let totalGuardias = 0;
    let totalScores = 0;
    let totalBadges = 0;

    for (const config of configs) {
      const guardias = await prisma.opsGuardia.findMany({
        where: { tenantId: config.tenantId, status: "active" },
        select: { id: true, currentInstallationId: true },
        take: 5000,
      });

      const periodoHoy = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, "0")}-${String(ayer.getDate()).padStart(2, "0")}`;

      for (const guardia of guardias) {
        try {
          // Daily score
          const score = await calcularTrustScoreCompuesto(
            guardia.id,
            config.tenantId,
            ayer,
            ayerFin,
            config,
          );

          // Streak
          const { rachaActual, mejorRachaHistorica } = await calcularRachaActual(
            guardia.id,
            config.tenantId,
            ayer,
          );

          // Lifetime points for level
          const puntosHistorico = await prisma.gamificacionEvento.aggregate({
            where: { guardiaId: guardia.id, tenantId: config.tenantId, puntos: { gt: 0 } },
            _sum: { puntos: true },
          });
          const puntosAcumulados = puntosHistorico._sum.puntos ?? 0;
          const nivel = getNivelActual(config, puntosAcumulados);

          // Points for yesterday (positive)
          const puntosAyer = await prisma.gamificacionEvento.aggregate({
            where: {
              guardiaId: guardia.id,
              tenantId: config.tenantId,
              fecha: { gte: ayer, lt: hoy },
              puntos: { gt: 0 },
            },
            _sum: { puntos: true },
          });
          const puntosGanados = puntosAyer._sum.puntos ?? 0;

          // Points for yesterday (negative)
          const puntosAyerNeg = await prisma.gamificacionEvento.aggregate({
            where: {
              guardiaId: guardia.id,
              tenantId: config.tenantId,
              fecha: { gte: ayer, lt: hoy },
              puntos: { lt: 0 },
            },
            _sum: { puntos: true },
          });
          const puntosPerdidos = Math.abs(puntosAyerNeg._sum.puntos ?? 0);

          await prisma.gamificacionScoreGuardia.upsert({
            where: {
              guardiaId_periodo_periodoTipo: {
                guardiaId: guardia.id,
                periodo: periodoHoy,
                periodoTipo: "diario",
              },
            },
            update: {
              trustScore: score.trustScore,
              scoreRondas: score.scoreRondas,
              scoreAsistencia: score.scoreAsistencia,
              scoreSistemaDigital: score.scoreSistemaDigital,
              scoreSupervision: score.scoreSupervision,
              scoreCapacitacion: score.scoreCapacitacion,
              detalleRondas: score.detalleRondas as Prisma.InputJsonValue,
              detalleAsistencia: score.detalleAsistencia as Prisma.InputJsonValue,
              detalleSistemaDigital: score.detalleSistemaDigital as Prisma.InputJsonValue,
              detalleSupervision: score.detalleSupervision as Prisma.InputJsonValue,
              detalleCapacitacion: score.detalleCapacitacion as Prisma.InputJsonValue,
              puntosGanados,
              puntosPerdidos,
              puntosNetos: puntosGanados - puntosPerdidos,
              rachaActual,
              mejorRacha: mejorRachaHistorica,
              nivelActual: nivel,
              puntosAcumuladosHistorico: puntosAcumulados,
              calculadoAt: now,
            },
            create: {
              tenantId: config.tenantId,
              guardiaId: guardia.id,
              installationId: guardia.currentInstallationId,
              periodo: periodoHoy,
              periodoTipo: "diario",
              fechaInicio: ayer,
              fechaFin: ayerFin,
              trustScore: score.trustScore,
              scoreRondas: score.scoreRondas,
              scoreAsistencia: score.scoreAsistencia,
              scoreSistemaDigital: score.scoreSistemaDigital,
              scoreSupervision: score.scoreSupervision,
              scoreCapacitacion: score.scoreCapacitacion,
              detalleRondas: score.detalleRondas as Prisma.InputJsonValue,
              detalleAsistencia: score.detalleAsistencia as Prisma.InputJsonValue,
              detalleSistemaDigital: score.detalleSistemaDigital as Prisma.InputJsonValue,
              detalleSupervision: score.detalleSupervision as Prisma.InputJsonValue,
              detalleCapacitacion: score.detalleCapacitacion as Prisma.InputJsonValue,
              puntosGanados,
              puntosPerdidos,
              puntosNetos: puntosGanados - puntosPerdidos,
              rachaActual,
              mejorRacha: mejorRachaHistorica,
              nivelActual: nivel,
              puntosAcumuladosHistorico: puntosAcumulados,
            },
          });

          totalScores++;

          // Evaluate badges
          const newBadges = await evaluarBadges(guardia.id, config.tenantId, config);
          totalBadges += newBadges.length;
        } catch (err) {
          console.error(`[CRON gamificacion] Error guardia ${guardia.id}:`, err);
        }
      }

      totalGuardias += guardias.length;

      // Calculate rankings for today
      await calcularRankings(config.tenantId, periodoHoy, "diario");

      // Weekly score (Monday)
      if (esLunes) {
        const lunesPasado = new Date(ayer);
        lunesPasado.setDate(lunesPasado.getDate() - 6);
        const semana = `${ayer.getFullYear()}-W${String(Math.ceil((ayer.getDate() + new Date(ayer.getFullYear(), ayer.getMonth(), 1).getDay()) / 7)).padStart(2, "0")}`;

        for (const guardia of guardias) {
          try {
            const score = await calcularTrustScoreCompuesto(
              guardia.id, config.tenantId, lunesPasado, ayerFin, config,
            );

            await prisma.gamificacionScoreGuardia.upsert({
              where: {
                guardiaId_periodo_periodoTipo: {
                  guardiaId: guardia.id, periodo: semana, periodoTipo: "semanal",
                },
              },
              update: { trustScore: score.trustScore, calculadoAt: now },
              create: {
                tenantId: config.tenantId,
                guardiaId: guardia.id,
                installationId: guardia.currentInstallationId,
                periodo: semana, periodoTipo: "semanal",
                fechaInicio: lunesPasado, fechaFin: ayerFin,
                trustScore: score.trustScore,
                scoreRondas: score.scoreRondas,
                scoreAsistencia: score.scoreAsistencia,
                scoreSistemaDigital: score.scoreSistemaDigital,
                scoreSupervision: score.scoreSupervision,
                scoreCapacitacion: score.scoreCapacitacion,
              },
            });
          } catch (err) {
            console.error(`[CRON gamificacion] Weekly error guardia ${guardia.id}:`, err);
          }
        }

        await calcularRankings(config.tenantId, semana, "semanal");
      }

      // Monthly score (1st of month)
      if (esPrimeroDeMes) {
        const mesAnteriorInicio = new Date(ayer.getFullYear(), ayer.getMonth(), 1);
        const mesPeriodo = `${mesAnteriorInicio.getFullYear()}-${String(mesAnteriorInicio.getMonth() + 1).padStart(2, "0")}`;

        for (const guardia of guardias) {
          try {
            const score = await calcularTrustScoreCompuesto(
              guardia.id, config.tenantId, mesAnteriorInicio, ayerFin, config,
            );

            await prisma.gamificacionScoreGuardia.upsert({
              where: {
                guardiaId_periodo_periodoTipo: {
                  guardiaId: guardia.id, periodo: mesPeriodo, periodoTipo: "mensual",
                },
              },
              update: { trustScore: score.trustScore, calculadoAt: now },
              create: {
                tenantId: config.tenantId,
                guardiaId: guardia.id,
                installationId: guardia.currentInstallationId,
                periodo: mesPeriodo, periodoTipo: "mensual",
                fechaInicio: mesAnteriorInicio, fechaFin: ayerFin,
                trustScore: score.trustScore,
                scoreRondas: score.scoreRondas,
                scoreAsistencia: score.scoreAsistencia,
                scoreSistemaDigital: score.scoreSistemaDigital,
                scoreSupervision: score.scoreSupervision,
                scoreCapacitacion: score.scoreCapacitacion,
              },
            });
          } catch (err) {
            console.error(`[CRON gamificacion] Monthly error guardia ${guardia.id}:`, err);
          }
        }

        await calcularRankings(config.tenantId, mesPeriodo, "mensual");

        // Generate bonus suggestions for active funds
        const fondosActivos = await prisma.gamificacionFondoPremio.findMany({
          where: { tenantId: config.tenantId, status: "activo", fechaFin: { lt: now } },
        });
        for (const fondo of fondosActivos) {
          await generarSugerenciasBono(config.tenantId, fondo.id);
        }
      }
    }

    // Mark all events as processed
    await prisma.gamificacionEvento.updateMany({
      where: { procesado: false, fecha: { lt: hoy } },
      data: { procesado: true },
    });

    console.log(`[CRON gamificacion] OK: ${configs.length} tenants, ${totalGuardias} guardias, ${totalScores} scores, ${totalBadges} badges`);

    return NextResponse.json({
      success: true,
      data: {
        tenants: configs.length,
        guardias: totalGuardias,
        scores: totalScores,
        badges: totalBadges,
        esLunes,
        esPrimeroDeMes,
        fecha: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("[CRON gamificacion] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
