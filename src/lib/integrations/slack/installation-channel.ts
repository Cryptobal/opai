/**
 * Resuelve el canal de Slack puenteado al chat de una instalación.
 *
 * Cadena: CrmInstallation → ChatChannel (INSTALLATION) → SlackChannelLink (enabled).
 */

import { prisma } from "@/lib/prisma";
import { isInstallationOperationallyActive } from "@/lib/crm/installation-operational-shutdown";

/** Eventos de ronda que prefieren el canal Slack de su instalación (si existe puente). */
export const RONDA_INSTALLATION_ROUTE_KEYS = new Set([
  "ronda_started",
  "ronda_completed",
  "ronda_overdue_admin",
  "ronda_failed",
]);

/** Eventos de marcación que prefieren el canal Slack de su instalación (si existe puente). */
export const MARCACION_INSTALLATION_ROUTE_KEYS = new Set([
  "marcacion_fuera_rango",
]);

export async function resolveInstallationSlackChannel(
  tenantId: string,
  installationId: string,
): Promise<string | null> {
  const installation = await prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    select: { status: true, chatEnabled: true },
  });
  if (
    !installation ||
    !isInstallationOperationallyActive(installation.status) ||
    !installation.chatEnabled
  ) {
    return null;
  }

  const chatChannel = await prisma.chatChannel.findFirst({
    where: {
      tenantId,
      installationId,
      isActive: true,
      channelType: "INSTALLATION",
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!chatChannel) return null;

  const link = await prisma.slackChannelLink.findFirst({
    where: { tenantId, chatChannelId: chatChannel.id, enabled: true },
    select: { slackChannelId: true },
  });
  return link?.slackChannelId ?? null;
}
