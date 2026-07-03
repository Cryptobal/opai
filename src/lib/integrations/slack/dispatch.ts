/**
 * Despacho de notificaciones del catálogo unificado hacia Slack.
 *
 * Se engancha UNA vez por llamada a `notify()`, a nivel tenant (ruteo
 * evento→canal), no por usuario. Corre en `after()` para no bloquear.
 * Tenants sin Slack: return inmediato, cero costo relevante.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { UnifiedNotificationType } from "@/lib/notifications/catalog";
import { getWorkspaceForTenant } from "./workspace";
import { buildNotificationBlocks, ticketActionsBlock, ticketCardActionsBlock, toContextFields } from "./blocks";
import { enrichTicketFields } from "./card-enrich";
import { slackPostMessage, SlackApiError, isPermanentSlackError } from "./api";

interface DispatchInput {
  tenantId: string;
  typeDef: UnifiedNotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
}

/** TTL amplio: la aprobación de ticket puede tardar días (el estado real manda). */
const TICKET_PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Resuelve el canal destino con precedencia KEY > CATEGORY > MODULE > default. */
async function resolveChannel(
  tenantId: string,
  typeDef: UnifiedNotificationType,
  defaultChannelId: string | null,
): Promise<string | null> {
  const routes = await prisma.slackChannelRoute.findMany({
    where: {
      tenantId,
      enabled: true,
      OR: [
        { matchType: "KEY", matchValue: typeDef.key },
        { matchType: "CATEGORY", matchValue: typeDef.category },
        { matchType: "MODULE", matchValue: typeDef.module },
      ],
    },
    select: { matchType: true, channelId: true },
  });
  const byType = (t: string) => routes.find((r) => r.matchType === t)?.channelId;
  // Más específico gana: un evento (KEY) sobre su categoría, y la categoría sobre
  // todo el módulo. Sin regla → canal por defecto del workspace.
  return byType("KEY") ?? byType("CATEGORY") ?? byType("MODULE") ?? defaultChannelId;
}

