/**
 * Helper idempotente para asegurar el canal de chat INSTALLATION (reportes)
 * de una instalación. Única vía de creación de canales INSTALLATION.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

export const INSTALLATION_CHANNEL_SUBTYPE = "reportes" as const;

type DbClient = Prisma.TransactionClient | PrismaClient;

export function installationChannelName(installationName: string): string {
  return `${installationName} - Reportes`;
}

/**
 * Upsert del canal INSTALLATION con subType=reportes.
 * Exige tenantId explícito (no lo infiere del request).
 */
export async function ensureInstallationChannel(args: {
  client: DbClient;
  tenantId: string;
  installationId: string;
  installationName: string;
  /** Si true, reactiva el canal (isActive=true). Por defecto solo actualiza el nombre. */
  activate?: boolean;
}): Promise<{ id: string; created: boolean }> {
  const {
    client,
    tenantId,
    installationId,
    installationName,
    activate = false,
  } = args;

  const subType = INSTALLATION_CHANNEL_SUBTYPE;
  const name = installationChannelName(installationName);

  const existing = await client.chatChannel.findUnique({
    where: {
      installationId_subType: { installationId, subType },
    },
    select: { id: true },
  });

  const channel = await client.chatChannel.upsert({
    where: {
      installationId_subType: { installationId, subType },
    },
    create: {
      tenantId,
      channelType: "INSTALLATION",
      installationId,
      subType,
      name,
      ...(activate ? { isActive: true } : {}),
    },
    update: activate ? { isActive: true, name } : { name },
    select: { id: true },
  });

  return { id: channel.id, created: !existing };
}
