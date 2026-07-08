/**
 * Publicador de las tarjetas de cierre (rondas + control nocturno) al canal del
 * módulo ops del workspace — el mismo canal que recibe los correos. Best-effort:
 * nunca lanza. Resuelve por ruta MODULE 'ops' y cae al canal por defecto.
 */

import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "./workspace";
import { slackPostMessage } from "./api";

async function resolveOpsChannel(tenantId: string): Promise<{ token: string; channelId: string } | null> {
  const workspace = await getWorkspaceForTenant(tenantId);
  if (!workspace) return null;
  const route = await prisma.slackChannelRoute.findFirst({
    where: { tenantId, enabled: true, matchType: "MODULE", matchValue: "ops" },
    select: { channelId: true },
  });
  const channelId = route?.channelId ?? workspace.defaultChannelId;
  if (!channelId) return null;
  return { token: workspace.botToken, channelId };
}

/** Publica una tarjeta {text, blocks} al canal ops. Best-effort. */
export async function publishOpsCierreCard(
  tenantId: string,
  card: { text: string; blocks: unknown[] },
): Promise<void> {
  try {
    const dest = await resolveOpsChannel(tenantId);
    if (!dest) return;
    await slackPostMessage(dest.token, { channel: dest.channelId, text: card.text, blocks: card.blocks });
  } catch (err) {
    console.error("[slack] publishOpsCierreCard falló:", err);
  }
}
