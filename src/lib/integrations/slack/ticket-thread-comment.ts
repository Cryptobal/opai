/**
 * Comentar un ticket respondiendo su hilo de Slack (Fase 7, Bloque 6).
 *
 * Un reply humano en el hilo raíz de un ticket (patrón bridge-inbound: se busca
 * `TicketSlackThread` por (canal, thread_ts)) → comentario real en OPAI con el
 * autor vinculado. Ignora mensajes del bot; usuarios sin vínculo reciben un
 * efímero para vincularse. Devuelve true si el evento era de un hilo de ticket
 * (para que el flujo de eventos NO lo trate además como puente/bot).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "./workspace";
import { resolveLinkedAdmin, buildLinkPrompt } from "./user-link";
import { callSlack } from "./api";
import { logAudit } from "@/lib/audit";
import type { SlackBotEvent } from "./bot";

function cleanSlackText(t: string): string {
  return t
    .replace(/<@[A-Z0-9]+>/g, "@usuario")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function handleTicketThreadComment(tenantId: string, event: SlackBotEvent): Promise<boolean> {
  if (event.bot_id || event.subtype) return false;
  if (!event.channel || !event.thread_ts || !event.user || !event.text) return false;
  if (event.thread_ts === event.ts) return false; // el root mismo, no un reply

  const thread = await prisma.ticketSlackThread.findFirst({
    where: { tenantId, slackChannelId: event.channel, slackTs: event.thread_ts },
    select: { ticketId: true },
  });
  if (!thread) return false; // no es un hilo de ticket → que lo maneje el puente/bot

  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return true;

  const linked = await resolveLinkedAdmin(ws, event.user);
  if (!linked) {
    const prompt = buildLinkPrompt(ws, event.user);
    await callSlack(
      "chat.postEphemeral",
      { channel: event.channel, user: event.user, text: prompt.text, blocks: prompt.blocks },
      ws.botToken,
    ).catch(() => {});
    return true;
  }

  const body = cleanSlackText(event.text);
  if (!body) return true;
  const { addTicketComment } = await import("@/lib/tickets-mutations");
  const r = await addTicketComment({ tenantId, actorId: linked.adminId, ticketId: thread.ticketId, body });
  if (r.ok) {
    await logAudit({
      action: "UPDATE", entity: "OpsTicket", entityId: thread.ticketId, tenantId,
      userId: linked.adminId, details: { via: "slack_thread_comment", commentId: r.commentId },
    }).catch(() => {});
    // Feedback: reacción ✅ (requiere reactions:write; si falta, silencioso).
    await callSlack("reactions.add", { channel: event.channel, timestamp: event.ts, name: "white_check_mark" }, ws.botToken).catch(() => {});
  }
  return true;
}
