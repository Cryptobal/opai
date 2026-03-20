import type { Prisma } from "@prisma/client";

/**
 * Data for a scheduled (programada) ronda execution before any guard starts it.
 * guardiaId is null until /api/portal/rondas/iniciar or first marcar assigns the guard.
 */
export function pendingProgramadaEjecucion(
  input: {
    tenantId: string;
    rondaTemplateId: string;
    programacionId: string;
    scheduledAt: Date;
    checkpointsTotal: number;
  },
): Prisma.OpsRondaEjecucionCreateManyInput {
  return {
    tenantId: input.tenantId,
    rondaTemplateId: input.rondaTemplateId,
    programacionId: input.programacionId,
    guardiaId: null,
    status: "pendiente",
    scheduledAt: input.scheduledAt,
    checkpointsTotal: input.checkpointsTotal,
    checkpointsCompletados: 0,
    porcentajeCompletado: 0,
    trustScore: 0,
  };
}
