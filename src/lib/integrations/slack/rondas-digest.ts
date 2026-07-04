/**
 * Digest diario de cumplimiento de rondas en Slack (Fase 19).
 *
 * UN mensaje por tenant en el canal ruteado para `rondas_daily_digest`
 * (Operaciones - Rondas): "🛡️ Rondas de ayer: NN% cumplimiento" + desglose por
 * instalación ordenado de peor a mejor con semáforo, top 10 líneas + "…y N más",
 * y botón URL "Ver reportes". Idempotente por (tenant, día) vía dedupe del outbox.
 */

import { getUnifiedType } from "@/lib/notifications/catalog";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getWorkspaceForTenant } from "./workspace";
import { enqueueOutboxRow, trySendOutboxRow } from "./outbox";
import { resolveChannel } from "./dispatch";
import {
  digestHeadline,
  installationLine,
  type RondasDigestSummary,
} from "@/lib/rondas/daily-digest";
import type { RondasNotifPolicy } from "@/lib/rondas/notification-policy";

const MAX_LINES = 10;

export function buildRondasDigestBlocks(
  summary: RondasDigestSummary,
  policy: RondasNotifPolicy,
): { text: string; blocks: unknown[] } {
  const site = getCanonicalSiteUrl();
  const headline = digestHeadline(summary);
  const text = `🛡️ ${headline}`;

  const top = summary.installations.slice(0, MAX_LINES);
  const rest = summary.installations.length - top.length;

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: "🛡️ Cumplimiento de rondas", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${headline}*` } },
  ];
  if (top.length) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: top.map((i) => installationLine(i, policy)).join("\n") },
    });
  }
  if (rest > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `…y ${rest} instalación(es) más en los reportes` }],
    });
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Operaciones - Rondas · OPAI" }],
  });
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "📊 Ver reportes", emoji: true },
        url: `${site}/ops/rondas/reportes`,
        style: "primary",
      },
    ],
  });
  return { text, blocks };
}

/** Postea el digest al canal ruteado para `rondas_daily_digest`. Idempotente por día. */
export async function postRondasDigestToSlack(
  tenantId: string,
  summary: RondasDigestSummary,
  policy: RondasNotifPolicy,
  dayKey: string,
): Promise<boolean> {
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return false;
  const typeDef = getUnifiedType("rondas_daily_digest");
  if (!typeDef) return false;
  const channelId = await resolveChannel(tenantId, typeDef, ws.defaultChannelId);
  if (!channelId) return false;

  const { text, blocks } = buildRondasDigestBlocks(summary, policy);
  const id = await enqueueOutboxRow({
    tenantId,
    workspaceId: ws.id,
    channelId,
    text,
    blocks,
    dedupeKey: `rondas-daily-digest|${tenantId}|${dayKey}`,
  });
  if (!id) return false; // ya enviado hoy
  await trySendOutboxRow(ws.botToken, id, channelId, text, blocks);
  return true;
}
