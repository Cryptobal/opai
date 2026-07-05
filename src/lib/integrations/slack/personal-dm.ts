/**
 * Canal Slack PERSONAL (Fase 6): envía una notificación como DM del bot al
 * usuario, si tiene `SlackUserLink` y activó el canal `slack` para ese tipo.
 *
 * Capa distinta del ruteo tenant→canal compartido. Si hay ruteo explícito
 * (evento/categoría/módulo), notify() omite el DM para no duplicar. Reusa el
 * `SlackOutbox` (misma confiabilidad + cron). El gate de quiet hours ya viene
 * aplicado en `resolvePrefs` (slack=false en No molestar salvo crítico).
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "./workspace";
import { slackOpenDm } from "./api";
import { buildNotificationBlocks } from "./blocks";
import { enqueueOutboxRow, trySendOutboxRow } from "./outbox";

export interface PersonalDmInput {
  tenantId: string;
  adminId: string;
  typeKey: string;
  title: string;
  body?: string | null;
  category: string;
  link?: string | null;
  critical?: boolean;
  phone?: string | null;
}

export async function dispatchPersonalSlackDm(input: PersonalDmInput): Promise<void> {
  const ws = await getWorkspaceForTenant(input.tenantId);
  if (!ws) return; // tenant sin workspace Slack activo

  // Reverse lookup adminId → vínculo (columna aditiva dmChannelId cacheada).
  const link = await prisma.slackUserLink.findFirst({
    where: { workspaceId: ws.id, adminId: input.adminId },
    select: { id: true, slackUserId: true, dmChannelId: true },
  });
  if (!link) return; // sin vínculo → sin DM (la UI ya deshabilita la columna)

  let dmChannelId = link.dmChannelId;
  if (!dmChannelId) {
    dmChannelId = await slackOpenDm(ws.botToken, link.slackUserId);
    if (!dmChannelId) return;
    await prisma.slackUserLink.update({ where: { id: link.id }, data: { dmChannelId } }).catch(() => {});
  }

  const { text, blocks } = buildNotificationBlocks({
    title: input.title,
    body: input.body,
    category: input.category,
    link: input.link,
    critical: input.critical,
    phone: input.phone,
  });

  // Dedupe por (dm, tipo, título) dentro del minuto — evita duplicar reintentos.
  const minute = Math.floor(Date.now() / 60000);
  const dedupeKey = createHash("sha1")
    .update(`dm|${dmChannelId}|${input.typeKey}|${input.title}|${minute}`)
    .digest("hex");

  const outboxId = await enqueueOutboxRow({
    tenantId: input.tenantId,
    workspaceId: ws.id,
    channelId: dmChannelId,
    text,
    blocks,
    dedupeKey,
  });
  if (!outboxId) return; // dedupe: ya encolado
  await trySendOutboxRow(ws.botToken, outboxId, dmChannelId, text, blocks);
}
