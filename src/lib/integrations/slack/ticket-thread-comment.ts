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
import { getWorkspaceForTenant, type ActiveWorkspace } from "./workspace";
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

/**
 * Menciones Slack→OPAI: reemplaza cada `<@U...>` por `@Nombre` del admin vinculado
 * (el humano ya pingó nativo en Slack) y devuelve los adminIds mencionados para
 * notificarlos en OPAI. Los no vinculados quedan como `@usuario`.
 */
async function resolveInboundMentions(
  text: string,
  ws: ActiveWorkspace,
): Promise<{ text: string; adminIds: string[] }> {
  const ids: string[] = [];
  let out = text;
  for (const mth of text.matchAll(/<@([A-Z0-9]+)>/g)) {
    const link = await prisma.slackUserLink.findUnique({
      where: { workspaceId_slackUserId: { workspaceId: ws.id, slackUserId: mth[1] } },
      select: { adminId: true },
    });
    const admin = link
      ? await prisma.admin.findFirst({ where: { id: link.adminId, tenantId: ws.tenantId, status: "active" }, select: { name: true } })
      : null;
    if (link && admin?.name) {
      out = out.split(mth[0]).join(`@${admin.name}`);
      ids.push(link.adminId);
    }
  }
  return { text: out, adminIds: [...new Set(ids)] };
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

  const mentions = await resolveInboundMentions(event.text, ws);
  const body = cleanSlackText(mentions.text);
  if (!body) return true;
  const { addTicketComment } = await import("@/lib/tickets-mutations");
  const r = await addTicketComment({ tenantId, actorId: linked.adminId, ticketId: thread.ticketId, body });
  if (r.ok) {
    await logAudit({
      action: "UPDATE", entity: "OpsTicket", entityId: thread.ticketId, tenantId,
      userId: linked.adminId, details: { via: "slack_thread_comment", commentId: r.commentId },
    }).catch(() => {});
    // Mención real al admin en OPAI. El origen ya es Slack (ya pingó nativo), así
    // que skipSlack evita re-postear el comentario en su propio hilo.
    const targets = mentions.adminIds.filter((id) => id !== linked.adminId);
    if (targets.length > 0) {
      const t = await prisma.opsTicket.findFirst({ where: { id: thread.ticketId, tenantId }, select: { code: true } });
      const { notify } = await import("@/lib/notifications/notify");
      await notify({
        tenantId,
        type: "ticket_mention",
        targetIds: targets,
        targetType: "ADMIN",
        title: `Te mencionaron en ticket ${t?.code ?? ""}`,
        body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
        link: `/ops/tickets/${thread.ticketId}`,
        data: { ticketId: thread.ticketId, commentId: r.commentId, source: "slack_thread", skipSlack: true },
      }).catch(() => {});
    }
    // Feedback: reacción ✅ (requiere reactions:write; si falta, silencioso).
    await callSlack("reactions.add", { channel: event.channel, timestamp: event.ts, name: "white_check_mark" }, ws.botToken).catch(() => {});
  }
  return true;
}
