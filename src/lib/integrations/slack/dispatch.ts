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
import { buildNotificationBlocks } from "./blocks";
import { slackPostMessage, SlackApiError } from "./api";

interface DispatchInput {
  tenantId: string;
  typeDef: UnifiedNotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}

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
  } catch (err) {
    const reason = err instanceof SlackApiError ? err.slackError : String(err);
    console.error("[slack] envío inmediato falló, queda para reintento:", reason);
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { status: "FAILED", attempts: 1, lastError: reason },
    });
  }
}
