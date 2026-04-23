import type { Prisma } from "@prisma/client";

/**
 * Data for a scheduled (programada) ronda execution before any guard starts it.
 *
 * `guardiaId` is null until `/api/portal/rondas/iniciar` or the first marcación
 * assigns the guard.
 *
 * `installationId` MUST be provided from the linked `rondaTemplate.installationId`.
 * Persisting it on the execution keeps downstream queries (portal cliente,
 * reportes, monitoreo) fast and consistent — otherwise those rows only link
 * the installation via the template relation and many filters miss them.
 */
export function pendingProgramadaEjecucion(
  input: {
    tenantId: string;
    rondaTemplateId: string;
    programacionId: string;
    scheduledAt: Date;
    checkpointsTotal: number;
    installationId: string | null;
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
    installationId: input.installationId,
  };
}
