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
import { buildNotificationBlocks, ticketActionsBlock } from "./blocks";
import { slackPostMessage, SlackApiError } from "./api";

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

/** Resuelve el canal destino con precedencia KEY > MODULE > default. */
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
        { matchType: "MODULE", matchValue: typeDef.module },
      ],
    },
    select: { matchType: true, channelId: true },
  });
  const keyRoute = routes.find((r) => r.matchType === "KEY");
  if (keyRoute) return keyRoute.channelId;
  const moduleRoute = routes.find((r) => r.matchType === "MODULE");
  if (moduleRoute) return moduleRoute.channelId;
  return defaultChannelId;
}

export async function dispatchSlackForNotification(input: DispatchInput): Promise<void> {
  const workspace = await getWorkspaceForTenant(input.tenantId);
  if (!workspace) return; // tenant sin Slack conectado

  const channelId = await resolveChannel(input.tenantId, input.typeDef, workspace.defaultChannelId);
  if (!channelId) return; // sin ruta ni canal por defecto

  const { text, blocks } = buildNotificationBlocks({
    title: input.title,
    body: input.body,
    category: input.typeDef.category,
    link: input.link,
    critical: input.typeDef.critical,
  });

  // Ticket pendiente de aprobación: adjunta botones Aprobar/Rechazar sobre una
  // SlackPendingAction (kind TICKET_APPROVAL). La firma de la acción es su id.
  let ticketPendingId: string | null = null;
  const ticketId =
    input.typeDef.key === "ticket_needs_approval" && typeof input.data?.ticketId === "string"
      ? (input.data.ticketId as string)
      : null;
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
  }

  // Dedupe en ráfagas: mismo (tenant, key, title) dentro del mismo minuto.
  const minute = Math.floor(Date.now() / 60000);
  const dedupeKey = createHash("sha1")
    .update(`${input.tenantId}|${input.typeDef.key}|${input.title}|${minute}`)
    .digest("hex");

  let outboxId: string;
  try {
    const row = await prisma.slackOutbox.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: workspace.id,
        channelId,
        payload: { text, blocks } as object,
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

  // Intento de envío inmediato; el cron reintenta los que queden FAILED.
  try {
    const { ts } = await slackPostMessage(workspace.botToken, { channel: channelId, text, blocks });
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { status: "SENT", sentAt: new Date(), slackTs: ts },
    });
    // Ancla la tarjeta de aprobación al mensaje publicado para actualizarla al decidir.
    if (ticketPendingId && ts) {
      await prisma.slackPendingAction.update({ where: { id: ticketPendingId }, data: { messageTs: ts } });
    }
  } catch (err) {
    const reason = err instanceof SlackApiError ? err.slackError : String(err);
    console.error("[slack] envío inmediato falló, queda para reintento:", reason);
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { status: "FAILED", attempts: 1, lastError: reason },
    });
  }
}
