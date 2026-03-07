import { prisma } from "@/lib/prisma";
import type { GamificacionConfig } from "@prisma/client";
import { registrarEvento } from "./points-engine";

export async function evaluarBadges(
  guardiaId: string,
  tenantId: string,
  config: GamificacionConfig,
): Promise<string[]> {
  const badgesDisponibles = await prisma.gamificacionBadge.findMany({
    where: {
      tenantId,
      activo: true,
      guardiaBadges: { none: { guardiaId } },
    },
  });

  const desbloqueados: string[] = [];

  for (const badge of badgesDisponibles) {
    const cumple = await verificarCondicion(guardiaId, tenantId, badge.condicionTipo, badge.condicionValor);

    if (cumple) {
      await prisma.gamificacionGuardiaBadge.create({
        data: { tenantId, guardiaId, badgeId: badge.id },
      });

      await registrarEvento(
        {
          guardiaId,
          tenantId,
          tipo: "badge_desbloqueado",
          dimension: "bonus",
          descripcion: `Badge desbloqueado: ${badge.nombre}`,
          referenciaModelo: "GamificacionBadge",
          referenciaId: badge.id,
        },
        config,
        badge.puntosBonus,
      );

      desbloqueados.push(badge.id);
    }
  }

  return desbloqueados;
}

async function verificarCondicion(
  guardiaId: string,
  tenantId: string,
  condicionTipo: string,
  condicionValor: number,
): Promise<boolean> {
  switch (condicionTipo) {
    case "racha_dias": {
      const ultimoScore = await prisma.gamificacionScoreGuardia.findFirst({
        where: { guardiaId, tenantId, periodoTipo: "diario" },
        orderBy: { fechaInicio: "desc" },
        select: { rachaActual: true },
      });
      return (ultimoScore?.rachaActual ?? 0) >= condicionValor;
    }

    case "rondas_perfectas":
    case "rondas_perfectas_count": {
      const count = await prisma.opsRondaEjecucion.count({
        where: { guardiaId, tenantId, status: "completada", trustScore: { gte: 90 } },
      });
      return count >= condicionValor;
    }

    case "incidentes_reportados": {
      const count = await prisma.gamificacionEvento.count({
        where: { guardiaId, tenantId, tipo: "incidente_reportado" },
      });
      return count >= condicionValor;
    }

    case "asistencia_perfecta_meses": {
      const scoresmensuales = await prisma.gamificacionScoreGuardia.findMany({
        where: { guardiaId, tenantId, periodoTipo: "mensual", scoreAsistencia: { gte: 95 } },
        select: { id: true },
      });
      return scoresmensuales.length >= condicionValor;
    }

    case "reconocimientos_recibidos": {
      const count = await prisma.gamificacionReconocimiento.count({
        where: { receptorId: guardiaId, tenantId },
      });
      return count >= condicionValor;
    }

    case "reconocimientos_dados": {
      const count = await prisma.gamificacionReconocimiento.count({
        where: { dadorId: guardiaId, tenantId },
      });
      return count >= condicionValor;
    }

    case "examenes_perfectos":
    case "examen_perfecto": {
      const count = await prisma.examAssignment.count({
        where: { guardId: guardiaId, status: "completed", score: { gte: 90 } },
      });
      return count >= condicionValor;
    }

    default:
      return false;
  }
}
