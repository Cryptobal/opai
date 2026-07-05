import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Instalación operativa = status CRM `active` (prospect/inactive no generan rondas ni notificaciones). */
export function isInstallationOperationallyActive(status: string): boolean {
  return status === "active";
}

/** Filtro Prisma: programaciones cuya instalación sigue operativa. */
export const onlyActiveInstallationProgramacion: Prisma.OpsRondaProgramacionWhereInput = {
  isActive: true,
  rondaTemplate: { installation: { status: "active" } },
};

export type InstallationShutdownResult = {
  programacionesDeactivated: number;
  pendingEjecucionesDeleted: number;
  chatChannelsDeactivated: number;
  slackLinksDisabled: number;
};

/**
 * Apaga chat, puentes Slack, programación de rondas y slots pendientes futuros
 * cuando una instalación deja de estar operativa (inactive/prospect).
 * Idempotente: seguro llamar más de una vez.
 */
export async function shutdownInstallationOperations(
  tenantId: string,
  installationId: string,
  tx?: Prisma.TransactionClient,
): Promise<InstallationShutdownResult> {
  const db = tx ?? prisma;
  const now = new Date();

  const templates = await db.opsRondaTemplate.findMany({
    where: { tenantId, installationId },
    select: { id: true },
  });
  const templateIds = templates.map((t) => t.id);

  let programacionesDeactivated = 0;
  let pendingEjecucionesDeleted = 0;

  if (templateIds.length > 0) {
    const progResult = await db.opsRondaProgramacion.updateMany({
      where: { tenantId, rondaTemplateId: { in: templateIds }, isActive: true },
      data: { isActive: false },
    });
    programacionesDeactivated = progResult.count;

    const deleted = await db.opsRondaEjecucion.deleteMany({
      where: {
        tenantId,
        status: "pendiente",
        scheduledAt: { gte: now },
        OR: [
          { installationId },
          { rondaTemplateId: { in: templateIds } },
        ],
      },
    });
    pendingEjecucionesDeleted = deleted.count;
  } else {
    const deleted = await db.opsRondaEjecucion.deleteMany({
      where: {
        tenantId,
        installationId,
        status: "pendiente",
        scheduledAt: { gte: now },
      },
    });
    pendingEjecucionesDeleted = deleted.count;
  }

  const chatResult = await db.chatChannel.updateMany({
    where: { tenantId, installationId },
    data: { isActive: false },
  });

  const channelIds = await db.chatChannel.findMany({
    where: { tenantId, installationId },
    select: { id: true },
  });

  let slackLinksDisabled = 0;
  if (channelIds.length > 0) {
    const slackResult = await db.slackChannelLink.updateMany({
      where: {
        tenantId,
        chatChannelId: { in: channelIds.map((c) => c.id) },
        enabled: true,
      },
      data: { enabled: false },
    });
    slackLinksDisabled = slackResult.count;
  }

  return {
    programacionesDeactivated,
    pendingEjecucionesDeleted,
    chatChannelsDeactivated: chatResult.count,
    slackLinksDisabled,
  };
}

/**
 * Limpieza idempotente para instalaciones ya inactivas/prospect con drift
 * operativo (programaciones activas, slots pendientes, chat o Slack encendidos).
 * Lo invoca el cron generar cada 10 min.
 */
export async function repairInactiveInstallationOperations(
  now: Date = new Date(),
): Promise<void> {
  await prisma.opsRondaProgramacion.updateMany({
    where: {
      isActive: true,
      rondaTemplate: { installation: { status: { not: "active" } } },
    },
    data: { isActive: false },
  });

  await prisma.opsRondaEjecucion.deleteMany({
    where: {
      status: "pendiente",
      scheduledAt: { gte: now },
      OR: [
        { installation: { status: { not: "active" } } },
        {
          installationId: null,
          rondaTemplate: { installation: { status: { not: "active" } } },
        },
      ],
    },
  });

  await prisma.crmInstallation.updateMany({
    where: { status: { not: "active" }, OR: [{ chatEnabled: true }, { nocturnoEnabled: true }] },
    data: { chatEnabled: false, nocturnoEnabled: false },
  });

  await prisma.chatChannel.updateMany({
    where: { installation: { status: { not: "active" } }, isActive: true },
    data: { isActive: false },
  });

  const inactiveChannelIds = await prisma.chatChannel.findMany({
    where: { installation: { status: { not: "active" } } },
    select: { id: true },
  });
  if (inactiveChannelIds.length > 0) {
    await prisma.slackChannelLink.updateMany({
      where: {
        chatChannelId: { in: inactiveChannelIds.map((c) => c.id) },
        enabled: true,
      },
      data: { enabled: false },
    });
  }
}

/** Valida que la instalación exista y esté operativa (para portal/API de rondas). */
export async function assertInstallationOperationallyActive(
  tenantId: string,
  installationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inst = await prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    select: { status: true },
  });
  if (!inst || !isInstallationOperationallyActive(inst.status)) {
    return { ok: false, error: "Instalación inactiva o no operativa" };
  }
  return { ok: true };
}
