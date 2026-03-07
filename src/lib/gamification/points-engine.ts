import { prisma } from "@/lib/prisma";
import type { GamificacionConfig } from "@prisma/client";
import type { EventoTipo, EventoDimension } from "./types";

interface EventoInput {
  guardiaId: string;
  tenantId: string;
  installationId?: string | null;
  tipo: EventoTipo;
  dimension: EventoDimension;
  descripcion: string;
  referenciaModelo?: string;
  referenciaId?: string;
  fecha?: Date;
}

const EVENT_POINTS: Record<EventoTipo, (config: GamificacionConfig) => number> = {
  ronda_perfecta: (c) => c.ptsRondaPerfecta,
  ronda_completada: (c) => c.ptsRondaCompletada,
  ronda_no_realizada: (c) => c.ptsRondaNoRealizada,
  entrada_puntual: (c) => c.ptsEntradaPuntual,
  salida_completa: (c) => c.ptsSalidaCompleta,
  tardanza: (c) => c.ptsTardanzaPenalizacion,
  inasistencia: (c) => c.ptsInasistenciaInjust,
  turno_extra: (c) => c.ptsTurnoExtra,
  marcacion_digital: (c) => c.ptsMarcacionDigital,
  eval_sobresaliente: (c) => c.ptsEvalSobresaliente,
  eval_buena: (c) => c.ptsEvalBuena,
  hallazgo_negativo: (c) => c.ptsHallazgoNegativo,
  examen_aprobado: (c) => c.ptsExamenAprobado,
  examen_perfecto: (c) => c.ptsExamenPerfecto,
  incidente_reportado: (c) => c.ptsIncidenteReportado,
  tarea_checkpoint: (c) => c.ptsTareaCheckpoint,
  reconocimiento_recibido: (c) => c.ptsReconocimientoRecibido,
  reconocimiento_dado: (c) => c.ptsReconocimientoDado,
  badge_desbloqueado: (c) => c.ptsBadgeDesbloqueado,
  racha_bonus: (c) => c.ptsBonusRacha7dias,
  semana_perfecta: (c) => c.ptsBonusSemanalPerfecta,
  asistencia_perfecta_mes: (c) => c.ptsAsistenciaPerfectaMes,
};

export async function registrarEvento(
  input: EventoInput,
  config: GamificacionConfig,
  puntosOverride?: number,
): Promise<{ id: string; puntos: number }> {
  const puntos = puntosOverride ?? EVENT_POINTS[input.tipo](config);

  if (puntos > 0) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const puntosHoy = await prisma.gamificacionEvento.aggregate({
      where: {
        guardiaId: input.guardiaId,
        tenantId: input.tenantId,
        fecha: { gte: hoy, lt: manana },
        puntos: { gt: 0 },
      },
      _sum: { puntos: true },
    });

    const acumuladoHoy = puntosHoy._sum.puntos ?? 0;
    if (acumuladoHoy >= config.maxPuntosDiarios) {
      const evento = await prisma.gamificacionEvento.create({
        data: {
          tenantId: input.tenantId,
          guardiaId: input.guardiaId,
          installationId: input.installationId ?? null,
          tipo: input.tipo,
          dimension: input.dimension,
          puntos: 0,
          descripcion: `${input.descripcion} (cap diario alcanzado)`,
          referenciaModelo: input.referenciaModelo ?? null,
          referenciaId: input.referenciaId ?? null,
          fecha: input.fecha ?? new Date(),
        },
      });
      return { id: evento.id, puntos: 0 };
    }
  }

  const evento = await prisma.gamificacionEvento.create({
    data: {
      tenantId: input.tenantId,
      guardiaId: input.guardiaId,
      installationId: input.installationId ?? null,
      tipo: input.tipo,
      dimension: input.dimension,
      puntos,
      descripcion: input.descripcion,
      referenciaModelo: input.referenciaModelo ?? null,
      referenciaId: input.referenciaId ?? null,
      fecha: input.fecha ?? new Date(),
    },
  });

  return { id: evento.id, puntos };
}
