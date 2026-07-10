/**
 * Publicador de la tarjeta "Cierre de supervisión" al canal de Slack puenteado
 * a la instalación de la visita (SlackChannelLink). Best-effort: nunca lanza.
 * Si la instalación no tiene puente, no publica — no cae al canal de
 * notificaciones ni al módulo ops. Flag por tenant `reporteSupervisionSlackEnabled`
 * (tabla Setting): solo "false" explícito la apaga.
 */

import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "./workspace";
import { resolveInstallationSlackChannel } from "./installation-channel";
import { slackPostMessage } from "./api";

/** Flag por tenant (tabla Setting). Solo "false" explícito apaga. Fail-open. */
async function isSupervisionSlackEnabled(tenantId: string): Promise<boolean> {
  try {
    const s = await prisma.setting.findFirst({
      where: { key: "reporteSupervisionSlackEnabled", tenantId },
      select: { value: true },
    });
    return s?.value !== "false";
  } catch {
    return true;
  }
}

/** Publica la tarjeta de cierre de supervisión al canal Slack de la instalación. Best-effort. */
export async function publishSupervisionCierreCard(
  tenantId: string,
  installationId: string,
  card: { text: string; blocks: unknown[] },
): Promise<void> {
  try {
    const enabled = await isSupervisionSlackEnabled(tenantId);
    if (!enabled) return;

    const workspace = await getWorkspaceForTenant(tenantId);
    if (!workspace) return;

    const channelId = await resolveInstallationSlackChannel(tenantId, installationId);
    if (!channelId) return;

    await slackPostMessage(workspace.botToken, {
      channel: channelId,
      text: card.text,
      blocks: card.blocks,
    });
  } catch (err) {
    console.error("[slack] publishSupervisionCierreCard falló:", err);
  }
}