export async function dispatchSlackForNotification(input: DispatchInput): Promise<void> {
  const workspace = await getWorkspaceForTenant(input.tenantId);
  if (!workspace) return; // tenant sin Slack conectado

  const channelId = await resolveChannel(input.tenantId, input.typeDef, workspace.defaultChannelId);
  if (!channelId) return; // sin ruta ni canal por defecto

  // Tickets: dispatch tiene el id pero no el objeto → carga curada por ticketId.
  // Los demás eventos usan el renderer genérico sobre el data ya enriquecido en origen.
  const cardTicketId =
    input.typeDef.key.startsWith("ticket_") && typeof input.data?.ticketId === "string"
      ? (input.data.ticketId as string)
      : null;
  const ticketFields = cardTicketId ? await enrichTicketFields(input.tenantId, cardTicketId, workspace) : [];

  const { text, blocks } = buildNotificationBlocks({
    title: input.title,
    body: input.body,
    category: input.typeDef.category,
    phone: typeof input.data?.phone === "string" ? input.data.phone : null,
    fields: ticketFields.length ? ticketFields : toContextFields(input.data),
    link: input.link,
    critical: input.typeDef.critical,
  });

  // Gestión del ticket desde su tarjeta (excepto la de aprobación, que ya trae
  // Aprobar/Rechazar): Comentar · Estado · Aplazar/Pausar SLA · Silenciar.
  if (cardTicketId && input.typeDef.key !== "ticket_needs_approval") {
    const code = typeof input.data?.code === "string" ? input.data.code : cardTicketId;
    blocks.push(ticketCardActionsBlock(cardTicketId, code));
  }

  const ticketId =
    input.typeDef.key === "ticket_needs_approval" && typeof input.data?.ticketId === "string"
      ? (input.data.ticketId as string)
      : null;

  // Hilo por ticket (Fase 7): cualquier evento ticket_* con data.ticketId cae en
  // el hilo de ese ticket. La tarjeta de creación establece la raíz.
  const threadTicketId =
    input.typeDef.key.startsWith("ticket_") && typeof input.data?.ticketId === "string"
      ? (input.data.ticketId as string)
      : null;
  let threadTs: string | undefined;
  if (threadTicketId) {
    const th = await prisma.ticketSlackThread.findUnique({
      where: { ticketId: threadTicketId },
      select: { slackTs: true },
    });
    threadTs = th?.slackTs;
  }

  // Dedupe en ráfagas: mismo (tenant, key, title) dentro del mismo minuto. Para
  // aprobaciones se incluye el ticketId, así dos tickets distintos con el mismo
  // título en el mismo minuto NO colisionan (perderían sus botones).
  const minute = Math.floor(Date.now() / 60000);
  const dedupeMaterial = ticketId
    ? `${input.tenantId}|${input.typeDef.key}|${input.title}|t:${ticketId}|${minute}`
    : `${input.tenantId}|${input.typeDef.key}|${input.title}|${minute}`;
  const dedupeKey = createHash("sha1").update(dedupeMaterial).digest("hex");

  let outboxId: string;
  try {
    const row = await prisma.slackOutbox.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: workspace.id,
        channelId,
        payload: { text, blocks, thread_ts: threadTs } as object,
        dedupeKey,
        status: "PENDING",
      },
      select: { id: true },
    });
    outboxId = row.id;
  } catch (err) {
    // P2002 = choque de unique (dedupe): otra notificación idéntica ya encolada.
    if ((err as { code?: string }).code === "P2002") return;
    throw err;
  }

  // Ticket pendiente de aprobación: se crea la SlackPendingAction DESPUÉS de
  // pasar el dedupe (evita huérfanas), se adjuntan los botones Aprobar/Rechazar
  // y se re-persiste el payload del outbox con los botones incluidos.
  let ticketPendingId: string | null = null;
  if (ticketId) {
    const pa = await prisma.slackPendingAction.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: workspace.id,
        kind: "TICKET_APPROVAL",
        entityId: ticketId,
        requestedBySlackUserId: "system",
        channelId,
        status: "PENDING",
        expiresAt: new Date(Date.now() + TICKET_PENDING_TTL_MS),
      },
      select: { id: true },
    });
    ticketPendingId = pa.id;
    blocks.push(ticketActionsBlock(ticketPendingId));
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { payload: { text, blocks, thread_ts: threadTs } as object },
    });
  }

  // Intento de envío inmediato; el cron reintenta los que queden FAILED.
  try {
    const { ts } = await slackPostMessage(workspace.botToken, {
      channel: channelId,
      text,
      blocks,
      thread_ts: threadTs,
    });
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { status: "SENT", sentAt: new Date(), slackTs: ts },
    });
    // Ancla la tarjeta de aprobación al mensaje publicado para actualizarla al decidir.
    if (ticketPendingId && ts) {
      await prisma.slackPendingAction.update({ where: { id: ticketPendingId }, data: { messageTs: ts } });
    }
    // Raíz del hilo: solo la tarjeta de creación (sin hilo previo) queda de ancla.
    if (threadTicketId && !threadTs && input.typeDef.key === "ticket_created" && ts) {
      await prisma.ticketSlackThread
        .create({ data: { tenantId: input.tenantId, ticketId: threadTicketId, slackChannelId: channelId, slackTs: ts } })
        .catch(() => {});
    }
  } catch (err) {
    const reason = err instanceof SlackApiError ? err.slackError : String(err);
    const permanent = err instanceof SlackApiError && isPermanentSlackError(err.slackError);
    console.error(
      permanent
        ? "[slack] envío falló con error permanente, sin reintentos:"
        : "[slack] envío inmediato falló, queda para reintento:",
      reason,
    );
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      // permanent → attempts al tope: el cron (attempts < 5) no lo vuelve a tomar.
      data: { status: "FAILED", attempts: permanent ? 5 : 1, lastError: reason },
    });
  }
}
