/**
 * Resuelve el canal de Slack puenteado al chat de una instalación.
 *
 * Cadena: CrmInstallation → ChatChannel (INSTALLATION) → SlackChannelLink (enabled).
 */

import { prisma } from "@/lib/prisma";

/** Eventos de ronda que se duplican al canal Slack de su instalación (si existe puente). */
export const RONDA_INSTALLATION_ROUTE_KEYS = new Set([
  "ronda_started",
  "ronda_completed",
  "ronda_overdue_admin",
  "ronda_failed",
]);

export async function resolveInstallationSlackChannel(
  tenantId: string,
  installationId: string,
): Promise<string | null> {
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
