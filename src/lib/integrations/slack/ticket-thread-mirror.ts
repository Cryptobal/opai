/**
 * Espejo de comentarios OPAI → hilo de Slack del ticket (Fase 14).
 *
 * Cuando un ticket tiene `TicketSlackThread` (su hilo raíz), cada comentario —
 * venga de la web, de la tarjeta/bandeja de Slack o de cualquier origen — se
 * postea como REPLY bajo la raíz. Así el hilo se vuelve el feed de actividad:
 * llega un recordatorio nuevo y las conversaciones previas están ahí mismo.
 *
 * Identidad: si el autor está vinculado a Slack, se usa su nombre/avatar nativo
 * (chat:write.customize); si no, se postea como el bot con "*Nombre:* texto".
 *
 * NO se llama desde el reply-en-hilo de Slack (ese comentario YA vive en el hilo);
 * ese camino queda cubierto por `handleTicketThreadComment`.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "./workspace";
import { slackPostMessage, slackGetUserProfile } from "./api";

export async function mirrorCommentToSlackThread(input: {
  tenantId: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal?: boolean;
}): Promise<void> {
  const text = input.body.trim();
  if (!text) return;

  const thread = await prisma.ticketSlackThread.findUnique({
    where: { ticketId: input.ticketId },
    select: { slackChannelId: true, slackTs: true },
  });
  if (!thread) return; // el ticket aún no tiene hilo en Slack

  const ws = await getWorkspaceForTenant(input.tenantId);
  if (!ws) return;

  const admin = await prisma.admin
    .findFirst({ where: { id: input.authorId, tenantId: input.tenantId }, select: { name: true } })
    .catch(() => null);
  const authorName = admin?.name ?? "Alguien";

  // Identidad nativa del autor si está vinculado (avatar + nombre del workspace).
  let username: string | undefined;
  let iconUrl: string | undefined;
  const link = await prisma.slackUserLink
    .findFirst({ where: { workspaceId: ws.id, adminId: input.authorId }, select: { slackUserId: true } })
    .catch(() => null);
  if (link) {
    const profile = await slackGetUserProfile(ws.botToken, link.slackUserId).catch(() => null);
    if (profile) {
      username = profile.displayName;
      iconUrl = profile.avatarUrl ?? undefined;
    }
  }

  const emoji = input.isInternal ? "🔒" : "💬";
  const line = username ? `${emoji} ${text}` : `${emoji} *${authorName}:* ${text}`;
  await slackPostMessage(ws.botToken, {
    channel: thread.slackChannelId,
    text: line.slice(0, 3000),
    thread_ts: thread.slackTs,
    username,
    icon_url: iconUrl,
  }).catch((e) => console.error("[slack] mirrorCommentToSlackThread falló:", e));
}
